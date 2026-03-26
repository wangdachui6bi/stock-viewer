import { authClient } from "./client";

export interface SimulationAccount {
  userId: number;
  initialCash: number;
  availableCash: number;
  totalEquity: number;
  marketValue: number;
  floatingPnl: number;
  positionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SimulationPosition {
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
  pnl: number;
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

export interface SimulationStrategy {
  id: number;
  userId: number;
  name: string;
  enabled: boolean;
  presetKey: string;
  buyConfig: StrategyBuyConfig;
  sellConfig: StrategySellConfig;
  riskConfig: StrategyRiskConfig;
  lastBuyDate: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SimulationOrder {
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
  executed_at: string;
  created_at: string;
}

export interface SimulationLog {
  id: number;
  user_id: number;
  strategy_id: number | null;
  level: "info" | "warn" | "error" | "trade";
  message: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export async function fetchSimulationAccount(): Promise<SimulationAccount> {
  const { data } = await authClient.get("/simulation/account");
  return data;
}

export async function resetSimulationAccount(initialCash: number): Promise<void> {
  await authClient.post("/simulation/account/reset", { initialCash });
}

export async function fetchSimulationPositions(): Promise<SimulationPosition[]> {
  const { data } = await authClient.get("/simulation/positions");
  return Array.isArray(data) ? data : [];
}

export async function fetchSimulationStrategies(): Promise<SimulationStrategy[]> {
  const { data } = await authClient.get("/simulation/strategies");
  return Array.isArray(data) ? data : [];
}

export async function createSimulationStrategy(payload: {
  name: string;
  enabled: boolean;
  presetKey?: string;
  buyConfig: Partial<StrategyBuyConfig>;
  sellConfig: Partial<StrategySellConfig>;
  riskConfig: Partial<StrategyRiskConfig>;
}): Promise<void> {
  await authClient.post("/simulation/strategies", payload);
}

export async function updateSimulationStrategy(
  id: number,
  payload: {
    name: string;
    enabled: boolean;
    presetKey?: string;
    buyConfig: Partial<StrategyBuyConfig>;
    sellConfig: Partial<StrategySellConfig>;
    riskConfig: Partial<StrategyRiskConfig>;
  },
): Promise<void> {
  await authClient.put(`/simulation/strategies/${id}`, payload);
}

export async function deleteSimulationStrategy(id: number): Promise<void> {
  await authClient.delete(`/simulation/strategies/${id}`);
}

export async function fetchSimulationOrders(): Promise<SimulationOrder[]> {
  const { data } = await authClient.get("/simulation/orders");
  return Array.isArray(data) ? data : [];
}

export async function fetchSimulationLogs(): Promise<SimulationLog[]> {
  const { data } = await authClient.get("/simulation/logs");
  return Array.isArray(data) ? data : [];
}

export async function runSimulationNow(): Promise<Array<Record<string, unknown>>> {
  const { data } = await authClient.post("/simulation/run");
  return Array.isArray(data?.results) ? data.results : [];
}
