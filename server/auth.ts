import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { query } from "./db.ts";
import { RowDataPacket } from "mysql2/promise";

export interface AuthRequest extends Request {
  userId?: number;
  username?: string;
  role?: string;
}

interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  password_hash: string;
  nickname: string;
  role: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "未登录" });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as {
      id: number;
      username: string;
      role: string;
    };
    req.userId = payload.id;
    req.username = payload.username;
    req.role = payload.role;
    next();
  } catch {
    return res.status(401).json({ error: "登录已过期，请重新登录" });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.role !== "admin") {
    return res.status(403).json({ error: "需要管理员权限" });
  }
  next();
}

export function createAuthRouter(): Router {
  const router = Router();

  router.post("/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ error: "请输入用户名和密码" });
      }

      const rows = await query<UserRow[]>(
        "SELECT id, username, password_hash, nickname, role FROM users WHERE username = ?",
        [username],
      );

      if (!rows.length) {
        return res.status(401).json({ error: "用户名或密码错误" });
      }

      const user = rows[0];
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(401).json({ error: "用户名或密码错误" });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role || "user" },
        getJwtSecret(),
        { expiresIn: "7d" },
      );

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          role: user.role || "user",
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[auth] login error:", message);
      res.status(500).json({ error: message });
    }
  });

  router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const rows = await query<UserRow[]>(
        "SELECT id, username, nickname, role FROM users WHERE id = ?",
        [req.userId],
      );
      if (!rows.length) return res.status(404).json({ error: "用户不存在" });
      const user = rows[0];
      res.json({
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        role: user.role || "user",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.post("/change-password", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { oldPassword, newPassword } = req.body || {};
      if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: "请输入旧密码和新密码" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: "新密码至少6位" });
      }

      const rows = await query<UserRow[]>(
        "SELECT id, password_hash FROM users WHERE id = ?",
        [req.userId],
      );
      if (!rows.length) return res.status(404).json({ error: "用户不存在" });

      const match = await bcrypt.compare(oldPassword, rows[0].password_hash);
      if (!match) return res.status(401).json({ error: "旧密码错误" });

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
