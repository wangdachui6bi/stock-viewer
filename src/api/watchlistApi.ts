import { authClient } from "./client";

export interface WatchlistItem {
  id: number;
  stock_code: string;
  stock_name: string;
  market: string;
  notes: string;
  added_at: string;
}

export async function fetchWatchlist(): Promise<WatchlistItem[]> {
  const { data } = await authClient.get("/watchlist");
  return Array.isArray(data) ? data : [];
}

export async function addToWatchlist(params: {
  stockCode: string;
  stockName?: string;
  market?: string;
}): Promise<{ id: number }> {
  const { data } = await authClient.post("/watchlist", params);
  return data;
}

export async function removeFromWatchlistByCode(
  stockCode: string,
): Promise<void> {
  await authClient.delete(`/watchlist/code/${stockCode}`);
}
