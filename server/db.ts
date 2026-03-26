import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || "localhost",
      port: Number(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE || "appdb",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: "utf8mb4",
    });
  }
  return pool;
}

export async function query<T extends RowDataPacket[]>(
  sql: string,
  params?: any[],
): Promise<T> {
  const [rows] = await getPool().execute<T>(sql, params);
  return rows;
}

export async function execute(
  sql: string,
  params?: any[],
): Promise<ResultSetHeader> {
  const [result] = await getPool().execute<ResultSetHeader>(sql, params);
  return result;
}

export async function getConnection(): Promise<PoolConnection> {
  return getPool().getConnection();
}

export async function initDatabase(): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        nickname VARCHAR(100) DEFAULT '',
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Ensure role column exists for older tables
    try {
      await conn.execute(`ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user' AFTER nickname`);
    } catch {
      // column already exists
    }

    // Set admin role for the admin user
    await conn.execute(`UPDATE users SET role = 'admin' WHERE username = 'admin' AND role != 'admin'`);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS watchlist (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        stock_code VARCHAR(20) NOT NULL,
        stock_name VARCHAR(50) DEFAULT '',
        market VARCHAR(10) DEFAULT '',
        notes TEXT,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_stock (user_id, stock_code),
        KEY idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS trades (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        stock_code VARCHAR(20) NOT NULL,
        stock_name VARCHAR(50) DEFAULT '',
        direction ENUM('buy', 'sell') NOT NULL,
        price DECIMAL(12,4) NOT NULL,
        quantity INT NOT NULL,
        amount DECIMAL(16,4) DEFAULT 0,
        trade_time DATETIME NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_user_id (user_id),
        KEY idx_trade_time (trade_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS journals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(200) DEFAULT '',
        content TEXT,
        trade_date DATE,
        tags VARCHAR(500) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_user_id (user_id),
        KEY idx_trade_date (trade_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS simulation_accounts (
        user_id INT PRIMARY KEY,
        initial_cash DECIMAL(18,2) NOT NULL DEFAULT 1000000.00,
        available_cash DECIMAL(18,2) NOT NULL DEFAULT 1000000.00,
        total_equity DECIMAL(18,2) NOT NULL DEFAULT 1000000.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_updated_at (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS simulation_strategies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(120) NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        preset_key VARCHAR(50) NOT NULL DEFAULT 'five_day_down_rebound',
        buy_config_json MEDIUMTEXT NULL,
        sell_config_json MEDIUMTEXT NULL,
        risk_config_json MEDIUMTEXT NULL,
        last_buy_date DATE NULL,
        last_run_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_user_enabled (user_id, enabled),
        KEY idx_updated_at (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS simulation_positions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        strategy_id INT NULL,
        stock_code VARCHAR(20) NOT NULL,
        stock_name VARCHAR(80) DEFAULT '',
        quantity INT NOT NULL,
        available_quantity INT NOT NULL,
        avg_cost DECIMAL(18,4) NOT NULL,
        last_price DECIMAL(18,4) NOT NULL DEFAULT 0,
        highest_price DECIMAL(18,4) NOT NULL DEFAULT 0,
        status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
        opened_at DATETIME NOT NULL,
        closed_at DATETIME NULL,
        close_price DECIMAL(18,4) NULL,
        close_reason VARCHAR(120) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_user_status (user_id, status),
        KEY idx_strategy_status (strategy_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS simulation_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        strategy_id INT NULL,
        position_id INT NULL,
        stock_code VARCHAR(20) NOT NULL,
        stock_name VARCHAR(80) DEFAULT '',
        side ENUM('buy', 'sell') NOT NULL,
        status ENUM('filled', 'rejected', 'cancelled') NOT NULL DEFAULT 'filled',
        trigger_type VARCHAR(60) DEFAULT '',
        trigger_reason VARCHAR(255) DEFAULT '',
        price DECIMAL(18,4) NOT NULL,
        quantity INT NOT NULL,
        amount DECIMAL(18,2) NOT NULL DEFAULT 0,
        meta_json MEDIUMTEXT NULL,
        executed_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_user_executed_at (user_id, executed_at),
        KEY idx_strategy_executed_at (strategy_id, executed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS simulation_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        strategy_id INT NULL,
        level ENUM('info', 'warn', 'error', 'trade') NOT NULL DEFAULT 'info',
        message VARCHAR(255) NOT NULL,
        detail_json MEDIUMTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_user_created_at (user_id, created_at),
        KEY idx_strategy_created_at (strategy_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log("[db] tables initialized");
  } finally {
    conn.release();
  }
}
