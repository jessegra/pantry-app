<?php
// Pantry sync API (PHP 8.4, MySQL 5.7). See docs/SYNC_PLAN.md.
//   GET  /api/health            no auth; is PHP + the database working
//   POST /api/login             { name, password, device } -> { token, serverEmpty, user }
//   POST /api/join              { code, password, device } -> { token, serverEmpty, user }
//   POST /api/push              { changes: [...] } -> { accepted, ignored }
//   GET  /api/pull?since=&limit -> { changes, cursor, more }
//   GET  /api/me                -> { user, people: [{ id, name, devices }] }
//   POST /api/invite            { name } -> { name, code, expiresAt }
//   POST /api/people/code       { userId } -> { name, code, expiresAt } (a forgotten password)
//   POST /api/people/rename     { userId, name }
//   POST /api/people/sign-out   { userId }: that person's devices
//   POST /api/people/remove     { userId }: someone else
//   POST /api/devices/remove    { deviceId }: one device (an id from /me)
//   POST /api/logout            this device
//   POST /api/logout-all        every device of everyone
// People: docs/USERS_PLAN.md.
// Signed-in requests carry the device token in X-Pantry-Token (shared hosts often
// strip the Authorization header before PHP sees it).
declare(strict_types=1);

require __DIR__ . '/lib/http.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/sync.php';

try {
    $configPath = getenv('PANTRY_API_CONFIG') ?: __DIR__ . '/config.php';
    if (!is_file($configPath)) {
        throw new HttpError(503, 'Sync is not configured on this server yet');
    }
    $config = require $configPath;
    $route = route_path();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($route === '/health' && $method === 'GET') {
        try {
            $pdo = db_connect($config);
            db_migrate($pdo);
            send_json(200, ['ok' => true, 'php' => PHP_VERSION, 'db' => true]);
        } catch (PDOException $e) {
            error_log('pantry health: ' . $e->getMessage());
            send_json(503, ['ok' => false, 'php' => PHP_VERSION, 'db' => false]);
        }
        return;
    }

    $pdo = db_connect($config);
    db_migrate($pdo);
    auth_check_password_version($pdo, $config);

    switch ("$method $route") {
        case 'POST /login':
            send_json(200, auth_login($pdo, read_json()));
            break;
        case 'POST /join':
            send_json(200, people_join($pdo, read_json()));
            break;
        case 'GET /me':
            send_json(200, people_me($pdo, auth_require($pdo)));
            break;
        case 'POST /invite':
            send_json(200, people_invite($pdo, auth_require($pdo), read_json()));
            break;
        case 'POST /people/code':
            send_json(200, people_code($pdo, auth_require($pdo), read_json()));
            break;
        case 'POST /people/rename':
            auth_require($pdo);
            send_json(200, people_rename($pdo, read_json()));
            break;
        case 'POST /people/sign-out':
            auth_require($pdo);
            people_sign_out($pdo, read_json());
            send_json(200, ['ok' => true]);
            break;
        case 'POST /devices/remove':
            auth_require($pdo);
            people_remove_device($pdo, read_json());
            send_json(200, ['ok' => true]);
            break;
        case 'POST /people/remove':
            people_remove($pdo, auth_require($pdo), read_json());
            send_json(200, ['ok' => true]);
            break;
        case 'POST /push':
            auth_require($pdo);
            send_json(200, sync_push($pdo, read_json()));
            break;
        case 'GET /pull':
            auth_require($pdo);
            send_json(200, sync_pull($pdo, $_GET));
            break;
        case 'POST /logout':
            auth_logout($pdo, auth_require($pdo));
            send_json(200, ['ok' => true]);
            break;
        case 'POST /logout-all':
            auth_require($pdo);
            auth_logout_all($pdo);
            send_json(200, ['ok' => true]);
            break;
        default:
            throw new HttpError(404, 'Not found');
    }
} catch (HttpError $e) {
    send_json($e->status, ['error' => $e->getMessage()], $e->headers);
} catch (Throwable $e) {
    error_log('pantry api: ' . $e);
    send_json(500, ['error' => 'Server error']);
}
