<?php
declare(strict_types=1);

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;

/**
 * Signs every device out when the household password changes: the stored
 * fingerprint of the configured hash no longer matches.
 */
function auth_check_password_version(PDO $pdo, array $config): void
{
    $fingerprint = hash('sha256', (string) $config['household_password_hash']);
    $stmt = $pdo->prepare("SELECT v FROM meta WHERE k = 'password_fp'");
    $stmt->execute();
    $stored = $stmt->fetchColumn();
    if ($stored === $fingerprint) {
        return;
    }
    $pdo->exec('DELETE FROM devices');
    $pdo->prepare("REPLACE INTO meta (k, v) VALUES ('password_fp', ?)")->execute([$fingerprint]);
}

/** Checks the household password and issues a device token. Rate-limited per IP. */
function auth_login(PDO $pdo, array $config, array $body): array
{
    $ip = client_ip();
    $now = now_ms();
    $pdo->prepare('DELETE FROM login_failures WHERE at < ?')->execute([$now - LOGIN_WINDOW_MS]);
    $count = $pdo->prepare('SELECT COUNT(*) FROM login_failures WHERE ip = ?');
    $count->execute([$ip]);
    if ((int) $count->fetchColumn() >= LOGIN_MAX_FAILURES) {
        throw new HttpError(429, 'Too many attempts. Try again in a few minutes.', ['Retry-After' => '900']);
    }

    $password = $body['password'] ?? null;
    if (!is_string($password) || !password_verify($password, (string) $config['household_password_hash'])) {
        $pdo->prepare('INSERT INTO login_failures (ip, at) VALUES (?, ?)')->execute([$ip, $now]);
        usleep(300000); // slows guessing a little more
        throw new HttpError(401, 'Wrong password');
    }

    // Trimmed to 100 characters without needing mbstring (not always enabled on shared hosts).
    $device = is_string($body['device'] ?? null)
        ? implode('', array_slice(preg_split('//u', trim($body['device']), -1, PREG_SPLIT_NO_EMPTY) ?: [], 0, 100))
        : '';
    $token = bin2hex(random_bytes(32));
    $pdo->prepare('INSERT INTO devices (token_hash, name, created_at, last_seen) VALUES (?, ?, ?, ?)')
        ->execute([hash('sha256', $token), $device !== '' ? $device : 'Device', $now, $now]);

    $empty = (int) $pdo->query('SELECT COUNT(*) FROM records WHERE deleted = 0')->fetchColumn() === 0;
    return ['token' => $token, 'serverEmpty' => $empty];
}

/** The signed-in device's token hash, or a 401. The token travels in X-Pantry-Token. */
function auth_require(PDO $pdo): string
{
    $token = $_SERVER['HTTP_X_PANTRY_TOKEN'] ?? '';
    if (!is_string($token) || !preg_match('/^[0-9a-f]{64}$/', $token)) {
        throw new HttpError(401, 'Not signed in');
    }
    $hash = hash('sha256', $token);
    $stmt = $pdo->prepare('SELECT last_seen FROM devices WHERE token_hash = ?');
    $stmt->execute([$hash]);
    $lastSeen = $stmt->fetchColumn();
    if ($lastSeen === false) {
        throw new HttpError(401, 'Not signed in');
    }
    $now = now_ms();
    if ($now - (int) $lastSeen > 3600 * 1000) {
        $pdo->prepare('UPDATE devices SET last_seen = ? WHERE token_hash = ?')->execute([$now, $hash]);
    }
    return $hash;
}

function auth_logout(PDO $pdo, string $tokenHash): void
{
    $pdo->prepare('DELETE FROM devices WHERE token_hash = ?')->execute([$tokenHash]);
}

function auth_logout_all(PDO $pdo): void
{
    $pdo->exec('DELETE FROM devices');
}
