<?php
declare(strict_types=1);

// Signing in, and the people who can (docs/USERS_PLAN.md).

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const INVITE_TTL_MS = 24 * 3600 * 1000;
const PASSWORD_MIN = 8;
const NAME_MAX = 60;
// No look-alikes (0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A signed-in device: whose it is. */
final class Session
{
    public function __construct(public readonly string $tokenHash, public readonly int $userId)
    {
    }
}

/**
 * The first person comes from the config's household password. When that password
 * changes, it becomes their new password and only their devices are signed out
 * (the way back in if it's forgotten).
 */
function auth_check_password_version(PDO $pdo, array $config): void
{
    $hash = (string) $config['household_password_hash'];
    $fingerprint = hash('sha256', $hash);
    $stmt = $pdo->prepare("SELECT v FROM meta WHERE k = 'password_fp'");
    $stmt->execute();
    $stored = $stmt->fetchColumn();
    $first = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() === 0;
    if ($stored === $fingerprint && !$first) {
        return;
    }
    $pdo->beginTransaction();
    try {
        if ($first) {
            $name = trim((string) ($config['owner_name'] ?? '')) ?: 'Owner';
            $pdo->prepare('INSERT INTO users (name, name_key, password_hash, from_config, created_at) VALUES (?, ?, ?, 1, ?)')
                ->execute([$name, name_key($name), $hash, now_ms()]);
            $id = (int) $pdo->lastInsertId();
            if ($stored === $fingerprint) {
                // Upgrading: devices signed in with the household password are this person's.
                $pdo->prepare('UPDATE devices SET user_id = ? WHERE user_id IS NULL')->execute([$id]);
            } else {
                $pdo->exec('DELETE FROM devices');
            }
        } else {
            $id = (int) $pdo->query('SELECT id FROM users WHERE from_config = 1 LIMIT 1')->fetchColumn();
            if ($id === 0) {
                // That person was removed: the household password brings an "Owner" back.
                $name = name_taken($pdo, 'Owner') ? 'Owner ' . bin2hex(random_bytes(2)) : 'Owner';
                $pdo->prepare('INSERT INTO users (name, name_key, password_hash, from_config, created_at) VALUES (?, ?, ?, 1, ?)')
                    ->execute([$name, name_key($name), $hash, now_ms()]);
            } else {
                $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $id]);
                $pdo->prepare('DELETE FROM devices WHERE user_id = ?')->execute([$id]);
            }
        }
        $pdo->prepare("REPLACE INTO meta (k, v) VALUES ('password_fp', ?)")->execute([$fingerprint]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/** How names compare: case and spacing don't count. */
function name_key(string $name): string
{
    return strtolower(preg_replace('/\s+/u', ' ', trim($name)) ?? '');
}

/** A person's name as typed: trimmed, at most 60 characters, not empty. */
function clean_name(mixed $name): string
{
    if (!is_string($name)) {
        throw new HttpError(400, 'A name is needed');
    }
    $chars = preg_split('//u', preg_replace('/\s+/u', ' ', trim($name)) ?? '', -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $clean = implode('', array_slice($chars, 0, NAME_MAX));
    if ($clean === '') {
        throw new HttpError(400, 'A name is needed');
    }
    return $clean;
}

function clean_device(mixed $device): string
{
    $d = is_string($device)
        ? implode('', array_slice(preg_split('//u', trim($device), -1, PREG_SPLIT_NO_EMPTY) ?: [], 0, 100))
        : '';
    return $d !== '' ? $d : 'Device';
}

/** Too many wrong passwords or codes from this address lately: a 429. */
function auth_limit(PDO $pdo): void
{
    $pdo->prepare('DELETE FROM login_failures WHERE at < ?')->execute([now_ms() - LOGIN_WINDOW_MS]);
    $count = $pdo->prepare('SELECT COUNT(*) FROM login_failures WHERE ip = ?');
    $count->execute([client_ip()]);
    if ((int) $count->fetchColumn() >= LOGIN_MAX_FAILURES) {
        throw new HttpError(429, 'Too many attempts. Try again in a few minutes.', ['Retry-After' => '900']);
    }
}

function auth_fail(PDO $pdo, string $message): never
{
    $pdo->prepare('INSERT INTO login_failures (ip, at) VALUES (?, ?)')->execute([client_ip(), now_ms()]);
    usleep(300000); // slows guessing a little more
    throw new HttpError(401, $message);
}

/** A new device token for a person, and what the client needs to start. */
function auth_issue(PDO $pdo, int $userId, mixed $device): array
{
    $now = now_ms();
    $token = bin2hex(random_bytes(32));
    $pdo->prepare('INSERT INTO devices (token_hash, name, created_at, last_seen, user_id) VALUES (?, ?, ?, ?, ?)')
        ->execute([hash('sha256', $token), clean_device($device), $now, $now, $userId]);
    $empty = (int) $pdo->query('SELECT COUNT(*) FROM records WHERE deleted = 0')->fetchColumn() === 0;
    return ['token' => $token, 'serverEmpty' => $empty, 'user' => person($pdo, $userId)];
}

/**
 * Name + password. A name that matches no one is checked against everyone's
 * password (older app versions send only the password). Rate-limited per address.
 */
function auth_login(PDO $pdo, array $body): array
{
    auth_limit($pdo);
    $password = $body['password'] ?? null;
    if (!is_string($password) || $password === '') {
        auth_fail($pdo, 'Wrong password');
    }
    $users = $pdo->query('SELECT id, name_key, password_hash FROM users ORDER BY id')->fetchAll();
    $key = is_string($body['name'] ?? null) ? name_key($body['name']) : '';
    $named = array_values(array_filter($users, fn ($u) => $u['name_key'] === $key));
    foreach ($named ?: $users as $u) {
        if (password_verify($password, $u['password_hash'])) {
            return auth_issue($pdo, (int) $u['id'], $body['device'] ?? null);
        }
    }
    auth_fail($pdo, 'Wrong name or password');
}

/** The signed-in device, or a 401. The token travels in X-Pantry-Token. */
function auth_require(PDO $pdo): Session
{
    $token = $_SERVER['HTTP_X_PANTRY_TOKEN'] ?? '';
    if (!is_string($token) || !preg_match('/^[0-9a-f]{64}$/', $token)) {
        throw new HttpError(401, 'Not signed in');
    }
    $hash = hash('sha256', $token);
    $stmt = $pdo->prepare(
        'SELECT d.last_seen, d.user_id FROM devices d JOIN users u ON u.id = d.user_id WHERE d.token_hash = ?'
    );
    $stmt->execute([$hash]);
    $row = $stmt->fetch();
    if ($row === false) {
        throw new HttpError(401, 'Not signed in');
    }
    $now = now_ms();
    if ($now - (int) $row['last_seen'] > 3600 * 1000) {
        $pdo->prepare('UPDATE devices SET last_seen = ? WHERE token_hash = ?')->execute([$now, $hash]);
    }
    return new Session($hash, (int) $row['user_id']);
}

function auth_logout(PDO $pdo, Session $s): void
{
    $pdo->prepare('DELETE FROM devices WHERE token_hash = ?')->execute([$s->tokenHash]);
}

/** Every device of everyone (a lost phone). */
function auth_logout_all(PDO $pdo): void
{
    $pdo->exec('DELETE FROM devices');
}

// ---------- People ----------

/** @return array{id: string, name: string} */
function person(PDO $pdo, int $id): array
{
    $stmt = $pdo->prepare('SELECT id, name FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $u = $stmt->fetch();
    if ($u === false) {
        throw new HttpError(404, 'No such person');
    }
    return ['id' => (string) $u['id'], 'name' => $u['name']];
}

/** Who I am, and everyone with their devices. */
function people_me(PDO $pdo, Session $s): array
{
    $devices = [];
    foreach ($pdo->query('SELECT user_id, name, last_seen FROM devices ORDER BY last_seen DESC') as $d) {
        $devices[(int) $d['user_id']][] = ['name' => $d['name'], 'lastSeen' => (int) $d['last_seen']];
    }
    $people = [];
    foreach ($pdo->query('SELECT id, name FROM users ORDER BY id') as $u) {
        $people[] = ['id' => (string) $u['id'], 'name' => $u['name'], 'devices' => $devices[(int) $u['id']] ?? []];
    }
    return ['user' => person($pdo, $s->userId), 'people' => $people];
}

function name_taken(PDO $pdo, string $name, ?int $except = null): bool
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE name_key = ? AND id <> ?');
    $stmt->execute([name_key($name), $except ?? 0]);
    if ((int) $stmt->fetchColumn() > 0) {
        return true;
    }
    $stmt = $pdo->prepare('SELECT name FROM invites WHERE name IS NOT NULL AND expires_at > ?');
    $stmt->execute([now_ms()]);
    foreach ($stmt->fetchAll() as $i) {
        if (name_key($i['name']) === name_key($name)) {
            return true;
        }
    }
    return false;
}

function new_code(): string
{
    $code = '';
    for ($i = 0; $i < 8; $i++) {
        $code .= CODE_ALPHABET[random_int(0, strlen(CODE_ALPHABET) - 1)];
    }
    return substr($code, 0, 4) . '-' . substr($code, 4);
}

/** "abcd efgh", "ABCD-EFGH" and "abcdefgh" are the same code. */
function code_hash(string $code): string
{
    return hash('sha256', strtoupper(preg_replace('/[^0-9a-z]/i', '', $code) ?? ''));
}

function store_code(PDO $pdo, ?string $name, ?int $userId, Session $s): array
{
    $pdo->prepare('DELETE FROM invites WHERE expires_at < ?')->execute([now_ms()]);
    if ($userId !== null) {
        // One live code per person: a new one replaces the last.
        $pdo->prepare('DELETE FROM invites WHERE user_id = ?')->execute([$userId]);
    }
    $code = new_code();
    $expires = now_ms() + INVITE_TTL_MS;
    $pdo->prepare('INSERT INTO invites (code_hash, name, user_id, created_by, expires_at) VALUES (?, ?, ?, ?, ?)')
        ->execute([code_hash($code), $name, $userId, $s->userId, $expires]);
    return ['code' => $code, 'expiresAt' => $expires];
}

/** A one-time code for someone new. */
function people_invite(PDO $pdo, Session $s, array $body): array
{
    $name = clean_name($body['name'] ?? null);
    if (name_taken($pdo, $name)) {
        throw new HttpError(409, "Someone is already called $name");
    }
    return ['name' => $name] + store_code($pdo, $name, null, $s);
}

/** A one-time code for an existing person to set a new password. */
function people_code(PDO $pdo, Session $s, array $body): array
{
    $user = person($pdo, (int) ($body['userId'] ?? 0));
    return ['name' => $user['name']] + store_code($pdo, null, (int) $user['id'], $s);
}

/** Uses a code: joins as the invited person, or sets a forgotten password. */
function people_join(PDO $pdo, array $body): array
{
    auth_limit($pdo);
    $code = $body['code'] ?? null;
    $password = $body['password'] ?? null;
    if (!is_string($password) || strlen($password) < PASSWORD_MIN) {
        throw new HttpError(400, 'Choose a password of at least ' . PASSWORD_MIN . ' characters');
    }
    $stmt = $pdo->prepare('SELECT name, user_id, created_by FROM invites WHERE code_hash = ? AND expires_at > ?');
    $stmt->execute([is_string($code) ? code_hash($code) : '', now_ms()]);
    $invite = $stmt->fetch();
    if ($invite === false) {
        auth_fail($pdo, 'That code isn’t right, or it has expired');
    }
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM invites WHERE code_hash = ?')->execute([code_hash($code)]);
        if ($invite['user_id'] !== null) {
            $id = (int) $invite['user_id'];
            person($pdo, $id); // still here?
            $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $id]);
            // Someone else reset it (a lost phone, a forgotten password): their other
            // devices sign in again. A code they made for themselves, from a device
            // they're signed in on, leaves those devices be.
            if ((int) $invite['created_by'] !== $id) {
                $pdo->prepare('DELETE FROM devices WHERE user_id = ?')->execute([$id]);
            }
        } else {
            if (name_taken($pdo, $invite['name'])) {
                // Taken since (renamed onto it): still let them in, with a told-apart name.
                $invite['name'] .= ' 2';
            }
            $pdo->prepare('INSERT INTO users (name, name_key, password_hash, from_config, created_at) VALUES (?, ?, ?, 0, ?)')
                ->execute([$invite['name'], name_key($invite['name']), $hash, now_ms()]);
            $id = (int) $pdo->lastInsertId();
        }
        $result = auth_issue($pdo, $id, $body['device'] ?? null);
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function people_rename(PDO $pdo, array $body): array
{
    $user = person($pdo, (int) ($body['userId'] ?? 0));
    $name = clean_name($body['name'] ?? null);
    if (name_taken($pdo, $name, (int) $user['id'])) {
        throw new HttpError(409, "Someone is already called $name");
    }
    $pdo->prepare('UPDATE users SET name = ?, name_key = ? WHERE id = ?')->execute([$name, name_key($name), $user['id']]);
    return ['id' => $user['id'], 'name' => $name];
}

/** Signs out every device of one person (yourself included, if it's you). */
function people_sign_out(PDO $pdo, array $body): void
{
    $user = person($pdo, (int) ($body['userId'] ?? 0));
    $pdo->prepare('DELETE FROM devices WHERE user_id = ?')->execute([$user['id']]);
    $pdo->prepare('DELETE FROM invites WHERE user_id = ?')->execute([$user['id']]);
}

/** Removes someone else. Their changes stay; their devices are signed out. */
function people_remove(PDO $pdo, Session $s, array $body): void
{
    $user = person($pdo, (int) ($body['userId'] ?? 0));
    if ((int) $user['id'] === $s->userId) {
        throw new HttpError(400, 'You can’t remove yourself. Someone else can.');
    }
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM devices WHERE user_id = ?')->execute([$user['id']]);
        $pdo->prepare('DELETE FROM invites WHERE user_id = ?')->execute([$user['id']]);
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$user['id']]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}
