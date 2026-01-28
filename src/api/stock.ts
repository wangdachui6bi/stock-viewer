import axios from "axios";
import type { StockItem, SearchItem } from "@/types/stock";

const api = axios.create({ baseURL: "/api", timeout: 15000 });

export async function fetchStockList(codes: string[]): Promise<StockItem[]> {
  if (!codes.length) return [];
  const aCodes: string[] = [];
  const hkCodes: string[] = [];
  codes.forEach((c) => {
    if (c.toLowerCase().startsWith("hk")) hkCodes.push(c);
    else aCodes.push(c);
  });
  const results: StockItem[] = [];
  if (aCodes.length) {
    const { data } = await api.get<StockItem[]>("/stock", {
      params: { codes: aCodes.join(",") },
    });
    results.push(...(Array.isArray(data) ? data : []));
  }
  if (hkCodes.length) {
    const { data } = await api.get<StockItem[]>("/hk", {
      params: { codes: hkCodes.join(",") },
    });
    results.push(...(Array.isArray(data) ? data : []));
  }
  return results;
}

export async function searchStock(keyword: string): Promise<SearchItem[]> {
  if (!keyword.trim()) return [];
  const { data } = await api.get<SearchItem[]>("/search", {
    params: { q: keyword },
  });
  return Array.isArray(data) ? data : [];
}

/** 将搜索项转为自选代码：A股/港股 sh/sz/bj + code，美股 usr_xxx（与 leek-fund 一致） */
export function searchItemToCode(item: SearchItem): string {
  const m = (item.market || "").toLowerCase();
  const c = (item.code || "").toLowerCase();
  if (["sh", "sz", "bj"].includes(m)) return `${m}${c}`;
  if (m === "hk") return `hk${c}`;
  if (m === "us") return `usr_${c}`; // 新浪美股格式 usr_nvda, usr_brk.b
  return `${m}${c}`;
}
