<?php
// Serves a built app and the sync API from one origin with PHP's built-in server,
// the way Apache + .htaccess do on the host. Used by CI's two-device sync test:
//   php -S 127.0.0.1:8090 -t dist server/dev-router.php
declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if (str_starts_with($path, '/api/')) {
    require __DIR__ . '/api/index.php';
    return true;
}

// A real file (assets, sw.js, manifest, icons): let the built-in server send it.
$file = realpath($_SERVER['DOCUMENT_ROOT'] . $path);
if ($path !== '/' && $file !== false && is_file($file) && str_starts_with($file, realpath($_SERVER['DOCUMENT_ROOT']))) {
    if (str_ends_with($file, '.webmanifest')) {
        header('Content-Type: application/manifest+json');
        readfile($file);
        return true;
    }
    return false;
}

// Anything else is an app route (/list, /settings/more…): the app page.
header('Content-Type: text/html; charset=utf-8');
readfile($_SERVER['DOCUMENT_ROOT'] . '/index.html');
return true;
