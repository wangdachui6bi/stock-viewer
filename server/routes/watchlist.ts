import { Router, Response } from "express";
import { query, execute } from "../db.ts";
import { requireAuth, AuthRequest } from "../auth.ts";
import { RowDataPacket } from "mysql2/promise";

interface WatchlistRow extends RowDataPacket {
  id: number;
  stock_code: string;
  stock_name: string;
  market: string;
  notes: string;
  added_at: string;
}

export function createWatchlistRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req: AuthRequest, res: Response) => {
    try {
      const rows = await query<WatchlistRow[]>(
        "SELECT id, stock_code, stock_name, market, notes, added_at FROM watchlist WHERE user_id = ? ORDER BY added_at DESC",
        [req.userId],
      );
      res.json(rows);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.post("/", async (req: AuthRequest, res: Response) => {
    try {
      const { stockCode, stockName, market, notes } = req.body || {};
      if (!stockCode) return res.status(400).json({ error: "缺少股票代码" });

      const result = await execute(
        "INSERT INTO watchlist (user_id, stock_code, stock_name, market, notes) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE stock_name = VALUES(stock_name), market = VALUES(market), notes = VALUES(notes)",
        [req.userId, stockCode, stockName || "", market || "", notes || ""],
      );
      res.json({ id: result.insertId, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.delete("/:id", async (req: AuthRequest, res: Response) => {
    try {
      await execute("DELETE FROM watchlist WHERE id = ? AND user_id = ?", [
        req.params.id,
        req.userId,
      ]);
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.delete("/code/:stockCode", async (req: AuthRequest, res: Response) => {
    try {
      await execute("DELETE FROM watchlist WHERE stock_code = ? AND user_id = ?", [
        req.params.stockCode,
        req.userId,
      ]);
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
