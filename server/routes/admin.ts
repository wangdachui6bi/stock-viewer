import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { query, execute } from "../db.ts";
import { requireAuth, requireAdmin, AuthRequest } from "../auth.ts";
import { RowDataPacket } from "mysql2/promise";

interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  nickname: string;
  role: string;
  created_at: string;
}

export function createAdminRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireAdmin);

  router.get("/users", async (_req: AuthRequest, res: Response) => {
    try {
      const rows = await query<UserRow[]>(
        "SELECT id, username, nickname, role, created_at FROM users ORDER BY created_at DESC",
      );
      res.json(rows);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.post("/users", async (req: AuthRequest, res: Response) => {
    try {
      const { username, password, nickname, role } = req.body || {};

      if (!username || !password) {
        return res.status(400).json({ error: "用户名和密码不能为空" });
      }
      if (typeof username !== "string" || username.trim().length < 2) {
        return res.status(400).json({ error: "用户名至少2个字符" });
      }
      if (/[^a-zA-Z0-9_\-]/.test(username.trim())) {
        return res.status(400).json({ error: "用户名只允许字母、数字、下划线、连字符" });
      }
      if (typeof password !== "string" || password.length < 6) {
        return res.status(400).json({ error: "密码至少6位" });
      }

      const existing = await query<UserRow[]>(
        "SELECT id FROM users WHERE username = ?",
        [username.trim()],
      );
      if (existing.length) {
        return res.status(409).json({ error: `用户名 "${username.trim()}" 已存在` });
      }

      const validRoles = ["user", "admin"];
      const userRole = validRoles.includes(role) ? role : "user";
      const hash = await bcrypt.hash(password, 10);

      const result = await execute(
        "INSERT INTO users (username, password_hash, nickname, role) VALUES (?, ?, ?, ?)",
        [username.trim(), hash, (nickname || "").trim(), userRole],
      );

      res.json({ id: result.insertId, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.put("/users/:id/role", async (req: AuthRequest, res: Response) => {
    try {
      const targetId = Number(req.params.id);
      if (targetId === req.userId) {
        return res.status(400).json({ error: "不能修改自己的角色" });
      }
      const { role } = req.body || {};
      const validRoles = ["user", "admin"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "无效角色" });
      }
      await execute("UPDATE users SET role = ? WHERE id = ?", [role, targetId]);
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.post("/users/:id/reset-password", async (req: AuthRequest, res: Response) => {
    try {
      const { newPassword } = req.body || {};
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "新密码至少6位" });
      }
      const hash = await bcrypt.hash(newPassword, 10);
      await execute("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.params.id]);
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.delete("/users/:id", async (req: AuthRequest, res: Response) => {
    try {
      const targetId = Number(req.params.id);
      if (targetId === req.userId) {
        return res.status(400).json({ error: "不能删除自己" });
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
