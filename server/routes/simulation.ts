import { Router, Response } from "express";
import { execute, query } from "../db.ts";
import { AuthRequest, requireAuth } from "../auth.ts";
import {
  ensureSimulationAccount,
  getDefaultBuyConfig,
  getDefaultRiskConfig,
  getDefaultSellConfig,
  refreshSimulationAccountEquity,
  runUserSimulation,
  SimulationLogRow,
  SimulationOrderRow,
  SimulationPositionRow,
  SimulationStrategyRow,
  toStrategyDto,
} from "../simulator.ts";

export function createSimulationRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/account", async (req: AuthRequest, res: Response) => {
    try {
      await refreshSimulationAccountEquity(req.userId!);
      const account = await ensureSimulationAccount(req.userId!);
      const positions = await query<SimulationPositionRow[]>(
        "SELECT * FROM simulation_positions WHERE user_id = ? AND status = 'open' ORDER BY opened_at DESC",
        [req.userId],
      );
      const marketValue = positions.reduce((sum, item) => sum + Number(item.last_price) * Number(item.quantity), 0);
      const floatingPnl = positions.reduce(
        (sum, item) => sum + (Number(item.last_price) - Number(item.avg_cost)) * Number(item.quantity),
        0,
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
        updatedAt: account.updated_at,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.post("/account/reset", async (req: AuthRequest, res: Response) => {
    try {
      const initialCash = Math.max(10000, Number(req.body?.initialCash) || 0);
      if (!initialCash) {
        return res.status(400).json({ error: "initialCash 不能为空，且至少 10000" });
      }

      await execute("DELETE FROM simulation_positions WHERE user_id = ?", [req.userId]);
      await execute("DELETE FROM simulation_orders WHERE user_id = ?", [req.userId]);
      await execute("DELETE FROM simulation_logs WHERE user_id = ?", [req.userId]);
      await execute("DELETE FROM simulation_strategies WHERE user_id = ?", [req.userId]);
      await execute(
        `INSERT INTO simulation_accounts (user_id, initial_cash, available_cash, total_equity)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE initial_cash = VALUES(initial_cash), available_cash = VALUES(available_cash), total_equity = VALUES(total_equity)`,
        [req.userId, initialCash, initialCash, initialCash],
      );

      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.get("/positions", async (req: AuthRequest, res: Response) => {
    try {
      const rows = await query<SimulationPositionRow[]>(
        "SELECT * FROM simulation_positions WHERE user_id = ? ORDER BY status ASC, opened_at DESC LIMIT 200",
        [req.userId],
      );
      res.json(rows.map((row) => ({
        ...row,
        avg_cost: Number(row.avg_cost),
        last_price: Number(row.last_price),
        highest_price: Number(row.highest_price),
        close_price: row.close_price == null ? null : Number(row.close_price),
        pnl:
          row.status === "open"
            ? (Number(row.last_price) - Number(row.avg_cost)) * Number(row.quantity)
            : row.close_price == null
              ? 0
              : (Number(row.close_price) - Number(row.avg_cost)) * Number(row.quantity),
      })));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.get("/orders", async (req: AuthRequest, res: Response) => {
    try {
      const rows = await query<SimulationOrderRow[]>(
        "SELECT * FROM simulation_orders WHERE user_id = ? ORDER BY executed_at DESC, id DESC LIMIT 200",
        [req.userId],
      );
      res.json(rows.map((row) => ({
        ...row,
        price: Number(row.price),
        amount: Number(row.amount),
      })));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.get("/logs", async (req: AuthRequest, res: Response) => {
    try {
      const rows = await query<SimulationLogRow[]>(
        "SELECT * FROM simulation_logs WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 200",
        [req.userId],
      );
      res.json(rows.map((row) => ({
        ...row,
        detail: row.detail_json ? JSON.parse(row.detail_json) : null,
      })));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.get("/strategies", async (req: AuthRequest, res: Response) => {
    try {
      const rows = await query<SimulationStrategyRow[]>(
        "SELECT * FROM simulation_strategies WHERE user_id = ? ORDER BY updated_at DESC",
        [req.userId],
      );
      res.json(rows.map(toStrategyDto));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.post("/strategies", async (req: AuthRequest, res: Response) => {
    try {
      const name = String(req.body?.name || "").trim();
      if (!name) {
        return res.status(400).json({ error: "策略名称不能为空" });
      }

      const buyConfig = { ...getDefaultBuyConfig(), ...(req.body?.buyConfig || {}) };
      const sellConfig = { ...getDefaultSellConfig(), ...(req.body?.sellConfig || {}) };
      const riskConfig = { ...getDefaultRiskConfig(), ...(req.body?.riskConfig || {}) };

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
          JSON.stringify(riskConfig),
        ],
      );
      res.json({ id: result.insertId, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.put("/strategies/:id", async (req: AuthRequest, res: Response) => {
    try {
      const existing = await query<SimulationStrategyRow[]>(
        "SELECT * FROM simulation_strategies WHERE id = ? AND user_id = ?",
        [req.params.id, req.userId],
      );
      if (!existing.length) {
        return res.status(404).json({ error: "策略不存在" });
      }

      const current = toStrategyDto(existing[0]);
      const name = String(req.body?.name || current.name).trim();
      if (!name) {
        return res.status(400).json({ error: "策略名称不能为空" });
      }

      const buyConfig = { ...current.buyConfig, ...(req.body?.buyConfig || {}) };
      const sellConfig = { ...current.sellConfig, ...(req.body?.sellConfig || {}) };
      const riskConfig = { ...current.riskConfig, ...(req.body?.riskConfig || {}) };

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
          req.userId,
        ],
      );

      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.delete("/strategies/:id", async (req: AuthRequest, res: Response) => {
    try {
      await execute("DELETE FROM simulation_strategies WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  router.post("/run", async (req: AuthRequest, res: Response) => {
    try {
      await ensureSimulationAccount(req.userId!);
      const results = await runUserSimulation(req.userId!);
      res.json({ ok: true, results });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
