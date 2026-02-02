import axios from "axios";
import type { StockItem } from "@/types/stock";

const api = axios.create({ baseURL: "/api", timeout: 120000 });

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

export type AiSectorNowResult = {
  bestSectors: Array<{
    kind: "industry" | "concept" | string;
    code: string;
    name: string;
    rank: number;
    whyHot: string[];
    riskNotes: string[];
    keySignals?: { percent?: number; amount?: number; mainNetIn?: number };
  }>;
  focus?: {
    todayHotSectors?: string[];
    watchListSectors?: string[];
  };
  openCandidates?: Array<{
    code: string;
    name: string;
    rank: number;
    reason: string[];
    plan: { entry: string; invalidation: string; takeProfit: string };
    riskNotes: string[];
  }>;
  bestSectorStocks?: Array<any>;
  disclaimer: string;
};

export type AiAfterCloseResult = {
  hotSectors: Array<{
    kind: "industry" | "concept" | string;
    code: string;
    name: string;
    rank: number;
    whyHot: string[];
    riskNotes: string[];
    keySignals?: { percent?: number; amount?: number; mainNetIn?: number };
  }>;
  worthWatching?: Array<{ name: string; why: string[] }>;
  openCandidates?: Array<{
    code: string;
    name: string;
    rank: number;
    reason: string[];
    plan: { entry: string; invalidation: string; takeProfit: string };
    riskNotes: string[];
  }>;
  bestSectorStocks?: Array<any>;
  disclaimer: string;
};

export type AiScreenResult = {
  interpretation?: { must: string[]; prefer: string[]; avoid: string[] };
  picks: Array<{
    code: string;
    name: string;
    rank: number;
    reason: string[];
    plan: { entry: string; invalidation: string; takeProfit: string };
    riskNotes: string[];
  }>;
  excludedExamples?: Array<{ code: string; name: string; why: string }>;
  disclaimer: string;
};

export async function aiSectorNow(params?: {
  topSectorN?: number;
  topStockN?: number;
  horizon?: string;
  riskProfile?: string;
  mock?: boolean;
}): Promise<AiSectorNowResult> {
  const { data } = await api.post<AiSectorNowResult>(
    "/ai/a/sector",
    params || {},
  );
  return data;
}

export async function aiAfterClose(params?: {
  topSectorN?: number;
  topStockN?: number;
  horizon?: string;
  riskProfile?: string;
}): Promise<AiAfterCloseResult> {
  const { data } = await api.post<AiAfterCloseResult>(
    "/ai/a/afterclose",
    params || {},
  );
  return data;
}

export async function aiScreenStocks(params: {
  query: string;
  limit?: number;
  horizon?: string;
  riskProfile?: string;
}): Promise<AiScreenResult> {
  const { data } = await api.post<AiScreenResult>("/ai/a/screen", params);
  return data;
}

export type AiRadarResult = {
  market: {
    sentiment: "risk_on" | "risk_off" | "mixed" | string;
    mainThemes: string[];
    notes: string[];
    riskLevel: "low" | "medium" | "high" | string;
  };
  baskets: {
    hotMomentum: Array<{
      code: string;
      name: string;
      rank: number;
      reason: string[];
      plan: { entry: string; invalidation: string; takeProfit: string };
      riskNotes: string[];
      tags?: string[];
    }>;
    lowAbsorbPullback: Array<{
      code: string;
      name: string;
      rank: number;
      reason: string[];
      plan: { entry: string; invalidation: string; takeProfit: string };
      riskNotes: string[];
      tags?: string[];
    }>;
    ambushWatch: Array<{
      code: string;
      name: string;
      rank: number;
      reason: string[];
      trigger: string[];
      riskNotes: string[];
      tags?: string[];
    }>;
    avoid: Array<{ code: string; name: string; why: string }>;
  };
  watchSectors?: string[];
  disclaimer: string;
};

export async function aiMarketRadar(params?: {
  limit?: number;
  horizon?: string;
  riskProfile?: string;
}): Promise<AiRadarResult> {
  const { data } = await api.post<AiRadarResult>("/ai/a/radar", params || {});
  return data;
}

export type AiJournalResult = {
  recap: {
    oneSentence: string;
    whatWorked: string[];
    whatDidnt: string[];
    keyLessons: string[];
  };
  tomorrowPlan: {
    focus: string[];
    riskControl: string[];
    ifThen: string[];
  };
  watchlist: Array<{
    code?: string;
    name?: string;
    whyWatch: string[];
    trigger: string[];
    invalidation: string;
  }>;
  checklist: {
    beforeOpen: string[];
    intraday: string[];
    afterClose: string[];
  };
  disclaimer: string;
};

export async function aiJournal(params: {
  notes: string;
  trades?: any[];
  context?: any;
  horizon?: string;
  riskProfile?: string;
}): Promise<AiJournalResult> {
  const { data } = await api.post<AiJournalResult>("/ai/a/journal", params);
  return data;
}

export type AiPullbackResult = {
  overview: {
    style: string;
    marketNotes: string[];
    riskNotes: string[];
  };
  lowAbsorb: Array<{
    code: string;
    name: string;
    rank: number;
    why: string[];
    trigger: string[];
    plan: { entry: string; invalidation: string; takeProfit: string };
    riskNotes: string[];
  }>;
  ambush: Array<{
    code: string;
    name: string;
    rank: number;
    why: string[];
    trigger: string[];
    invalidation: string;
    riskNotes: string[];
  }>;
  avoid: Array<{ code: string; name: string; why: string }>;
  disclaimer: string;
};

export async function aiPullbackScan(params: {
  scope: "watchlist" | "market";
  watchlistCodes?: string[];
  marketLimit?: number;
  topN?: number;
  horizon?: string;
  riskProfile?: string;
}): Promise<AiPullbackResult> {
  const { data } = await api.post<AiPullbackResult>("/ai/a/pullback", params);
  return data;
}
