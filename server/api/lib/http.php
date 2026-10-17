<?php
declare(strict_types=1);

final class HttpError extends Exception
{
    public function __construct(public readonly int $status, string $message, public readonly array $headers = [])
    {
        parent::__construct($message);
    }
}

function send_json(int $status, array $body, array $headers = []): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    foreach ($headers as $name => $value) {
        header("$name: $value");
    }
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

/** The JSON request body as an array. Rejects anything over 5 MB or not a JSON object. */
function read_json(): array
{
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > 5 * 1024 * 1024) {
        throw new HttpError(413, 'Request too large');
    }
    $raw = file_get_contents('php://input');
    $data = json_decode($raw === false ? '' : $raw, true);
    if (!is_array($data)) {
        throw new HttpError(400, 'Expected a JSON object');
    }
    return $data;
}

/** The route below /api, e.g. "/login" for /api/login or /pantry/api/login. */
function route_path(): string
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $at = strpos($path, '/api/');
    return $at === false ? '/' : substr($path, $at + 4);
}

function client_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 45);
}

function now_ms(): int
{
    return (int) floor(microtime(true) * 1000);
}
