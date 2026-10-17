<?php
// Pantry sync API (PHP 8.4, MySQL 5.7). See docs/SYNC_PLAN.md.
//   GET  /api/health            no auth; is PHP + the database working
//   POST /api/login             { password, device } -> { token, serverEmpty }
//   POST /api/push              { changes: [...] } -> { accepted, ignored }
//   GET  /api/pull?since=&limit -> { changes, cursor, more }
//   POST /api/logout            this device
//   POST /api/logout-all        every device
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
            send_json(200, auth_login($pdo, $config, read_json()));
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
