import { Router, Response } from "express";
import { query, execute } from "../db.ts";
import { requireAuth, AuthRequest } from "../auth.ts";
import { RowDataPacket } from "mysql2/promise";

interface TradeRow extends RowDataPacket {
  id: number;
  stock_code: string;
  stock_name: string;
  direction: "buy" | "sell";
  price: number;
  quantity: number;
  amount: number;
  trade_time: string;
  notes: string;
  created_at: string;
}

export function createTradesRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req: AuthRequest, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const stockCode = req.query.stockCode ? String(req.query.stockCode) : null;

      let sql = "SELECT id, stock_code, stock_name, direction, price, quantity, amount, trade_time, notes, created_at FROM trades WHERE user_id = ?";
      const params: any[] = [req.userId];

      if (stockCode) {
        sql += " AND stock_code = ?";
        params.push(stockCode);
      }

      sql += " ORDER BY trade_time DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);

      const rows = await query<TradeRow[]>(sql, params);
      res.json(rows);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.post("/", async (req: AuthRequest, res: Response) => {
    try {
      const { stockCode, stockName, direction, price, quantity, tradeTime, notes } = req.body || {};
      if (!stockCode || !direction || !price || !quantity || !tradeTime) {
        return res.status(400).json({ error: "缺少必填字段（stockCode, direction, price, quantity, tradeTime）" });
      }
      if (direction !== "buy" && direction !== "sell") {
        return res.status(400).json({ error: "direction 必须是 buy 或 sell" });
      }

      const amount = Number(price) * Number(quantity);
      const result = await execute(
        "INSERT INTO trades (user_id, stock_code, stock_name, direction, price, quantity, amount, trade_time, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [req.userId, stockCode, stockName || "", direction, price, quantity, amount, tradeTime, notes || ""],
      );
      res.json({ id: result.insertId, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.put("/:id", async (req: AuthRequest, res: Response) => {
    try {
      const { stockCode, stockName, direction, price, quantity, tradeTime, notes } = req.body || {};
      if (!stockCode || !direction || !price || !quantity || !tradeTime) {
        return res.status(400).json({ error: "缺少必填字段" });
      }

      const amount = Number(price) * Number(quantity);
      await execute(
        "UPDATE trades SET stock_code = ?, stock_name = ?, direction = ?, price = ?, quantity = ?, amount = ?, trade_time = ?, notes = ? WHERE id = ? AND user_id = ?",
        [stockCode, stockName || "", direction, price, quantity, amount, tradeTime, notes || "", req.params.id, req.userId],
      );
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.delete("/:id", async (req: AuthRequest, res: Response) => {
    try {
      await execute("DELETE FROM trades WHERE id = ? AND user_id = ?", [
        req.params.id,
        req.userId,
      ]);
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  // 持仓汇总：按股票分组统计净持仓
  router.get("/positions", async (req: AuthRequest, res: Response) => {
    try {
      const rows = await query<RowDataPacket[]>(
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
        [req.userId],
      );
      res.json(rows);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
