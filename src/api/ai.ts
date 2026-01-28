import axios from "axios";
import type { StockItem } from "@/types/stock";

const api = axios.create({ baseURL: "/api", timeout: 60000 });

export type AiAnalyzeResult = {
  summary: string;
  bias: "bullish" | "bearish" | "neutral";
  keyObservations: string[];
  levels: {
    support: string[];
    resistance: string[];
  };
  plan: {
    entry: string;
    invalidation: string;
    takeProfit: string;
    positionSizing: string;
  };
  risks: string[];
  disclaimer: string;
};

export type AiPickResult = {
  picks: Array<{
    code: string;
    name: string;
    rank: number;
    bias: "bullish" | "bearish" | "neutral";
    reason: string[];
    plan: {
      entry: string;
      invalidation: string;
      takeProfit: string;
    };
    riskNotes: string[];
  }>;
  excluded?: Array<{ code: string; name: string; why: string }>;
  disclaimer: string;
};

export async function aiAnalyzeStock(params: {
  stock: StockItem;
  horizon?: string;
  riskProfile?: string;
}): Promise<AiAnalyzeResult> {
  const { data } = await api.post<AiAnalyzeResult>("/ai/analyze", params);
  return data;
}

export async function aiPickStocks(params: {
  candidates: StockItem[];
  topN?: number;
  horizon?: string;
  riskProfile?: string;
}): Promise<AiPickResult> {
  const { data } = await api.post<AiPickResult>("/ai/pick", params);
  return data;
}
