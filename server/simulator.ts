import axios from "axios";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { execute, getConnection, query } from "./db.ts";

const LOCAL_API_BASE = process.env.SIMULATOR_LOCAL_BASE_URL || `http://127.0.0.1:${process.env.PORT || "3001"}/api`;
const DEFAULT_INITIAL_CASH = Number(process.env.SIM_INITIAL_CASH || "1000000");
const DEFAULT_BOARD_LOT = 100;
const SHANGHAI_TZ = "Asia/Shanghai";
const runningStrategyIds = new Set<number>();

export interface SimulationAccountRow extends RowDataPacket {
  user_id: number;
  initial_cash: number;
  available_cash: number;
  total_equity: number;
  created_at: string;
  updated_at: string;
}

export interface SimulationStrategyRow extends RowDataPacket {
  id: number;
  user_id: number;
  name: string;
  enabled: number;
  preset_key: string;
  buy_config_json: string | null;
  sell_config_json: string | null;
  risk_config_json: string | null;
  last_buy_date: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SimulationPositionRow extends RowDataPacket {
  id: number;
  user_id: number;
  strategy_id: number | null;
  stock_code: string;
  stock_name: string;
  quantity: number;
  available_quantity: number;
  avg_cost: number;
  last_price: number;
  highest_price: number;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  close_price: number | null;
  close_reason: string;
  created_at: string;
  updated_at: string;
}

export interface SimulationOrderRow extends RowDataPacket {
  id: number;
  user_id: number;
  strategy_id: number | null;
  position_id: number | null;
  stock_code: string;
  stock_name: string;
  side: "buy" | "sell";
  status: "filled" | "rejected" | "cancelled";
  trigger_type: string;
  trigger_reason: string;
  price: number;
  quantity: number;
  amount: number;
  meta_json: string | null;
  executed_at: string;
  created_at: string;
}

export interface SimulationLogRow extends RowDataPacket {
  id: number;
  user_id: number;
  strategy_id: number | null;
  level: "info" | "warn" | "error" | "trade";
  message: string;
  detail_json: string | null;
  created_at: string;
}

export interface StrategyBuyConfig {
  scanTime: string;
  minDownDays: number;
  pickRank: number;
  capitalPerTrade: number;
  boardLot: number;
}

export interface StrategySellConfig {
  morningBreakEvenEnabled: boolean;
  morningBreakEvenEnd: string;
  breakEvenBufferPct: number;
  trailingStopEnabled: boolean;
  minProfitForTrailPct: number;
  trailingPullbackPct: number;
  stopLossPct: number;
}

export interface StrategyRiskConfig {
  maxOpenPositions: number;
  allowSameDayReentry: boolean;
}

export interface SimulationQuote {
  code: string;
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  percent: number;
}

interface ScanCandidate {
  code: string;
  name: string;
  price: number;
  percent: number;
  streak: number;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return { ...fallback, ...JSON.parse(value) } as T;
  } catch {
    return fallback;
  }
}

export function getDefaultBuyConfig(): StrategyBuyConfig {
  return {
    scanTime: "14:40",
    minDownDays: 5,
    pickRank: 1,
    capitalPerTrade: 50000,
    boardLot: DEFAULT_BOARD_LOT,
  };
}

export function getDefaultSellConfig(): StrategySellConfig {
  return {
    morningBreakEvenEnabled: true,
    morningBreakEvenEnd: "11:30",
    breakEvenBufferPct: 0,
    trailingStopEnabled: true,
    minProfitForTrailPct: 1.2,
    trailingPullbackPct: 0.8,
    stopLossPct: 3,
  };
}

export function getDefaultRiskConfig(): StrategyRiskConfig {
  return {
    maxOpenPositions: 1,
    allowSameDayReentry: false,
  };
}

export function toStrategyDto(row: SimulationStrategyRow) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    enabled: Boolean(row.enabled),
    presetKey: row.preset_key,
    buyConfig: parseJson<StrategyBuyConfig>(row.buy_config_json, getDefaultBuyConfig()),
    sellConfig: parseJson<StrategySellConfig>(row.sell_config_json, getDefaultSellConfig()),
    riskConfig: parseJson<StrategyRiskConfig>(row.risk_config_json, getDefaultRiskConfig()),
    lastBuyDate: row.last_buy_date,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getShanghaiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return {
    date: `${byType.year}-${byType.month}-${byType.day}`,
    time: `${byType.hour}:${byType.minute}`,
    hour: Number(byType.hour || 0),
    minute: Number(byType.minute || 0),
  };
}

function toTimeValue(time: string): number {
  const [hour, minute] = String(time || "00:00").split(":").map((v) => Number(v) || 0);
  return hour * 60 + minute;
}

function inTradingSession(parts = getShanghaiParts()): boolean {
  const value = parts.hour * 60 + parts.minute;
  const morningOpen = 9 * 60 + 30;
  const morningClose = 11 * 60 + 30;
  const afternoonOpen = 13 * 60;
  const afternoonClose = 15 * 60;
  return (value >= morningOpen && value <= morningClose) || (value >= afternoonOpen && value <= afternoonClose);
}

function isMorningSession(parts = getShanghaiParts()): boolean {
  const value = parts.hour * 60 + parts.minute;
  return value >= 9 * 60 + 30 && value <= 11 * 60 + 30;
}

function formatSqlDateTime(date = new Date()): string {
  return new Date(date.getTime() - date.getMilliseconds()).toISOString().slice(0, 19).replace("T", " ");
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

async function fetchQuotes(codes: string[]): Promise<SimulationQuote[]> {
  if (!codes.length) return [];
  const { data } = await axios.get(`${LOCAL_API_BASE}/stock`, {
    params: { codes: codes.join(",") },
    timeout: 20000,
  });

  if (!Array.isArray(data)) return [];

  return data.map((item: any) => ({
    code: String(item.code || ""),
    name: String(item.name || ""),
    price: num(item.price),
    open: num(item.open),
    high: num(item.high),
    low: num(item.low),
    percent: num(item.percent),
  })).filter((item) => item.code && item.price > 0);
}

async function fetchStreakCandidates(minDownDays: number): Promise<ScanCandidate[]> {
  const { data } = await axios.get(`${LOCAL_API_BASE}/streak-scan`, {
    params: { direction: "down", minDays: minDownDays },
    timeout: 300000,
  });

  const rows = Array.isArray(data?.results) ? data.results : [];
  return rows.map((item: any) => ({
    code: String(item.code || ""),
    name: String(item.name || ""),
    price: num(item.price),
    percent: num(item.percent),
    streak: num(item.streak),
  })).filter((item) => item.code);
}

export async function ensureSimulationAccount(userId: number): Promise<SimulationAccountRow> {
  const existing = await query<SimulationAccountRow[]>(
    "SELECT user_id, initial_cash, available_cash, total_equity, created_at, updated_at FROM simulation_accounts WHERE user_id = ?",
    [userId],
  );
  if (existing.length) return existing[0];

  await execute(
    "INSERT INTO simulation_accounts (user_id, initial_cash, available_cash, total_equity) VALUES (?, ?, ?, ?)",
    [userId, DEFAULT_INITIAL_CASH, DEFAULT_INITIAL_CASH, DEFAULT_INITIAL_CASH],
  );

  const rows = await query<SimulationAccountRow[]>(
    "SELECT user_id, initial_cash, available_cash, total_equity, created_at, updated_at FROM simulation_accounts WHERE user_id = ?",
    [userId],
  );
  return rows[0];
}

export async function refreshSimulationAccountEquity(userId: number): Promise<void> {
  const account = await ensureSimulationAccount(userId);
  const positions = await query<SimulationPositionRow[]>(
    "SELECT * FROM simulation_positions WHERE user_id = ? AND status = 'open' ORDER BY opened_at DESC",
    [userId],
  );
  const marketValue = positions.reduce((sum, item) => sum + num(item.last_price) * num(item.quantity), 0);
  const totalEquity = round2(num(account.available_cash) + marketValue);
  await execute("UPDATE simulation_accounts SET total_equity = ? WHERE user_id = ?", [totalEquity, userId]);
}

async function insertLog(
  userId: number,
  strategyId: number | null,
  level: "info" | "warn" | "error" | "trade",
  message: string,
  detail?: Record<string, unknown>,
) {
  await execute(
    "INSERT INTO simulation_logs (user_id, strategy_id, level, message, detail_json) VALUES (?, ?, ?, ?, ?)",
    [userId, strategyId, level, message, detail ? JSON.stringify(detail) : null],
  );
}

async function createRejectedOrder(
  userId: number,
  strategyId: number,
  payload: {
    stockCode: string;
    stockName: string;
    side: "buy" | "sell";
    triggerType: string;
    triggerReason: string;
    price: number;
    quantity: number;
    meta?: Record<string, unknown>;
  },
) {
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
      formatSqlDateTime(),
    ],
  );
}

async function recordFilledOrder(
  conn: PoolConnection,
  userId: number,
  strategyId: number | null,
  positionId: number | null,
  payload: {
    stockCode: string;
    stockName: string;
    side: "buy" | "sell";
    triggerType: string;
    triggerReason: string;
    price: number;
    quantity: number;
    meta?: Record<string, unknown>;
  },
) {
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
      formatSqlDateTime(),
    ],
  );
}

async function buyPosition(
  strategy: SimulationStrategyRow,
  quote: SimulationQuote,
  buyConfig: StrategyBuyConfig,
  triggerReason: string,
) {
  const account = await ensureSimulationAccount(strategy.user_id);
  const lot = Math.max(1, Math.round(num(buyConfig.boardLot) || DEFAULT_BOARD_LOT));
  const quantity = Math.floor(num(buyConfig.capitalPerTrade) / quote.price / lot) * lot;
  if (quantity <= 0) {
    await createRejectedOrder(strategy.user_id, strategy.id, {
      stockCode: quote.code,
      stockName: quote.name,
      side: "buy",
      triggerType: "scan_buy",
      triggerReason: "资金不足以买入一手",
      price: quote.price,
      quantity: lot,
      meta: { requestedCapital: buyConfig.capitalPerTrade },
    });
    await insertLog(strategy.user_id, strategy.id, "warn", "模拟买入被拒绝：不足一手资金", {
      stockCode: quote.code,
      quotePrice: quote.price,
      capitalPerTrade: buyConfig.capitalPerTrade,
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
      triggerReason: "可用资金不足",
      price: quote.price,
      quantity,
      meta: { availableCash: account.available_cash },
    });
    await insertLog(strategy.user_id, strategy.id, "warn", "模拟买入被拒绝：账户可用资金不足", {
      stockCode: quote.code,
      amount,
      availableCash: account.available_cash,
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
      [amount, strategy.user_id],
    );

    const [positionResult]: any = await conn.execute(
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
        formatSqlDateTime(),
      ],
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
        capitalPerTrade: buyConfig.capitalPerTrade,
      },
    });

    await conn.execute(
      "UPDATE simulation_strategies SET last_buy_date = ?, last_run_at = ? WHERE id = ?",
      [getShanghaiParts().date, formatSqlDateTime(), strategy.id],
    );

    await conn.commit();
    await insertLog(strategy.user_id, strategy.id, "trade", `模拟买入 ${quote.name}(${quote.code})`, {
      quantity,
      price: quote.price,
      amount,
      triggerReason,
    });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function sellPosition(
  position: SimulationPositionRow,
  price: number,
  triggerType: string,
  triggerReason: string,
) {
  const amount = round2(num(position.quantity) * price);
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE simulation_positions
       SET status = 'closed', available_quantity = 0, last_price = ?, closed_at = ?, close_price = ?, close_reason = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [round4(price), formatSqlDateTime(), round4(price), triggerReason, position.id],
    );

    await conn.execute(
      "UPDATE simulation_accounts SET available_cash = available_cash + ? WHERE user_id = ?",
      [amount, position.user_id],
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
        highestPrice: num(position.highest_price),
      },
    });

    await conn.commit();
    await insertLog(position.user_id, position.strategy_id, "trade", `模拟卖出 ${position.stock_name || position.stock_code}`, {
      quantity: position.quantity,
      price,
      amount,
      triggerReason,
    });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function evaluateSellSide(
  strategy: SimulationStrategyRow,
  sellConfig: StrategySellConfig,
  nowParts = getShanghaiParts(),
): Promise<{ sold: number }> {
  const positions = await query<SimulationPositionRow[]>(
    "SELECT * FROM simulation_positions WHERE user_id = ? AND strategy_id = ? AND status = 'open' ORDER BY opened_at ASC",
    [strategy.user_id, strategy.id],
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
      [round4(quote.price), round4(nextHigh), position.id],
    );

    const avgCost = num(position.avg_cost);
    const breakEvenPrice = avgCost * (1 + num(sellConfig.breakEvenBufferPct) / 100);
    const profitPct = avgCost > 0 ? ((quote.price - avgCost) / avgCost) * 100 : 0;
    const drawdownPct = nextHigh > 0 ? ((nextHigh - quote.price) / nextHigh) * 100 : 0;

    if (num(sellConfig.stopLossPct) > 0 && quote.price <= avgCost * (1 - num(sellConfig.stopLossPct) / 100)) {
      await sellPosition(position, quote.price, "stop_loss", `跌破止损 ${sellConfig.stopLossPct}%`);
      sold += 1;
      continue;
    }

    if (
      sellConfig.morningBreakEvenEnabled &&
      isMorningSession(nowParts) &&
      toTimeValue(nowParts.time) <= toTimeValue(sellConfig.morningBreakEvenEnd) &&
      quote.price >= breakEvenPrice
    ) {
      await sellPosition(position, quote.price, "break_even", "早盘触及成本线附近止盈离场");
      sold += 1;
      continue;
    }

    if (
      sellConfig.trailingStopEnabled &&
      profitPct >= num(sellConfig.minProfitForTrailPct) &&
      drawdownPct >= num(sellConfig.trailingPullbackPct)
    ) {
      await sellPosition(position, quote.price, "trailing_stop", "上涨后出现回撤，保护浮盈");
      sold += 1;
    }
  }

  return { sold };
}

async function evaluateBuySide(
  strategy: SimulationStrategyRow,
  buyConfig: StrategyBuyConfig,
  riskConfig: StrategyRiskConfig,
  nowParts = getShanghaiParts(),
): Promise<{ bought: number }> {
  if (toTimeValue(nowParts.time) < toTimeValue(buyConfig.scanTime) || toTimeValue(nowParts.time) > toTimeValue("14:57")) {
    return { bought: 0 };
  }
  if (strategy.last_buy_date === nowParts.date && !riskConfig.allowSameDayReentry) {
    return { bought: 0 };
  }

  const openPositions = await query<SimulationPositionRow[]>(
    "SELECT * FROM simulation_positions WHERE user_id = ? AND strategy_id = ? AND status = 'open'",
    [strategy.user_id, strategy.id],
  );
  if (openPositions.length >= Math.max(1, num(riskConfig.maxOpenPositions))) {
    return { bought: 0 };
  }

  const candidates = await fetchStreakCandidates(Math.max(2, num(buyConfig.minDownDays)));
  const heldCodes = new Set(
    (
      await query<SimulationPositionRow[]>(
        "SELECT stock_code FROM simulation_positions WHERE user_id = ? AND status = 'open'",
        [strategy.user_id],
      )
    ).map((item) => item.stock_code.toLowerCase()),
  );

  const filtered = candidates.filter((item) => !heldCodes.has(item.code.toLowerCase()));
  const pickIndex = Math.max(0, num(buyConfig.pickRank) - 1);
  const target = filtered[pickIndex];
  if (!target) {
    await insertLog(strategy.user_id, strategy.id, "info", "未找到符合条件的买入候选", {
      minDownDays: buyConfig.minDownDays,
      pickRank: buyConfig.pickRank,
    });
    return { bought: 0 };
  }

  const [quote] = await fetchQuotes([target.code]);
  if (!quote || quote.price <= 0) {
    await insertLog(strategy.user_id, strategy.id, "warn", "候选股行情获取失败，跳过本次买入", {
      stockCode: target.code,
    });
    return { bought: 0 };
  }

  await buyPosition(strategy, quote, buyConfig, `14:40 后扫描 ${buyConfig.minDownDays} 连跌，择强反转候选`);
  return { bought: 1 };
}

export async function evaluateStrategy(strategy: SimulationStrategyRow): Promise<{ bought: number; sold: number }> {
  const nowParts = getShanghaiParts();
  const buyConfig = parseJson<StrategyBuyConfig>(strategy.buy_config_json, getDefaultBuyConfig());
  const sellConfig = parseJson<StrategySellConfig>(strategy.sell_config_json, getDefaultSellConfig());
  const riskConfig = parseJson<StrategyRiskConfig>(strategy.risk_config_json, getDefaultRiskConfig());

  const sellResult = await evaluateSellSide(strategy, sellConfig, nowParts);
  const buyResult = await evaluateBuySide(strategy, buyConfig, riskConfig, nowParts);

  await execute("UPDATE simulation_strategies SET last_run_at = ? WHERE id = ?", [formatSqlDateTime(), strategy.id]);
  await refreshSimulationAccountEquity(strategy.user_id);

  return {
    bought: buyResult.bought,
    sold: sellResult.sold,
  };
}

export async function runUserSimulation(userId: number) {
  const strategies = await query<SimulationStrategyRow[]>(
    "SELECT * FROM simulation_strategies WHERE user_id = ? AND enabled = 1 ORDER BY updated_at DESC",
    [userId],
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
      await insertLog(userId, strategy.id, "error", "策略执行失败", { error: message });
      results.push({ strategyId: strategy.id, name: strategy.name, bought: 0, sold: 0, error: message });
    } finally {
      runningStrategyIds.delete(strategy.id);
    }
  }
  await refreshSimulationAccountEquity(userId);
  return results;
}

export async function runAllEnabledSimulations() {
  const strategies = await query<SimulationStrategyRow[]>(
    "SELECT * FROM simulation_strategies WHERE enabled = 1 ORDER BY user_id ASC, updated_at DESC",
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
      await insertLog(strategy.user_id, strategy.id, "error", "自动模拟执行失败", { error: message });
    } finally {
      runningStrategyIds.delete(strategy.id);
    }
  }
}

export function startSimulationScheduler() {
  const tick = async () => {
    try {
      await runAllEnabledSimulations();
    } catch (error) {
      console.error("[simulation] scheduler failed", error);
    }
  };
  tick();
  return setInterval(tick, 60 * 1000);
}
