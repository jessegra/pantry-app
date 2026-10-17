<?php
// Writes the sync API's config.php from environment variables (GitHub secrets in
// the deploy, fixed values in CI). Usage:
//   php scripts/write-api-config.php <out.php> [existing-config.php]
// Env: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, HOUSEHOLD_PASSWORD.
// Only a hash of the household password is written. If an existing config's hash
// still matches the password, it's kept: a fresh hash (new salt) would look like a
// password change and sign every device out on every deploy.
declare(strict_types=1);

[$_, $out, $existing] = $argv + [null, null, null];
if ($out === null) {
    fwrite(STDERR, "usage: write-api-config.php <out.php> [existing-config.php]\n");
    exit(2);
}

$env = static function (string $name): string {
    $v = getenv($name);
    if ($v === false || $v === '') {
        fwrite(STDERR, "missing $name\n");
        exit(2);
    }
    return $v;
};

$password = $env('HOUSEHOLD_PASSWORD');
$old = ($existing !== null && is_file($existing)) ? (require $existing) : null;
$oldHash = is_array($old) ? (string) ($old['household_password_hash'] ?? '') : '';
$keep = $oldHash !== '' && password_verify($password, $oldHash);
$hash = $keep ? $oldHash : password_hash($password, PASSWORD_DEFAULT);
echo $keep ? "Household password unchanged\n" : "Household password set: devices will need to sign in\n";

$config = [
    'db' => [
        'host' => $env('DB_HOST'),
        'name' => $env('DB_NAME'),
        'user' => $env('DB_USER'),
        'password' => $env('DB_PASSWORD'),
    ],
    'household_password_hash' => $hash,
];
file_put_contents($out, "<?php\n// Written by scripts/write-api-config.php. Not in git.\nreturn " . var_export($config, true) . ";\n");
