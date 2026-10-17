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
}

/** Next value of the change sequence. Call inside the push transaction. */
function db_next_seq(PDO $pdo): int
{
    $pdo->exec("UPDATE counters SET value = LAST_INSERT_ID(value + 1) WHERE name = 'seq'");
    return (int) $pdo->query('SELECT LAST_INSERT_ID()')->fetchColumn();
}
