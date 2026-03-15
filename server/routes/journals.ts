import { Router, Response } from "express";
import { query, execute } from "../db.ts";
import { requireAuth, AuthRequest } from "../auth.ts";
import { RowDataPacket } from "mysql2/promise";

interface JournalRow extends RowDataPacket {
  id: number;
  title: string;
  content: string;
  trade_date: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

export function createJournalsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req: AuthRequest, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      let sql = "SELECT id, title, content, trade_date, tags, created_at, updated_at FROM journals WHERE user_id = ?";
      const params: any[] = [req.userId];

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

      const rows = await query<JournalRow[]>(sql, params);
      res.json(rows);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.get("/:id", async (req: AuthRequest, res: Response) => {
    try {
      const rows = await query<JournalRow[]>(
        "SELECT id, title, content, trade_date, tags, created_at, updated_at FROM journals WHERE id = ? AND user_id = ?",
        [req.params.id, req.userId],
      );
      if (!rows.length) return res.status(404).json({ error: "笔记不存在" });
      res.json(rows[0]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.post("/", async (req: AuthRequest, res: Response) => {
    try {
      const { title, content, tradeDate, tags } = req.body || {};
      if (!content) return res.status(400).json({ error: "内容不能为空" });

      const tagsStr = Array.isArray(tags) ? tags.join(",") : (tags || "");
      const result = await execute(
        "INSERT INTO journals (user_id, title, content, trade_date, tags) VALUES (?, ?, ?, ?, ?)",
        [req.userId, title || "", content, tradeDate || null, tagsStr],
      );
      res.json({ id: result.insertId, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.put("/:id", async (req: AuthRequest, res: Response) => {
    try {
      const { title, content, tradeDate, tags } = req.body || {};
      if (!content) return res.status(400).json({ error: "内容不能为空" });

      const tagsStr = Array.isArray(tags) ? tags.join(",") : (tags || "");
      await execute(
        "UPDATE journals SET title = ?, content = ?, trade_date = ?, tags = ? WHERE id = ? AND user_id = ?",
        [title || "", content, tradeDate || null, tagsStr, req.params.id, req.userId],
      );
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.delete("/:id", async (req: AuthRequest, res: Response) => {
    try {
      await execute("DELETE FROM journals WHERE id = ? AND user_id = ?", [
        req.params.id,
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
