import { authClient } from "./client";

export interface Trade {
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

export interface Position {
  stock_code: string;
  stock_name: string;
  net_quantity: number;
  net_amount: number;
  trade_count: number;
  last_trade_time: string;
}

export async function fetchTrades(params?: {
  stockCode?: string;
  limit?: number;
  offset?: number;
}): Promise<Trade[]> {
  const { data } = await authClient.get("/trades", { params });
  return Array.isArray(data) ? data : [];
}

export async function addTrade(trade: {
  stockCode: string;
  stockName?: string;
  direction: "buy" | "sell";
  price: number;
  quantity: number;
  tradeTime: string;
  notes?: string;
}): Promise<{ id: number }> {
  const { data } = await authClient.post("/trades", trade);
  return data;
}

export async function updateTrade(
  id: number,
  trade: {
    stockCode: string;
    stockName?: string;
    direction: "buy" | "sell";
    price: number;
    quantity: number;
    tradeTime: string;
    notes?: string;
  },
): Promise<void> {
  await authClient.put(`/trades/${id}`, trade);
}

export async function deleteTrade(id: number): Promise<void> {
  await authClient.delete(`/trades/${id}`);
}

export async function fetchPositions(): Promise<Position[]> {
  const { data } = await authClient.get("/trades/positions");
  return Array.isArray(data) ? data : [];
}
