<?php
// Copy to config.php (the deploy writes it from GitHub secrets). Never commit config.php.
return [
    'db' => [
        'host' => 'example.ipowermysql.com',
        'name' => 'pantry',
        'user' => 'pantry_user',
        'password' => 'database-password',
    ],
    // password_hash('the household password', PASSWORD_DEFAULT). Only the hash lives here.
    'household_password_hash' => '$2y$10$...',
];
