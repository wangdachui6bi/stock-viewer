// server/index.ts
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import axios2 from "axios";
import iconv from "iconv-lite";

// server/db.ts
import mysql from "mysql2/promise";
var pool;
function getPool() {
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
      charset: "utf8mb4"
    });
  }
  return pool;
}
async function query(sql, params) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}
async function execute(sql, params) {
  const [result] = await getPool().execute(sql, params);
  return result;
}
async function getConnection() {
  return getPool().getConnection();
}
async function initDatabase() {
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
    try {
      await conn.execute(`ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user' AFTER nickname`);
    } catch {
    }
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

// server/auth.ts
import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "\u672A\u767B\u5F55" });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.userId = payload.id;
    req.username = payload.username;
    req.role = payload.role;
    next();
  } catch {
    return res.status(401).json({ error: "\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55" });
  }
}
function requireAdmin(req, res, next) {
  if (req.role !== "admin") {
    return res.status(403).json({ error: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" });
  }
  next();
}
function createAuthRouter() {
  const router = Router();
  router.post("/login", async (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ error: "\u8BF7\u8F93\u5165\u7528\u6237\u540D\u548C\u5BC6\u7801" });
      }
      const rows = await query(
        "SELECT id, username, password_hash, nickname, role FROM users WHERE username = ?",
        [username]
      );
      if (!rows.length) {
        return res.status(401).json({ error: "\u7528\u6237\u540D\u6216\u5BC6\u7801\u9519\u8BEF" });
      }
      const user = rows[0];
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(401).json({ error: "\u7528\u6237\u540D\u6216\u5BC6\u7801\u9519\u8BEF" });
      }
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role || "user" },
        getJwtSecret(),
        { expiresIn: "7d" }
      );
      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          role: user.role || "user"
        }
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[auth] login error:", message);
      res.status(500).json({ error: message });
    }
  });
  router.get("/me", requireAuth, async (req, res) => {
    try {
      const rows = await query(
        "SELECT id, username, nickname, role FROM users WHERE id = ?",
        [req.userId]
      );
      if (!rows.length) return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
      const user = rows[0];
      res.json({
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        role: user.role || "user"
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.post("/change-password", requireAuth, async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body || {};
      if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: "\u8BF7\u8F93\u5165\u65E7\u5BC6\u7801\u548C\u65B0\u5BC6\u7801" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: "\u65B0\u5BC6\u7801\u81F3\u5C116\u4F4D" });
      }
      const rows = await query(
        "SELECT id, password_hash FROM users WHERE id = ?",
        [req.userId]
      );
      if (!rows.length) return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
      const match = await bcrypt.compare(oldPassword, rows[0].password_hash);
      if (!match) return res.status(401).json({ error: "\u65E7\u5BC6\u7801\u9519\u8BEF" });
      const hash = await bcrypt.hash(newPassword, 10);
      await query("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.userId]);
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  return router;
}

// server/routes/watchlist.ts
import { Router as Router2 } from "express";
function createWatchlistRouter() {
  const router = Router2();
  router.use(requireAuth);
  router.get("/", async (req, res) => {
    try {
      const rows = await query(
        "SELECT id, stock_code, stock_name, market, notes, added_at FROM watchlist WHERE user_id = ? ORDER BY added_at DESC",
        [req.userId]
      );
      res.json(rows);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.post("/", async (req, res) => {
    try {
      const { stockCode, stockName, market, notes } = req.body || {};
      if (!stockCode) return res.status(400).json({ error: "\u7F3A\u5C11\u80A1\u7968\u4EE3\u7801" });
      const result = await execute(
        "INSERT INTO watchlist (user_id, stock_code, stock_name, market, notes) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE stock_name = VALUES(stock_name), market = VALUES(market), notes = VALUES(notes)",
        [req.userId, stockCode, stockName || "", market || "", notes || ""]
      );
      res.json({ id: result.insertId, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.delete("/:id", async (req, res) => {
    try {
      await execute("DELETE FROM watchlist WHERE id = ? AND user_id = ?", [
        req.params.id,
        req.userId
      ]);
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.delete("/code/:stockCode", async (req, res) => {
    try {
      await execute("DELETE FROM watchlist WHERE stock_code = ? AND user_id = ?", [
        req.params.stockCode,
        req.userId
      ]);
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  return router;
}

// server/routes/trades.ts
import { Router as Router3 } from "express";
function createTradesRouter() {
  const router = Router3();
  router.use(requireAuth);
  router.get("/", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const stockCode = req.query.stockCode ? String(req.query.stockCode) : null;
      let sql = "SELECT id, stock_code, stock_name, direction, price, quantity, amount, trade_time, notes, created_at FROM trades WHERE user_id = ?";
      const params = [req.userId];
      if (stockCode) {
        sql += " AND stock_code = ?";
        params.push(stockCode);
      }
      sql += " ORDER BY trade_time DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);
      const rows = await query(sql, params);
      res.json(rows);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.post("/", async (req, res) => {
    try {
      const { stockCode, stockName, direction, price, quantity, tradeTime, notes } = req.body || {};
      if (!stockCode || !direction || !price || !quantity || !tradeTime) {
        return res.status(400).json({ error: "\u7F3A\u5C11\u5FC5\u586B\u5B57\u6BB5\uFF08stockCode, direction, price, quantity, tradeTime\uFF09" });
      }
      if (direction !== "buy" && direction !== "sell") {
        return res.status(400).json({ error: "direction \u5FC5\u987B\u662F buy \u6216 sell" });
      }
      const amount = Number(price) * Number(quantity);
      const result = await execute(
        "INSERT INTO trades (user_id, stock_code, stock_name, direction, price, quantity, amount, trade_time, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [req.userId, stockCode, stockName || "", direction, price, quantity, amount, tradeTime, notes || ""]
      );
      res.json({ id: result.insertId, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.put("/:id", async (req, res) => {
    try {
      const { stockCode, stockName, direction, price, quantity, tradeTime, notes } = req.body || {};
      if (!stockCode || !direction || !price || !quantity || !tradeTime) {
        return res.status(400).json({ error: "\u7F3A\u5C11\u5FC5\u586B\u5B57\u6BB5" });
      }
      const amount = Number(price) * Number(quantity);
      await execute(
        "UPDATE trades SET stock_code = ?, stock_name = ?, direction = ?, price = ?, quantity = ?, amount = ?, trade_time = ?, notes = ? WHERE id = ? AND user_id = ?",
        [stockCode, stockName || "", direction, price, quantity, amount, tradeTime, notes || "", req.params.id, req.userId]
      );
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.delete("/:id", async (req, res) => {
    try {
      await execute("DELETE FROM trades WHERE id = ? AND user_id = ?", [
        req.params.id,
        req.userId
      ]);
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.get("/positions", async (req, res) => {
    try {
      const rows = await query(
        `SELECT
          stock_code,
          stock_name,
          SUM(CASE WHEN direction = 'buy' THEN quantity ELSE -quantity END) AS net_quantity,
          SUM(CASE WHEN direction = 'buy' THEN amount ELSE -amount END) AS net_amount,
          COUNT(*) AS trade_count,
          MAX(trade_time) AS last_trade_time
        FROM trades
        WHERE user_id = ?
        GROUP BY stock_code, stock_name
        HAVING net_quantity != 0
        ORDER BY last_trade_time DESC`,
        [req.userId]
      );
      res.json(rows);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  return router;
}

// server/routes/journals.ts
import { Router as Router4 } from "express";
function createJournalsRouter() {
  const router = Router4();
  router.use(requireAuth);
  router.get("/", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      let sql = "SELECT id, title, content, trade_date, tags, created_at, updated_at FROM journals WHERE user_id = ?";
      const params = [req.userId];
      if (req.query.tag) {
        sql += " AND FIND_IN_SET(?, tags) > 0";
        params.push(String(req.query.tag));
      }
      if (req.query.startDate && req.query.endDate) {
        sql += " AND trade_date BETWEEN ? AND ?";
        params.push(String(req.query.startDate), String(req.query.endDate));
      }
      sql += " ORDER BY trade_date DESC, created_at DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);
      const rows = await query(sql, params);
      res.json(rows);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.get("/:id", async (req, res) => {
    try {
      const rows = await query(
        "SELECT id, title, content, trade_date, tags, created_at, updated_at FROM journals WHERE id = ? AND user_id = ?",
        [req.params.id, req.userId]
      );
      if (!rows.length) return res.status(404).json({ error: "\u7B14\u8BB0\u4E0D\u5B58\u5728" });
      res.json(rows[0]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.post("/", async (req, res) => {
    try {
      const { title, content, tradeDate, tags } = req.body || {};
      if (!content) return res.status(400).json({ error: "\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A" });
      const tagsStr = Array.isArray(tags) ? tags.join(",") : tags || "";
      const result = await execute(
        "INSERT INTO journals (user_id, title, content, trade_date, tags) VALUES (?, ?, ?, ?, ?)",
        [req.userId, title || "", content, tradeDate || null, tagsStr]
      );
      res.json({ id: result.insertId, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.put("/:id", async (req, res) => {
    try {
      const { title, content, tradeDate, tags } = req.body || {};
      if (!content) return res.status(400).json({ error: "\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A" });
      const tagsStr = Array.isArray(tags) ? tags.join(",") : tags || "";
      await execute(
        "UPDATE journals SET title = ?, content = ?, trade_date = ?, tags = ? WHERE id = ? AND user_id = ?",
        [title || "", content, tradeDate || null, tagsStr, req.params.id, req.userId]
      );
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.delete("/:id", async (req, res) => {
    try {
      await execute("DELETE FROM journals WHERE id = ? AND user_id = ?", [
        req.params.id,
        req.userId
      ]);
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  return router;
}

// server/routes/admin.ts
import { Router as Router5 } from "express";
import bcrypt2 from "bcryptjs";
function createAdminRouter() {
  const router = Router5();
  router.use(requireAuth, requireAdmin);
  router.get("/users", async (_req, res) => {
    try {
      const rows = await query(
        "SELECT id, username, nickname, role, created_at FROM users ORDER BY created_at DESC"
      );
      res.json(rows);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.post("/users", async (req, res) => {
    try {
      const { username, password, nickname, role } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ error: "\u7528\u6237\u540D\u548C\u5BC6\u7801\u4E0D\u80FD\u4E3A\u7A7A" });
      }
      if (typeof username !== "string" || username.trim().length < 2) {
        return res.status(400).json({ error: "\u7528\u6237\u540D\u81F3\u5C112\u4E2A\u5B57\u7B26" });
      }
      if (/[^a-zA-Z0-9_\-]/.test(username.trim())) {
        return res.status(400).json({ error: "\u7528\u6237\u540D\u53EA\u5141\u8BB8\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u3001\u8FDE\u5B57\u7B26" });
      }
      if (typeof password !== "string" || password.length < 6) {
        return res.status(400).json({ error: "\u5BC6\u7801\u81F3\u5C116\u4F4D" });
      }
      const existing = await query(
        "SELECT id FROM users WHERE username = ?",
        [username.trim()]
      );
      if (existing.length) {
        return res.status(409).json({ error: `\u7528\u6237\u540D "${username.trim()}" \u5DF2\u5B58\u5728` });
      }
      const validRoles = ["user", "admin"];
      const userRole = validRoles.includes(role) ? role : "user";
      const hash = await bcrypt2.hash(password, 10);
      const result = await execute(
        "INSERT INTO users (username, password_hash, nickname, role) VALUES (?, ?, ?, ?)",
        [username.trim(), hash, (nickname || "").trim(), userRole]
      );
      res.json({ id: result.insertId, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.put("/users/:id/role", async (req, res) => {
    try {
      const targetId = Number(req.params.id);
      if (targetId === req.userId) {
        return res.status(400).json({ error: "\u4E0D\u80FD\u4FEE\u6539\u81EA\u5DF1\u7684\u89D2\u8272" });
      }
      const { role } = req.body || {};
      const validRoles = ["user", "admin"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "\u65E0\u6548\u89D2\u8272" });
      }
      await execute("UPDATE users SET role = ? WHERE id = ?", [role, targetId]);
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.post("/users/:id/reset-password", async (req, res) => {
    try {
      const { newPassword } = req.body || {};
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "\u65B0\u5BC6\u7801\u81F3\u5C116\u4F4D" });
      }
      const hash = await bcrypt2.hash(newPassword, 10);
      await execute("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.params.id]);
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.delete("/users/:id", async (req, res) => {
    try {
      const targetId = Number(req.params.id);
      if (targetId === req.userId) {
        return res.status(400).json({ error: "\u4E0D\u80FD\u5220\u9664\u81EA\u5DF1" });
      }
      await execute("DELETE FROM users WHERE id = ?", [targetId]);
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  return router;
}

// server/routes/simulation.ts
import { Router as Router6 } from "express";

// server/simulator.ts
import axios from "axios";
var LOCAL_API_BASE = process.env.SIMULATOR_LOCAL_BASE_URL || `http://127.0.0.1:${process.env.PORT || "3001"}/api`;
var DEFAULT_INITIAL_CASH = Number(process.env.SIM_INITIAL_CASH || "1000000");
var DEFAULT_BOARD_LOT = 100;
var SHANGHAI_TZ = "Asia/Shanghai";
var runningStrategyIds = /* @__PURE__ */ new Set();
function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return { ...fallback, ...JSON.parse(value) };
  } catch {
    return fallback;
  }
}
function getDefaultBuyConfig() {
  return {
    scanTime: "14:40",
    minDownDays: 5,
    pickRank: 1,
    capitalPerTrade: 5e4,
    boardLot: DEFAULT_BOARD_LOT
  };
}
function getDefaultSellConfig() {
  return {
    morningBreakEvenEnabled: true,
    morningBreakEvenEnd: "11:30",
    breakEvenBufferPct: 0,
    trailingStopEnabled: true,
    minProfitForTrailPct: 1.2,
    trailingPullbackPct: 0.8,
    stopLossPct: 3
  };
}
function getDefaultRiskConfig() {
  return {
    maxOpenPositions: 1,
    allowSameDayReentry: false
  };
}
function toStrategyDto(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    enabled: Boolean(row.enabled),
    presetKey: row.preset_key,
    buyConfig: parseJson(row.buy_config_json, getDefaultBuyConfig()),
    sellConfig: parseJson(row.sell_config_json, getDefaultSellConfig()),
    riskConfig: parseJson(row.risk_config_json, getDefaultRiskConfig()),
    lastBuyDate: row.last_buy_date,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function getShanghaiParts(date = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return {
    date: `${byType.year}-${byType.month}-${byType.day}`,
    time: `${byType.hour}:${byType.minute}`,
    hour: Number(byType.hour || 0),
    minute: Number(byType.minute || 0)
  };
}
function toTimeValue(time) {
  const [hour, minute] = String(time || "00:00").split(":").map((v) => Number(v) || 0);
  return hour * 60 + minute;
}
function inTradingSession(parts = getShanghaiParts()) {
  const value = parts.hour * 60 + parts.minute;
  const morningOpen = 9 * 60 + 30;
  const morningClose = 11 * 60 + 30;
  const afternoonOpen = 13 * 60;
  const afternoonClose = 15 * 60;
  return value >= morningOpen && value <= morningClose || value >= afternoonOpen && value <= afternoonClose;
}
function isMorningSession(parts = getShanghaiParts()) {
  const value = parts.hour * 60 + parts.minute;
  return value >= 9 * 60 + 30 && value <= 11 * 60 + 30;
}
function formatSqlDateTime(date = /* @__PURE__ */ new Date()) {
  return new Date(date.getTime() - date.getMilliseconds()).toISOString().slice(0, 19).replace("T", " ");
}
function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function round2(value) {
  return Math.round(value * 100) / 100;
}
function round4(value) {
  return Math.round(value * 1e4) / 1e4;
}
async function fetchQuotes(codes) {
  if (!codes.length) return [];
  const { data } = await axios.get(`${LOCAL_API_BASE}/stock`, {
    params: { codes: codes.join(",") },
    timeout: 2e4
  });
  if (!Array.isArray(data)) return [];
  return data.map((item) => ({
    code: String(item.code || ""),
    name: String(item.name || ""),
    price: num(item.price),
    open: num(item.open),
    high: num(item.high),
    low: num(item.low),
    percent: num(item.percent)
  })).filter((item) => item.code && item.price > 0);
}
async function fetchStreakCandidates(minDownDays) {
  const { data } = await axios.get(`${LOCAL_API_BASE}/streak-scan`, {
    params: { direction: "down", minDays: minDownDays },
    timeout: 3e5
  });
  const rows = Array.isArray(data?.results) ? data.results : [];
  return rows.map((item) => ({
    code: String(item.code || ""),
    name: String(item.name || ""),
    price: num(item.price),
    percent: num(item.percent),
    streak: num(item.streak)
  })).filter((item) => item.code);
}
async function ensureSimulationAccount(userId) {
  const existing = await query(
    "SELECT user_id, initial_cash, available_cash, total_equity, created_at, updated_at FROM simulation_accounts WHERE user_id = ?",
    [userId]
  );
  if (existing.length) return existing[0];
  await execute(
    "INSERT INTO simulation_accounts (user_id, initial_cash, available_cash, total_equity) VALUES (?, ?, ?, ?)",
    [userId, DEFAULT_INITIAL_CASH, DEFAULT_INITIAL_CASH, DEFAULT_INITIAL_CASH]
  );
  const rows = await query(
    "SELECT user_id, initial_cash, available_cash, total_equity, created_at, updated_at FROM simulation_accounts WHERE user_id = ?",
    [userId]
  );
  return rows[0];
}
async function refreshSimulationAccountEquity(userId) {
  const account = await ensureSimulationAccount(userId);
  const positions = await query(
    "SELECT * FROM simulation_positions WHERE user_id = ? AND status = 'open' ORDER BY opened_at DESC",
    [userId]
  );
  const marketValue = positions.reduce((sum, item) => sum + num(item.last_price) * num(item.quantity), 0);
  const totalEquity = round2(num(account.available_cash) + marketValue);
  await execute("UPDATE simulation_accounts SET total_equity = ? WHERE user_id = ?", [totalEquity, userId]);
}
async function insertLog(userId, strategyId, level, message, detail) {
  await execute(
    "INSERT INTO simulation_logs (user_id, strategy_id, level, message, detail_json) VALUES (?, ?, ?, ?, ?)",
    [userId, strategyId, level, message, detail ? JSON.stringify(detail) : null]
  );
}
async function createRejectedOrder(userId, strategyId, payload) {
  await execute(
    `INSERT INTO simulation_orders
      (user_id, strategy_id, position_id, stock_code, stock_name, side, status, trigger_type, trigger_reason, price, quantity, amount, meta_json, executed_at)
     VALUES (?, ?, NULL, ?, ?, ?, 'rejected', ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      strategyId,
      payload.stockCode,
      payload.stockName || "",
      payload.side,
      payload.triggerType,
      payload.triggerReason,
      round4(payload.price),
      payload.quantity,
      round2(payload.price * payload.quantity),
      payload.meta ? JSON.stringify(payload.meta) : null,
      formatSqlDateTime()
    ]
  );
}
async function recordFilledOrder(conn, userId, strategyId, positionId, payload) {
  await conn.execute(
    `INSERT INTO simulation_orders
      (user_id, strategy_id, position_id, stock_code, stock_name, side, status, trigger_type, trigger_reason, price, quantity, amount, meta_json, executed_at)
     VALUES (?, ?, ?, ?, ?, ?, 'filled', ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      strategyId,
      positionId,
      payload.stockCode,
      payload.stockName || "",
      payload.side,
      payload.triggerType,
      payload.triggerReason,
      round4(payload.price),
      payload.quantity,
      round2(payload.price * payload.quantity),
      payload.meta ? JSON.stringify(payload.meta) : null,
      formatSqlDateTime()
    ]
  );
}
async function buyPosition(strategy, quote, buyConfig, triggerReason) {
  const account = await ensureSimulationAccount(strategy.user_id);
  const lot = Math.max(1, Math.round(num(buyConfig.boardLot) || DEFAULT_BOARD_LOT));
  const quantity = Math.floor(num(buyConfig.capitalPerTrade) / quote.price / lot) * lot;
  if (quantity <= 0) {
    await createRejectedOrder(strategy.user_id, strategy.id, {
      stockCode: quote.code,
      stockName: quote.name,
      side: "buy",
      triggerType: "scan_buy",
      triggerReason: "\u8D44\u91D1\u4E0D\u8DB3\u4EE5\u4E70\u5165\u4E00\u624B",
      price: quote.price,
      quantity: lot,
      meta: { requestedCapital: buyConfig.capitalPerTrade }
    });
    await insertLog(strategy.user_id, strategy.id, "warn", "\u6A21\u62DF\u4E70\u5165\u88AB\u62D2\u7EDD\uFF1A\u4E0D\u8DB3\u4E00\u624B\u8D44\u91D1", {
      stockCode: quote.code,
      quotePrice: quote.price,
      capitalPerTrade: buyConfig.capitalPerTrade
    });
    return;
  }
  const amount = round2(quantity * quote.price);
  if (num(account.available_cash) < amount) {
    await createRejectedOrder(strategy.user_id, strategy.id, {
      stockCode: quote.code,
      stockName: quote.name,
      side: "buy",
      triggerType: "scan_buy",
      triggerReason: "\u53EF\u7528\u8D44\u91D1\u4E0D\u8DB3",
      price: quote.price,
      quantity,
      meta: { availableCash: account.available_cash }
    });
    await insertLog(strategy.user_id, strategy.id, "warn", "\u6A21\u62DF\u4E70\u5165\u88AB\u62D2\u7EDD\uFF1A\u8D26\u6237\u53EF\u7528\u8D44\u91D1\u4E0D\u8DB3", {
      stockCode: quote.code,
      amount,
      availableCash: account.available_cash
    });
    return;
  }
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE simulation_accounts
       SET available_cash = available_cash - ?, total_equity = total_equity - 0
       WHERE user_id = ?`,
      [amount, strategy.user_id]
    );
    const [positionResult] = await conn.execute(
      `INSERT INTO simulation_positions
        (user_id, strategy_id, stock_code, stock_name, quantity, available_quantity, avg_cost, last_price, highest_price, status, opened_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      [
        strategy.user_id,
        strategy.id,
        quote.code,
        quote.name,
        quantity,
        quantity,
        round4(quote.price),
        round4(quote.price),
        round4(quote.price),
        formatSqlDateTime()
      ]
    );
    const positionId = Number(positionResult.insertId);
    await recordFilledOrder(conn, strategy.user_id, strategy.id, positionId, {
      stockCode: quote.code,
      stockName: quote.name,
      side: "buy",
      triggerType: "scan_buy",
      triggerReason,
      price: quote.price,
      quantity,
      meta: {
        streakMinDays: buyConfig.minDownDays,
        capitalPerTrade: buyConfig.capitalPerTrade
      }
    });
    await conn.execute(
      "UPDATE simulation_strategies SET last_buy_date = ?, last_run_at = ? WHERE id = ?",
      [getShanghaiParts().date, formatSqlDateTime(), strategy.id]
    );
    await conn.commit();
    await insertLog(strategy.user_id, strategy.id, "trade", `\u6A21\u62DF\u4E70\u5165 ${quote.name}(${quote.code})`, {
      quantity,
      price: quote.price,
      amount,
      triggerReason
    });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
async function sellPosition(position, price, triggerType, triggerReason) {
  const amount = round2(num(position.quantity) * price);
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE simulation_positions
       SET status = 'closed', available_quantity = 0, last_price = ?, closed_at = ?, close_price = ?, close_reason = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [round4(price), formatSqlDateTime(), round4(price), triggerReason, position.id]
    );
    await conn.execute(
      "UPDATE simulation_accounts SET available_cash = available_cash + ? WHERE user_id = ?",
      [amount, position.user_id]
    );
    await recordFilledOrder(conn, position.user_id, position.strategy_id, position.id, {
      stockCode: position.stock_code,
      stockName: position.stock_name,
      side: "sell",
      triggerType,
      triggerReason,
      price,
      quantity: num(position.quantity),
      meta: {
        avgCost: num(position.avg_cost),
        highestPrice: num(position.highest_price)
      }
    });
    await conn.commit();
    await insertLog(position.user_id, position.strategy_id, "trade", `\u6A21\u62DF\u5356\u51FA ${position.stock_name || position.stock_code}`, {
      quantity: position.quantity,
      price,
      amount,
      triggerReason
    });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
async function evaluateSellSide(strategy, sellConfig, nowParts = getShanghaiParts()) {
  const positions = await query(
    "SELECT * FROM simulation_positions WHERE user_id = ? AND strategy_id = ? AND status = 'open' ORDER BY opened_at ASC",
    [strategy.user_id, strategy.id]
  );
  if (!positions.length || !inTradingSession(nowParts)) {
    return { sold: 0 };
  }
  const quotes = await fetchQuotes(positions.map((item) => item.stock_code));
  const quoteMap = new Map(quotes.map((item) => [item.code.toLowerCase(), item]));
  let sold = 0;
  for (const position of positions) {
    const quote = quoteMap.get(position.stock_code.toLowerCase());
    if (!quote || quote.price <= 0) continue;
    const nextHigh = Math.max(num(position.highest_price), quote.price);
    await execute(
      "UPDATE simulation_positions SET last_price = ?, highest_price = ? WHERE id = ?",
      [round4(quote.price), round4(nextHigh), position.id]
    );
    const avgCost = num(position.avg_cost);
    const breakEvenPrice = avgCost * (1 + num(sellConfig.breakEvenBufferPct) / 100);
    const profitPct = avgCost > 0 ? (quote.price - avgCost) / avgCost * 100 : 0;
    const drawdownPct = nextHigh > 0 ? (nextHigh - quote.price) / nextHigh * 100 : 0;
    if (num(sellConfig.stopLossPct) > 0 && quote.price <= avgCost * (1 - num(sellConfig.stopLossPct) / 100)) {
      await sellPosition(position, quote.price, "stop_loss", `\u8DCC\u7834\u6B62\u635F ${sellConfig.stopLossPct}%`);
      sold += 1;
      continue;
    }
    if (sellConfig.morningBreakEvenEnabled && isMorningSession(nowParts) && toTimeValue(nowParts.time) <= toTimeValue(sellConfig.morningBreakEvenEnd) && quote.price >= breakEvenPrice) {
      await sellPosition(position, quote.price, "break_even", "\u65E9\u76D8\u89E6\u53CA\u6210\u672C\u7EBF\u9644\u8FD1\u6B62\u76C8\u79BB\u573A");
      sold += 1;
      continue;
    }
    if (sellConfig.trailingStopEnabled && profitPct >= num(sellConfig.minProfitForTrailPct) && drawdownPct >= num(sellConfig.trailingPullbackPct)) {
      await sellPosition(position, quote.price, "trailing_stop", "\u4E0A\u6DA8\u540E\u51FA\u73B0\u56DE\u64A4\uFF0C\u4FDD\u62A4\u6D6E\u76C8");
      sold += 1;
    }
  }
  return { sold };
}
async function evaluateBuySide(strategy, buyConfig, riskConfig, nowParts = getShanghaiParts()) {
  if (toTimeValue(nowParts.time) < toTimeValue(buyConfig.scanTime) || toTimeValue(nowParts.time) > toTimeValue("14:57")) {
    return { bought: 0 };
  }
  if (strategy.last_buy_date === nowParts.date && !riskConfig.allowSameDayReentry) {
    return { bought: 0 };
  }
  const openPositions = await query(
    "SELECT * FROM simulation_positions WHERE user_id = ? AND strategy_id = ? AND status = 'open'",
    [strategy.user_id, strategy.id]
  );
  if (openPositions.length >= Math.max(1, num(riskConfig.maxOpenPositions))) {
    return { bought: 0 };
  }
  const candidates = await fetchStreakCandidates(Math.max(2, num(buyConfig.minDownDays)));
  const heldCodes = new Set(
    (await query(
      "SELECT stock_code FROM simulation_positions WHERE user_id = ? AND status = 'open'",
      [strategy.user_id]
    )).map((item) => item.stock_code.toLowerCase())
  );
  const filtered = candidates.filter((item) => !heldCodes.has(item.code.toLowerCase()));
  const pickIndex = Math.max(0, num(buyConfig.pickRank) - 1);
  const target = filtered[pickIndex];
  if (!target) {
    await insertLog(strategy.user_id, strategy.id, "info", "\u672A\u627E\u5230\u7B26\u5408\u6761\u4EF6\u7684\u4E70\u5165\u5019\u9009", {
      minDownDays: buyConfig.minDownDays,
      pickRank: buyConfig.pickRank
    });
    return { bought: 0 };
  }
  const [quote] = await fetchQuotes([target.code]);
  if (!quote || quote.price <= 0) {
    await insertLog(strategy.user_id, strategy.id, "warn", "\u5019\u9009\u80A1\u884C\u60C5\u83B7\u53D6\u5931\u8D25\uFF0C\u8DF3\u8FC7\u672C\u6B21\u4E70\u5165", {
      stockCode: target.code
    });
    return { bought: 0 };
  }
  await buyPosition(strategy, quote, buyConfig, `14:40 \u540E\u626B\u63CF ${buyConfig.minDownDays} \u8FDE\u8DCC\uFF0C\u62E9\u5F3A\u53CD\u8F6C\u5019\u9009`);
  return { bought: 1 };
}
async function evaluateStrategy(strategy) {
  const nowParts = getShanghaiParts();
  const buyConfig = parseJson(strategy.buy_config_json, getDefaultBuyConfig());
  const sellConfig = parseJson(strategy.sell_config_json, getDefaultSellConfig());
  const riskConfig = parseJson(strategy.risk_config_json, getDefaultRiskConfig());
  const sellResult = await evaluateSellSide(strategy, sellConfig, nowParts);
  const buyResult = await evaluateBuySide(strategy, buyConfig, riskConfig, nowParts);
  await execute("UPDATE simulation_strategies SET last_run_at = ? WHERE id = ?", [formatSqlDateTime(), strategy.id]);
  await refreshSimulationAccountEquity(strategy.user_id);
  return {
    bought: buyResult.bought,
    sold: sellResult.sold
  };
}
async function runUserSimulation(userId) {
  const strategies = await query(
    "SELECT * FROM simulation_strategies WHERE user_id = ? AND enabled = 1 ORDER BY updated_at DESC",
    [userId]
  );
  const results = [];
  for (const strategy of strategies) {
    if (runningStrategyIds.has(strategy.id)) {
      results.push({ strategyId: strategy.id, name: strategy.name, bought: 0, sold: 0, skipped: true });
      continue;
    }
    try {
      runningStrategyIds.add(strategy.id);
      await ensureSimulationAccount(strategy.user_id);
      const result = await evaluateStrategy(strategy);
      results.push({ strategyId: strategy.id, name: strategy.name, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await insertLog(userId, strategy.id, "error", "\u7B56\u7565\u6267\u884C\u5931\u8D25", { error: message });
      results.push({ strategyId: strategy.id, name: strategy.name, bought: 0, sold: 0, error: message });
    } finally {
      runningStrategyIds.delete(strategy.id);
    }
  }
  await refreshSimulationAccountEquity(userId);
  return results;
}
async function runAllEnabledSimulations() {
  const strategies = await query(
    "SELECT * FROM simulation_strategies WHERE enabled = 1 ORDER BY user_id ASC, updated_at DESC"
  );
  for (const strategy of strategies) {
    if (runningStrategyIds.has(strategy.id)) {
      continue;
    }
    try {
      runningStrategyIds.add(strategy.id);
      await ensureSimulationAccount(strategy.user_id);
      await evaluateStrategy(strategy);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await insertLog(strategy.user_id, strategy.id, "error", "\u81EA\u52A8\u6A21\u62DF\u6267\u884C\u5931\u8D25", { error: message });
    } finally {
      runningStrategyIds.delete(strategy.id);
    }
  }
}
function startSimulationScheduler() {
  const tick = async () => {
    try {
      await runAllEnabledSimulations();
    } catch (error) {
      console.error("[simulation] scheduler failed", error);
    }
  };
  tick();
  return setInterval(tick, 60 * 1e3);
}

// server/routes/simulation.ts
function createSimulationRouter() {
  const router = Router6();
  router.use(requireAuth);
  router.get("/account", async (req, res) => {
    try {
      await refreshSimulationAccountEquity(req.userId);
      const account = await ensureSimulationAccount(req.userId);
      const positions = await query(
        "SELECT * FROM simulation_positions WHERE user_id = ? AND status = 'open' ORDER BY opened_at DESC",
        [req.userId]
      );
      const marketValue = positions.reduce((sum, item) => sum + Number(item.last_price) * Number(item.quantity), 0);
      const floatingPnl = positions.reduce(
        (sum, item) => sum + (Number(item.last_price) - Number(item.avg_cost)) * Number(item.quantity),
        0
      );
      res.json({
        userId: account.user_id,
        initialCash: Number(account.initial_cash),
        availableCash: Number(account.available_cash),
        totalEquity: Number(account.total_equity),
        marketValue,
        floatingPnl,
        positionCount: positions.length,
        createdAt: account.created_at,
        updatedAt: account.updated_at
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.post("/account/reset", async (req, res) => {
    try {
      const initialCash = Math.max(1e4, Number(req.body?.initialCash) || 0);
      if (!initialCash) {
        return res.status(400).json({ error: "initialCash \u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E14\u81F3\u5C11 10000" });
      }
      await execute("DELETE FROM simulation_positions WHERE user_id = ?", [req.userId]);
      await execute("DELETE FROM simulation_orders WHERE user_id = ?", [req.userId]);
      await execute("DELETE FROM simulation_logs WHERE user_id = ?", [req.userId]);
      await execute("DELETE FROM simulation_strategies WHERE user_id = ?", [req.userId]);
      await execute(
        `INSERT INTO simulation_accounts (user_id, initial_cash, available_cash, total_equity)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE initial_cash = VALUES(initial_cash), available_cash = VALUES(available_cash), total_equity = VALUES(total_equity)`,
        [req.userId, initialCash, initialCash, initialCash]
      );
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.get("/positions", async (req, res) => {
    try {
      const rows = await query(
        "SELECT * FROM simulation_positions WHERE user_id = ? ORDER BY status ASC, opened_at DESC LIMIT 200",
        [req.userId]
      );
      res.json(rows.map((row) => ({
        ...row,
        avg_cost: Number(row.avg_cost),
        last_price: Number(row.last_price),
        highest_price: Number(row.highest_price),
        close_price: row.close_price == null ? null : Number(row.close_price),
        pnl: row.status === "open" ? (Number(row.last_price) - Number(row.avg_cost)) * Number(row.quantity) : row.close_price == null ? 0 : (Number(row.close_price) - Number(row.avg_cost)) * Number(row.quantity)
      })));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.get("/orders", async (req, res) => {
    try {
      const rows = await query(
        "SELECT * FROM simulation_orders WHERE user_id = ? ORDER BY executed_at DESC, id DESC LIMIT 200",
        [req.userId]
      );
      res.json(rows.map((row) => ({
        ...row,
        price: Number(row.price),
        amount: Number(row.amount)
      })));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.get("/logs", async (req, res) => {
    try {
      const rows = await query(
        "SELECT * FROM simulation_logs WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 200",
        [req.userId]
      );
      res.json(rows.map((row) => ({
        ...row,
        detail: row.detail_json ? JSON.parse(row.detail_json) : null
      })));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.get("/strategies", async (req, res) => {
    try {
      const rows = await query(
        "SELECT * FROM simulation_strategies WHERE user_id = ? ORDER BY updated_at DESC",
        [req.userId]
      );
      res.json(rows.map(toStrategyDto));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.post("/strategies", async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      if (!name) {
        return res.status(400).json({ error: "\u7B56\u7565\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A" });
      }
      const buyConfig = { ...getDefaultBuyConfig(), ...req.body?.buyConfig || {} };
      const sellConfig = { ...getDefaultSellConfig(), ...req.body?.sellConfig || {} };
      const riskConfig = { ...getDefaultRiskConfig(), ...req.body?.riskConfig || {} };
      const result = await execute(
        `INSERT INTO simulation_strategies
          (user_id, name, enabled, preset_key, buy_config_json, sell_config_json, risk_config_json, last_buy_date, last_run_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        [
          req.userId,
          name,
          req.body?.enabled === false ? 0 : 1,
          String(req.body?.presetKey || "five_day_down_rebound"),
          JSON.stringify(buyConfig),
          JSON.stringify(sellConfig),
          JSON.stringify(riskConfig)
        ]
      );
      res.json({ id: result.insertId, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.put("/strategies/:id", async (req, res) => {
    try {
      const existing = await query(
        "SELECT * FROM simulation_strategies WHERE id = ? AND user_id = ?",
        [req.params.id, req.userId]
      );
      if (!existing.length) {
        return res.status(404).json({ error: "\u7B56\u7565\u4E0D\u5B58\u5728" });
      }
      const current = toStrategyDto(existing[0]);
      const name = String(req.body?.name || current.name).trim();
      if (!name) {
        return res.status(400).json({ error: "\u7B56\u7565\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A" });
      }
      const buyConfig = { ...current.buyConfig, ...req.body?.buyConfig || {} };
      const sellConfig = { ...current.sellConfig, ...req.body?.sellConfig || {} };
      const riskConfig = { ...current.riskConfig, ...req.body?.riskConfig || {} };
      await execute(
        `UPDATE simulation_strategies
         SET name = ?, enabled = ?, preset_key = ?, buy_config_json = ?, sell_config_json = ?, risk_config_json = ?
         WHERE id = ? AND user_id = ?`,
        [
          name,
          req.body?.enabled === false ? 0 : 1,
          String(req.body?.presetKey || current.presetKey),
          JSON.stringify(buyConfig),
          JSON.stringify(sellConfig),
          JSON.stringify(riskConfig),
          req.params.id,
          req.userId
        ]
      );
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.delete("/strategies/:id", async (req, res) => {
    try {
      await execute("DELETE FROM simulation_strategies WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  router.post("/run", async (req, res) => {
    try {
      await ensureSimulationAccount(req.userId);
      const results = await runUserSimulation(req.userId);
      res.json({ ok: true, results });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });
  return router;
}

// server/index.ts
var { decode } = iconv;
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var rootDir = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(rootDir, ".env.local") });
dotenv.config({ path: path.join(rootDir, ".env") });
function previewValue(value, limit = 400) {
  if (value == null) return value;
  let text = "";
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text.length > limit) return `${text.slice(0, limit)}...`;
  return text;
}
function logRequestStart(tag, info) {
  const start2 = Date.now();
  console.info(`[${tag}] request start`, info);
  return start2;
}
function logRequestOk(tag, start2, info) {
  console.info(`[${tag}] request ok`, { ...info, ms: Date.now() - start2 });
}
function logRequestError(tag, start2, err, info) {
  const status = err?.response?.status;
  const code = err?.code;
  const message = err?.message || String(err);
  const detail = previewValue(err?.response?.data);
  console.error(`[${tag}] request error`, {
    ...info,
    ms: Date.now() - start2,
    status,
    code,
    message,
    detail
  });
}
async function fetchEastmoneyClist(params) {
  const url = "https://push2.eastmoney.com/api/qt/clist/get";
  const start2 = logRequestStart("eastmoney:clist", {
    url,
    params,
    timeout: 2e4
  });
  try {
    const resp = await axios2.get(url, {
      params,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://quote.eastmoney.com/"
      },
      timeout: 2e4
    });
    logRequestOk("eastmoney:clist", start2, { status: resp.status });
    return resp.data?.data?.diff || [];
  } catch (e) {
    logRequestError("eastmoney:clist", start2, e, {});
    throw e;
  }
}
function mapAshareMarketFs() {
  return "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23";
}
async function fetchAshareSnapshot(limit = 200) {
  const fields = "f12,f14,f2,f3,f4,f5,f6,f15,f16,f17";
  const diff = await fetchEastmoneyClist({
    pn: 1,
    pz: Math.min(limit, 500),
    po: 1,
    np: 1,
    fltt: 2,
    invt: 2,
    fid: "f6",
    // 成交额
    fs: mapAshareMarketFs(),
    fields
  });
  return diff.map((x) => ({
    code: String(x.f12 || "").toLowerCase(),
    name: String(x.f14 || ""),
    price: x.f2,
    percent: x.f3,
    updown: x.f4,
    volume: x.f5,
    amount: x.f6,
    high: x.f15,
    low: x.f16,
    open: x.f17
  })).filter((s) => s.code && s.name);
}
async function fetchKline(params) {
  const { code, period, count } = params;
  const symbol = String(code || "").toLowerCase();
  const periodMap = {
    daily: "day",
    weekly: "week",
    monthly: "month"
  };
  const p = periodMap[period] || "day";
  const url = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get";
  const param = `${symbol},${p},,,${count},qfq`;
  const start2 = logRequestStart("tencent:kline", { url, param });
  try {
    const resp = await axios2.get(url, {
      params: { param },
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://web.ifzq.gtimg.cn/"
      },
      timeout: 15e3
    });
    logRequestOk("tencent:kline", start2, { status: resp.status });
    const stockData = resp.data?.data?.[symbol];
    const bars = period === "weekly" ? stockData?.qfqweek || stockData?.week || [] : period === "monthly" ? stockData?.qfqmonth || stockData?.month || [] : stockData?.day || stockData?.qfqday || [];
    return bars.map((b) => b.join(","));
  } catch (e) {
    logRequestError("tencent:kline", start2, e, { symbol });
    throw e;
  }
}
var app = express();
var PORT = 3001;
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] || "Content-Type"
  );
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
function inferAsharePrefix(code6) {
  const s = String(code6 || "").replace(/\D/g, "");
  if (s.startsWith("6")) return "sh";
  if (s.startsWith("0") || s.startsWith("3")) return "sz";
  return "bj";
}
function toAshareCode(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s.startsWith("sh") || s.startsWith("sz") || s.startsWith("bj")) return s;
  const digits = s.replace(/\D/g, "");
  if (!digits) return s;
  const prefix = inferAsharePrefix(digits);
  return `${prefix}${digits}`;
}
function sma(values, period) {
  const out = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}
function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const chg = values[i] - values[i - 1];
    if (chg >= 0) gain += chg;
    else loss -= chg;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const chg = values[i] - values[i - 1];
    const g = chg > 0 ? chg : 0;
    const l = chg < 0 ? -chg : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}
function atr(bars, period = 14) {
  const out = new Array(bars.length).fill(null);
  if (bars.length < period + 1) return out;
  const tr = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      tr.push(bars[i].high - bars[i].low);
    } else {
      const prevClose = bars[i - 1].close;
      const highLow = bars[i].high - bars[i].low;
      const highClose = Math.abs(bars[i].high - prevClose);
      const lowClose = Math.abs(bars[i].low - prevClose);
      tr.push(Math.max(highLow, highClose, lowClose));
    }
  }
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    sum += tr[i];
    if (i === period - 1) {
      out[i] = sum / period;
    } else if (i >= period) {
      const prev = out[i - 1];
      if (prev != null) out[i] = (prev * (period - 1) + tr[i]) / period;
    }
  }
  return out;
}
function analyzeSwingPullback(bars) {
  const trendMa = 20;
  const pullbackMa = 10;
  const slopeLookback = 5;
  const strongDist = 1;
  const weakDist = 2;
  const atrPeriod = 14;
  const atrStopMult = 1;
  const atrTakeMult = 2.2;
  const closes = bars.map((b) => b.close);
  const maTrend = sma(closes, trendMa);
  const maPull = sma(closes, pullbackMa);
  const a = atr(bars, atrPeriod);
  const i = bars.length - 1;
  const c = closes[i];
  const reasons = [];
  let score = 0;
  const maTNow = maTrend[i];
  const maTPrev = maTrend[i - slopeLookback];
  if (maTNow != null && maTPrev != null && maTNow > maTPrev) {
    reasons.push("\u8D8B\u52BF\u5411\u4E0A\uFF0820\u65E5\u5747\u7EBF\u62AC\u5347\uFF09");
    score += 35;
  } else {
    reasons.push("\u8D8B\u52BF\u4E0D\u660E\uFF08\u66F4\u504F\u9707\u8361\uFF09");
  }
  const maPNow = maPull[i];
  if (maPNow != null) {
    const distPct = Math.abs(c - maPNow) / maPNow * 100;
    if (distPct <= strongDist) {
      reasons.push(`\u56DE\u8E29\u5230\u4F4D\uFF08\u8DDD10\u65E5\u5747\u7EBF\u7EA6 ${distPct.toFixed(2)}%\uFF09`);
      score += 35;
    } else if (distPct <= weakDist) {
      reasons.push(`\u63A5\u8FD1\u56DE\u8E29\u4F4D\uFF08\u8DDD10\u65E5\u5747\u7EBF\u7EA6 ${distPct.toFixed(2)}%\uFF09`);
      score += 20;
    } else {
      reasons.push(`\u79BB\u56DE\u8E29\u4F4D\u504F\u8FDC\uFF08\u8DDD10\u65E5\u5747\u7EBF\u7EA6 ${distPct.toFixed(2)}%\uFF09`);
    }
    if (c >= maPNow) {
      reasons.push("\u56DE\u8E29\u672A\u7834\u4F4D\uFF08\u6536\u76D8\u572810\u65E5\u7EBF\u4E4B\u4E0A\uFF09");
      score += 20;
    } else {
      reasons.push("\u56DE\u8E29\u7834\u4F4D\uFF08\u6536\u76D8\u8DCC\u783410\u65E5\u7EBF\uFF0C\u9700\u8C28\u614E\uFF09");
      score += 5;
    }
  }
  score = Math.min(100, score);
  const atrNow = a[i] ?? 0;
  const entry = c;
  const stop = atrNow ? c - atrStopMult * atrNow : c * 0.97;
  const take = atrNow ? c + atrTakeMult * atrNow : c * 1.08;
  let signal = "none";
  if (score >= 70) signal = "buy";
  else if (score >= 45) signal = "watch";
  return { signal, score, reason: reasons, entry, stop, take };
}
function analyzeReversalRSI(bars) {
  const closes = bars.map((b) => b.close);
  const rs = rsi(closes, 14);
  const maFast = sma(closes, 5);
  const maTrend = sma(closes, 20);
  const a = atr(bars, 14);
  const i = bars.length - 1;
  const r = rs[i];
  const c = closes[i];
  const prev = closes[i - 1] ?? c;
  const reasons = [];
  let score = 0;
  if (r != null) {
    if (r < 25) {
      reasons.push(`\u8D85\u8DCC\uFF08RSI=${r.toFixed(1)}\uFF09`);
      score += 45;
    } else if (r < 30) {
      reasons.push(`\u504F\u5F31\uFF08RSI=${r.toFixed(1)}\uFF09`);
      score += 30;
    } else if (r < 35) {
      reasons.push(`\u5F31\u8F6C\u7A33\uFF08RSI=${r.toFixed(1)}\uFF09`);
      score += 15;
    }
  }
  if (maFast[i] != null && c > maFast[i]) {
    reasons.push("\u53CD\u8F6C\u786E\u8BA4\uFF08\u6536\u76D8\u7AD9\u4E0A\u77ED\u5747\u7EBF\uFF09");
    score += 20;
  }
  if (c > prev) {
    reasons.push("\u6536\u76D8\u9AD8\u4E8E\u6628\u6536");
    score += 10;
  }
  if (maTrend[i] != null && c < maTrend[i]) {
    reasons.push("\u4ECD\u572820\u65E5\u7EBF\u4E0B\uFF08\u8BD5\u9519\u601D\u8DEF\uFF09");
    score += 5;
  } else if (maTrend[i] != null) {
    reasons.push("\u56DE\u523020\u65E5\u7EBF\u9644\u8FD1/\u4E4B\u4E0A\uFF08\u66F4\u50CF\u4F01\u7A33\uFF09");
    score += 10;
  }
  score = Math.min(100, score);
  const atrNow = a[i] ?? 0;
  const entry = c;
  const stop = atrNow ? c - 1.2 * atrNow : c * 0.97;
  const take = atrNow ? c + 2 * atrNow : c * 1.06;
  let signal = "none";
  if (r != null && r < 30 && score >= 55) signal = "buy";
  else if (r != null && r < 35 && score >= 35) signal = "watch";
  return { signal, score, reason: reasons, entry, stop, take };
}
async function fetchAshareKlineBars(code, count = 140) {
  const raw = await fetchKline({ code, period: "daily", count });
  return (raw || []).map((line) => String(line).split(",")).filter((arr) => arr.length >= 6).map((arr) => {
    const date = arr[0];
    const open = Number(arr[1]);
    const close = Number(arr[2]);
    const high = Number(arr[3]);
    const low = Number(arr[4]);
    const volume = Number(arr[5]);
    const amount = arr[6] != null ? Number(arr[6]) : void 0;
    const ts = Date.parse(date + "T00:00:00+08:00");
    return { ts, date, open, close, high, low, volume, amount };
  }).filter((b) => Number.isFinite(b.ts) && Number.isFinite(b.close));
}
async function mapLimitConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.max(1, limit)).fill(0).map(async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
app.post("/api/a/scan", async (req, res) => {
  try {
    const { scope, watchlistCodes, marketLimit, topN } = req.body || {};
    let codes = [];
    let snapshot = [];
    if (String(scope || "market") === "watchlist") {
      codes = (Array.isArray(watchlistCodes) ? watchlistCodes : []).map((c) => toAshareCode(String(c))).filter(
        (c) => c.startsWith("sh") || c.startsWith("sz") || c.startsWith("bj")
      );
    } else {
      const limit = Math.min(Math.max(Number(marketLimit) || 400, 50), 800);
      snapshot = await fetchAshareSnapshot(limit);
      codes = snapshot.map((x) => toAshareCode(String(x.code))).filter(Boolean);
    }
    codes = Array.from(new Set(codes)).slice(0, 900);
    if (!codes.length) return res.json({ candidates: [], note: "empty" });
    const concurrency = 8;
    const results = await mapLimitConcurrency(
      codes,
      concurrency,
      async (code) => {
        try {
          const bars = await fetchAshareKlineBars(code, 140);
          if (bars.length < 60) return null;
          const swing = analyzeSwingPullback(bars);
          const rev = analyzeReversalRSI(bars);
          const best = swing.score >= rev.score ? { ...swing, strategy: "swing_pullback" } : { ...rev, strategy: "reversal_rsi" };
          const last = bars[bars.length - 1];
          const prev = bars[bars.length - 2] || last;
          const pct = prev.close ? (last.close - prev.close) / prev.close * 100 : void 0;
          const name = (() => {
            const digits = code.replace(/^(sh|sz|bj)/, "");
            const hit = snapshot.find((x) => String(x.code) === digits);
            return hit?.name;
          })();
          const amount = (() => {
            const digits = code.replace(/^(sh|sz|bj)/, "");
            const hit = snapshot.find((x) => String(x.code) === digits);
            return hit?.amount;
          })();
          const sig = {
            code,
            name,
            strategy: best.strategy,
            signal: best.signal,
            score: best.score,
            reason: best.reason,
            entry: best.entry,
            stop: best.stop,
            take: best.take,
            last: { close: last.close, percent: pct, amount }
          };
          return sig;
        } catch {
          return null;
        }
      }
    );
    const cleaned = results.filter(Boolean);
    cleaned.sort((a, b) => (b.score || 0) - (a.score || 0));
    res.json({
      scope: String(scope || "market"),
      candidates: cleaned.slice(
        0,
        Math.min(Math.max(Number(topN) || 80, 10), 200)
      )
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
});
app.use("/api/auth", createAuthRouter());
app.use("/api/watchlist", createWatchlistRouter());
app.use("/api/trades", createTradesRouter());
app.use("/api/journals", createJournalsRouter());
app.use("/api/admin", createAdminRouter());
app.use("/api/simulation", createSimulationRouter());
var isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
  const distPath = path.resolve(rootDir, "dist");
  app.use(express.static(distPath, { maxAge: "7d" }));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
async function start() {
  try {
    await initDatabase();
    console.log("[db] MySQL connected & tables ready");
  } catch (e) {
    console.error("[db] MySQL init failed, running without database:", e instanceof Error ? e.message : e);
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `Stock API ${isProduction ? "(production)" : "(dev)"}: http://localhost:${PORT}`
    );
    startSimulationScheduler();
  });
}
start();
