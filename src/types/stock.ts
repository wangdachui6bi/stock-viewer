export interface StockItem {
  code: string;
  name: string;
  type: string;
  symbol?: string;
  open?: string;
  yestclose?: string;
  price?: string;
  high?: string;
  low?: string;
  volume?: string;
  amount?: string;
  time?: string;
  updown?: string;
  percent: string;
  /** 持仓股数（本地） */
  heldAmount?: number;
  /** 持仓成本价（本地） */
  heldPrice?: number;
  /** 今日成本价（本地） */
  todayHeldPrice?: number;
  /** 已清仓（本地） */
  isSellOut?: boolean;
  /** 盈亏金额（本地计算） */
  earnings?: number;
  /** 盈亏率 %（本地计算） */
  earningPercent?: number;
  /** 今日盈亏金额（本地计算） */
  todayEarnings?: number;
}

export interface SearchItem {
  code: string;
  name: string;
  market: string;
  abbreviation?: string;
  label: string;
}

/** 持仓配置（本地存储） */
export interface StockPriceItem {
  name?: string;
  amount: number;
  unitPrice: number;
  todayUnitPrice?: number;
  isSellOut?: boolean;
}

export type SortType = 0 | 1 | -1; // NORMAL | ASC | DESC

export const SORT_LABELS: Record<SortType, string> = {
  0: "默认",
  1: "涨跌↑",
  [-1]: "涨跌↓",
};

/** 市场类型显示 */
export function marketLabel(type: string): string {
  const map: Record<string, string> = {
    a: "A股",
    hk: "港股",
    us: "美股",
    usr_: "美股",
    nf: "期货",
    nf_: "期货",
    hf: "外盘",
    hf_: "外盘",
    nodata: "—",
  };
  const key = (type || "").toLowerCase();
  if (key.startsWith("usr")) return "美股";
  if (key.startsWith("nf")) return "期货";
  if (key.startsWith("hf")) return "外盘";
  return map[key] || type;
}
