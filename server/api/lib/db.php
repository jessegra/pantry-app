<?php
declare(strict_types=1);

function db_connect(array $config): PDO
{
    $c = $config['db'];
    $pdo = new PDO(
        sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $c['host'], $c['name']),
        $c['user'],
        $c['password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ],
    );
    return $pdo;
}

/** Creates the tables on first use. Idempotent; MySQL 5.7 compatible. */
function db_migrate(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS records (
        tbl VARCHAR(32) NOT NULL,
        id VARCHAR(64) NOT NULL,
        data MEDIUMTEXT NULL,
        deleted TINYINT(1) NOT NULL DEFAULT 0,
        updated_at BIGINT NOT NULL,
        seq BIGINT NOT NULL,
        PRIMARY KEY (tbl, id),
        KEY by_seq (seq)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $pdo->exec('CREATE TABLE IF NOT EXISTS counters (
        name VARCHAR(32) NOT NULL PRIMARY KEY,
        value BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $pdo->exec("INSERT IGNORE INTO counters (name, value) VALUES ('seq', 0)");
    $pdo->exec('CREATE TABLE IF NOT EXISTS devices (
        token_hash CHAR(64) NOT NULL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        created_at BIGINT NOT NULL,
        last_seen BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $pdo->exec('CREATE TABLE IF NOT EXISTS login_failures (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        ip VARCHAR(45) NOT NULL,
        at BIGINT NOT NULL,
        KEY by_ip (ip, at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $pdo->exec('CREATE TABLE IF NOT EXISTS meta (
        k VARCHAR(32) NOT NULL PRIMARY KEY,
        v VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    // People (docs/USERS_PLAN.md). from_config = the person whose password is the
    // household password in the server config.
    $pdo->exec('CREATE TABLE IF NOT EXISTS users (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(60) NOT NULL,
        name_key VARCHAR(60) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        from_config TINYINT(1) NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        UNIQUE KEY by_name (name_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $pdo->exec('CREATE TABLE IF NOT EXISTS invites (
        code_hash CHAR(64) NOT NULL PRIMARY KEY,
        name VARCHAR(60) NULL,
        user_id INT NULL,
        created_by INT NOT NULL,
        expires_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    if (!db_has_column($pdo, 'devices', 'user_id')) {
        $pdo->exec('ALTER TABLE devices ADD COLUMN user_id INT NULL');
    }
}

function db_has_column(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $stmt->execute([$table, $column]);
    return (int) $stmt->fetchColumn() > 0;
}

/** Next value of the change sequence. Call inside the push transaction. */
function db_next_seq(PDO $pdo): int
{
    $pdo->exec("UPDATE counters SET value = LAST_INSERT_ID(value + 1) WHERE name = 'seq'");
    return (int) $pdo->query('SELECT LAST_INSERT_ID()')->fetchColumn();
}
