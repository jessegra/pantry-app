<?php
declare(strict_types=1);

/** Tables the app syncs. Anything else is refused. */
const SYNC_TABLES = ['items', 'locations', 'groups', 'stores', 'listEntries', 'staples', 'categories', 'recipes'];
const PUSH_MAX = 500;
const PULL_MAX = 1000;
const RECORD_MAX_BYTES = 256 * 1024;

/**
 * Stores a batch of changes. A change only replaces what the server has when its
 * updatedAt is newer (newest change wins); older or repeated ones are ignored, so
 * re-sending a batch is harmless. Each stored change gets the next sequence number,
 * which is what devices pull by.
 */
function sync_push(PDO $pdo, array $body): array
{
    $changes = $body['changes'] ?? null;
    if (!is_array($changes) || !array_is_list($changes) || count($changes) > PUSH_MAX) {
        throw new HttpError(400, 'Expected changes: a list of up to ' . PUSH_MAX);
    }
    $clean = array_map('sync_validate_change', $changes);

    $accepted = 0;
    $pdo->beginTransaction();
    try {
        $find = $pdo->prepare('SELECT updated_at FROM records WHERE tbl = ? AND id = ? FOR UPDATE');
        $write = $pdo->prepare(
            'INSERT INTO records (tbl, id, data, deleted, updated_at, seq) VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE data = VALUES(data), deleted = VALUES(deleted),
               updated_at = VALUES(updated_at), seq = VALUES(seq)'
        );
        foreach ($clean as $c) {
            $find->execute([$c['tbl'], $c['id']]);
            $current = $find->fetchColumn();
            $find->closeCursor();
            if ($current !== false && (int) $current >= $c['updatedAt']) {
                continue;
            }
            $write->execute([$c['tbl'], $c['id'], $c['data'], $c['deleted'] ? 1 : 0, $c['updatedAt'], db_next_seq($pdo)]);
            $accepted++;
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['accepted' => $accepted, 'ignored' => count($clean) - $accepted];
}

function sync_validate_change(mixed $c): array
{
    if (!is_array($c)) {
        throw new HttpError(400, 'Each change must be an object');
    }
    $tbl = $c['tbl'] ?? null;
    $id = $c['id'] ?? null;
    $updatedAt = $c['updatedAt'] ?? null;
    $deleted = $c['deleted'] ?? false;
    if (!in_array($tbl, SYNC_TABLES, true)) {
        throw new HttpError(400, 'Unknown table');
    }
    if (!is_string($id) || $id === '' || strlen($id) > 64) {
        throw new HttpError(400, 'Bad id');
    }
    if (!is_int($updatedAt) || $updatedAt < 0) {
        throw new HttpError(400, 'Bad updatedAt');
    }
    if (!is_bool($deleted)) {
        throw new HttpError(400, 'Bad deleted');
    }
    $data = null;
    if (!$deleted) {
        if (!is_array($c['data'] ?? null) || (array_is_list($c['data']) && $c['data'] !== [])) {
            throw new HttpError(400, 'Each change needs a data object');
        }
        $data = json_encode($c['data'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
        if ($data === false || strlen($data) > RECORD_MAX_BYTES) {
            throw new HttpError(413, 'Record too large');
        }
    }
    return ['tbl' => $tbl, 'id' => $id, 'updatedAt' => $updatedAt, 'deleted' => $deleted, 'data' => $data];
}

/** Everything stored after `since` (a sequence number), oldest first. */
function sync_pull(PDO $pdo, array $query): array
{
    $since = filter_var($query['since'] ?? 0, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
    $limit = filter_var($query['limit'] ?? PULL_MAX, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => PULL_MAX]]);
    if ($since === false || $limit === false) {
        throw new HttpError(400, 'Bad since or limit');
    }
    $stmt = $pdo->prepare('SELECT tbl, id, data, deleted, updated_at, seq FROM records WHERE seq > ? ORDER BY seq LIMIT ?');
    $stmt->bindValue(1, $since, PDO::PARAM_INT);
    $stmt->bindValue(2, $limit + 1, PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll();
    $more = count($rows) > $limit;
    $rows = array_slice($rows, 0, $limit);

    $changes = array_map(static fn(array $r) => [
        'tbl' => $r['tbl'],
        'id' => $r['id'],
        'deleted' => (bool) $r['deleted'],
        'updatedAt' => (int) $r['updated_at'],
        'seq' => (int) $r['seq'],
        // Decoded as objects so an empty object stays {} and not [].
        'data' => $r['deleted'] ? null : json_decode((string) $r['data'], false),
    ], $rows);

    $cursor = $rows ? (int) end($rows)['seq'] : $since;
    return ['changes' => $changes, 'cursor' => $cursor, 'more' => $more];
}
