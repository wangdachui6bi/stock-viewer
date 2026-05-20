/**
 * 代理后端：转发新浪/腾讯股票接口，解决 CORS 与 GBK 编码
 * 接口逻辑参考 leek-fund
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import axios from "axios";
import iconv from "iconv-lite";
import { parseSinaStockResponse } from "./parser.ts";
import { initDatabase } from "./db.ts";
import { createAuthRouter } from "./auth.ts";
import { createWatchlistRouter } from "./routes/watchlist.ts";
import { createTradesRouter } from "./routes/trades.ts";
import { createJournalsRouter } from "./routes/journals.ts";
import { createAdminRouter } from "./routes/admin.ts";
import { createSimulationRouter } from "./routes/simulation.ts";
import { startSimulationScheduler } from "./simulator.ts";

const { decode } = iconv;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(rootDir, ".env.local") });
dotenv.config({ path: path.join(rootDir, ".env") });

type EastmoneyClistResp = {
  data?: {
    diff?: Array<Record<string, any>>;
  };
};

function previewValue(value: unknown, limit = 400) {
  if (value == null) return value;
  let text = "";
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text.length > limit) return `${text.slice(0, limit)}...`;
  return text;
}

function logRequestStart(tag: string, info: Record<string, any>) {
  const start = Date.now();
  console.info(`[${tag}] request start`, info);
  return start;
}

function logRequestOk(tag: string, start: number, info: Record<string, any>) {
  console.info(`[${tag}] request ok`, { ...info, ms: Date.now() - start });
}

function logRequestError(
  tag: string,
  start: number,
  err: any,
  info: Record<string, any>,
) {
  const status = err?.response?.status;
  const code = err?.code;
  const message = err?.message || String(err);
  const detail = previewValue(err?.response?.data);
  console.error(`[${tag}] request error`, {
    ...info,
    ms: Date.now() - start,
    status,
    code,
    message,
    detail,
  });
}

async function fetchEastmoneyClist(params: Record<string, any>) {
  // 东方财富 push2 列表接口（公开、无需 key；但可能有频率限制）
  const url = "https://push2.eastmoney.com/api/qt/clist/get";
  const start = logRequestStart("eastmoney:clist", {
    url,
    params,
    timeout: 20000,
  });
  try {
    const resp = await axios.get<EastmoneyClistResp>(url, {
      params,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://quote.eastmoney.com/",
      },
      timeout: 20000,
    });
    logRequestOk("eastmoney:clist", start, { status: resp.status });
    return resp.data?.data?.diff || [];
  } catch (e) {
    logRequestError("eastmoney:clist", start, e, {});
    throw e;
  }
}

function mapAshareMarketFs(): string {
  // 沪深A：上证A(0/6,0/80) + 深证A(1/2,1/23)
  return "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23";
}

async function fetchHotSectors(limit = 10) {
  // 行业板块（t:2）+ 概念板块（t:3）
  // 关键字段：f12=代码 f14=名称 f3=涨跌幅 f62=主力净流入（不一定有） f6=成交额
  const fields = "f12,f14,f2,f3,f4,f5,f6,f62,f184,f66,f69,f72,f75";

  const [industry, concept] = await Promise.all([
    fetchEastmoneyClist({
      pn: 1,
      pz: Math.min(limit, 30),
      po: 1,
      np: 1,
      fltt: 2,
      invt: 2,
      fid: "f3",
      fs: "m:90+t:2",
      fields,
    }),
    fetchEastmoneyClist({
      pn: 1,
      pz: Math.min(limit, 30),
      po: 1,
      np: 1,
      fltt: 2,
      invt: 2,
      fid: "f3",
      fs: "m:90+t:3",
      fields,
    }),
  ]);

  const toSector = (x: any) => ({
    code: String(x.f12 || ""),
    name: String(x.f14 || ""),
    price: x.f2,
    percent: x.f3,
    amount: x.f6,
    mainNetIn: x.f62,
  });

  return {
    industry: industry.map(toSector).filter((s: any) => s.code && s.name),
    concept: concept.map(toSector).filter((s: any) => s.code && s.name),
  };
}

function parseNumberLike(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "")
    .replace(/,/g, "")
    .replace(/%/g, "")
    .trim();
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

async function fetchSectorConstituents(bkCode: string, limit = 30) {
  const fields = "f12,f14,f2,f3,f4,f5,f6,f15,f16,f17";
  const diff = await fetchEastmoneyClist({
    pn: 1,
    pz: Math.min(limit, 200),
    po: 1,
    np: 1,
    fltt: 2,
    invt: 2,
    fid: "f3",
    fs: `b:${bkCode}`,
    fields,
  });

  return diff
    .map((x: any) => ({
      code: String(x.f12 || "").toLowerCase(),
      name: String(x.f14 || ""),
      price: x.f2,
      percent: x.f3,
      updown: x.f4,
      volume: x.f5,
      amount: x.f6,
      high: x.f15,
      low: x.f16,
      open: x.f17,
    }))
    .filter((s: any) => s.code && s.name);
}

function rankHotSectors(
  sectors: Awaited<ReturnType<typeof fetchHotSectors>>,
  limit = 12,
) {
  const merged = [
    ...sectors.industry.map((item) => ({ ...item, kind: "industry" as const })),
    ...sectors.concept.map((item) => ({ ...item, kind: "concept" as const })),
  ];

  const scored = merged
    .map((item) => {
      const percent = parseNumberLike(item.percent);
      const amount = parseNumberLike(item.amount);
      const mainNetIn = parseNumberLike(item.mainNetIn);
      const score =
        percent * 100 +
        Math.log10(Math.max(amount, 1)) * 8 +
        Math.sign(mainNetIn) * Math.log10(Math.max(Math.abs(mainNetIn), 1)) * 6;
      return {
        ...item,
        percent,
        amount,
        mainNetIn,
        score: Number(score.toFixed(2)),
      };
    })
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  return scored
    .filter((item) => {
      const key = `${item.kind}:${item.code}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.min(Math.max(limit, 1), 30));
}

async function fetchAshareSnapshot(limit = 200) {
  const fields = "f12,f14,f2,f3,f4,f5,f6,f15,f16,f17";
  const diff = await fetchEastmoneyClist({
    pn: 1,
    pz: Math.min(limit, 500),
    po: 1,
    np: 1,
    fltt: 2,
    invt: 2,
    fid: "f6", // 成交额
    fs: mapAshareMarketFs(),
    fields,
  });
  return diff
    .map((x: any) => ({
      code: String(x.f12 || "").toLowerCase(),
      name: String(x.f14 || ""),
      price: x.f2,
      percent: x.f3,
      updown: x.f4,
      volume: x.f5,
      amount: x.f6,
      high: x.f15,
      low: x.f16,
      open: x.f17,
    }))
    .filter((s: any) => s.code && s.name);
}

async function fetchNewsHeadlines(limit = 10) {
  // 这里用新浪财经 RSS（公开、无需 key）。如果不可用就返回空数组。
  // 你也可以后续换成别的新闻源。
  const url = "https://rss.sina.com.cn/roll/finance/hgjj.xml";
  try {
    const { data } = await axios.get(url, { timeout: 15000 });
    const xml = String(data || "");
    const titles = [...xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)]
      .map((m) => m[1])
      .filter((t) => t && t !== "新浪财经" && t !== "滚动新闻")
      .slice(0, limit);
    return titles;
  } catch {
    return [];
  }
}

type TencentKlineResp = {
  code: number;
  data: Record<
    string,
    {
      day?: string[][];
      qfqday?: string[][];
      week?: string[][];
      qfqweek?: string[][];
      month?: string[][];
      qfqmonth?: string[][];
    }
  >;
};

async function fetchKline(params: {
  code: string;
  period: "daily" | "weekly" | "monthly";
  count: number;
}): Promise<string[]> {
  const { code, period, count } = params;
  const symbol = String(code || "").toLowerCase();
  const periodMap: Record<string, string> = {
    daily: "day",
    weekly: "week",
    monthly: "month",
  };
  const p = periodMap[period] || "day";

  const url = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get";
  const param = `${symbol},${p},,,${count},qfq`;
  const start = logRequestStart("tencent:kline", { url, param });
  try {
    const resp = await axios.get<TencentKlineResp>(url, {
      params: { param },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://web.ifzq.gtimg.cn/",
      },
      timeout: 15000,
    });
    logRequestOk("tencent:kline", start, { status: resp.status });
    const stockData = resp.data?.data?.[symbol];
    const bars =
      period === "weekly"
        ? stockData?.qfqweek || stockData?.week || []
        : period === "monthly"
          ? stockData?.qfqmonth || stockData?.month || []
          : stockData?.day || stockData?.qfqday || [];
    return bars.map((b) => b.join(","));
  } catch (e) {
    logRequestError("tencent:kline", start, e, { symbol });
    throw e;
  }
}

type Mt4Bar = {
  ts: number;
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount?: number;
};

type Mt4Signal = {
  bias: "bullish" | "neutral" | "bearish";
  regime: "trend-up" | "range" | "trend-down";
  setup: string;
  score: number;
  summary: string;
  reasons: string[];
  riskLabel: "aggressive" | "balanced" | "defensive";
  indicators: {
    ma5: number;
    ma10: number;
    ma20: number;
    ma60: number;
    rsi14: number;
    atr14: number;
    macdDiff: number;
    macdDea: number;
    macdHist: number;
    avgVolume20: number;
  };
  levels: {
    entryLow: number;
    entryHigh: number;
    stop: number;
    take1: number;
    take2: number;
  };
};

function parseKlineRows(raw: string[]): Mt4Bar[] {
  return raw
    .map((line) => String(line).split(","))
    .filter((arr) => arr.length >= 6)
    .map((arr) => {
      const date = arr[0];
      const open = Number(arr[1]);
      const close = Number(arr[2]);
      const high = Number(arr[3]);
      const low = Number(arr[4]);
      const volume = Number(arr[5]);
      const amount = arr[6] != null ? Number(arr[6]) : undefined;
      const ts = Date.parse(date + "T00:00:00+08:00");
      return { ts, date, open, close, high, low, volume, amount };
    })
    .filter((b) => Number.isFinite(b.ts) && Number.isFinite(b.close));
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mt4Sma(values: number[], period: number) {
  if (values.length < period) return values[values.length - 1] ?? 0;
  const slice = values.slice(-period);
  return slice.reduce((sum, item) => sum + item, 0) / period;
}

function mt4Ema(values: number[], period: number) {
  if (!values.length) return 0;
  const multiplier = 2 / (period + 1);
  let prev = values[0];
  for (let i = 1; i < values.length; i += 1) {
    prev = (values[i] - prev) * multiplier + prev;
  }
  return prev;
}

function mt4CalcRsi(values: number[], period = 14) {
  if (values.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }
  if (losses === 0) return 100;
  const rs = gains / period / (losses / period);
  return 100 - 100 / (1 + rs);
}

function mt4CalcAtr(bars: Mt4Bar[], period = 14) {
  if (bars.length <= period) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const current = bars[i];
    const prev = bars[i - 1];
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close),
    );
    trs.push(tr);
  }
  return mt4Sma(trs, period);
}

function mt4CalcMacd(values: number[]) {
  const diff = mt4Ema(values, 12) - mt4Ema(values, 26);
  const diffs: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const sample = values.slice(0, i + 1);
    diffs.push(mt4Ema(sample, 12) - mt4Ema(sample, 26));
  }
  const dea = mt4Ema(diffs, 9);
  const hist = diff - dea;
  return { diff, dea, hist };
}

function analyzeMt4Bars(bars: Mt4Bar[]): Mt4Signal {
  if (bars.length < 60) {
    throw new Error("K线数量不足，无法生成稳定分析");
  }

  const closes = bars.map((item) => item.close);
  const last = bars[bars.length - 1];
  const ma5 = mt4Sma(closes, 5);
  const ma10 = mt4Sma(closes, 10);
  const ma20 = mt4Sma(closes, 20);
  const ma60 = mt4Sma(closes, 60);
  const rsi14 = mt4CalcRsi(closes, 14);
  const atr14 = mt4CalcAtr(bars, 14);
  const macd = mt4CalcMacd(closes);
  const avgVolume20 = mt4Sma(
    bars.slice(-20).map((item) => item.volume || 0),
    Math.min(20, bars.length),
  );

  const aboveMa20 = last.close > ma20;
  const aboveMa60 = last.close > ma60;
  const trendUp = aboveMa20 && ma20 >= ma60;
  const trendDown = !aboveMa20 && !aboveMa60 && ma20 <= ma60;
  const distanceToMa20 = atr14 ? Math.abs(last.close - ma20) / atr14 : 0;
  const volumePulse = avgVolume20 ? last.volume / avgVolume20 : 1;

  let score = 48;
  const reasons: string[] = [];

  if (trendUp) {
    score += 18;
    reasons.push("价格站上 MA20，且 MA20 对 MA60 保持顺上，主趋势仍偏多。");
  } else if (trendDown) {
    score -= 18;
    reasons.push("价格位于 MA20/MA60 下方，结构偏弱，追高性价比差。");
  } else {
    reasons.push("当前处于均线缠绕区，适合等待更明确的结构确认。");
  }

  if (macd.hist > 0) {
    score += 10;
    reasons.push("MACD 柱体为正，动能并未完全熄火。");
  } else {
    score -= 6;
    reasons.push("MACD 柱体回落，短线节奏更适合控仓观察。");
  }

  if (rsi14 >= 48 && rsi14 <= 68) {
    score += 10;
    reasons.push("RSI 位于可进攻区间，既不钝化也不失速。");
  } else if (rsi14 > 75) {
    score -= 8;
    reasons.push("RSI 偏热，追涨回撤风险抬升。");
  } else if (rsi14 < 40) {
    score -= 10;
    reasons.push("RSI 仍弱，右侧交易信号不足。");
  }

  if (distanceToMa20 <= 1.1 && trendUp) {
    score += 9;
    reasons.push("价格离 MA20 不远，属于交易员容易执行的回踩带。");
  } else if (distanceToMa20 >= 2.4) {
    score -= 7;
    reasons.push("价格偏离 MA20 过大，更像情绪延伸而不是舒服的入场位。");
  }

  if (volumePulse >= 1.15) {
    score += 6;
    reasons.push("量能高于 20 日均量，说明关注度仍在。");
  }

  score = Math.max(8, Math.min(96, score));

  let bias: Mt4Signal["bias"] = "neutral";
  let regime: Mt4Signal["regime"] = "range";
  let setup = "Wait For Clarity";
  let summary = "结构还不够干净，先看再上";
  let riskLabel: Mt4Signal["riskLabel"] = "balanced";

  if (trendUp && score >= 72) {
    bias = "bullish";
    regime = "trend-up";
    setup = "Trend Pullback";
    summary = "顺势回踩，可分批试错";
    riskLabel = distanceToMa20 <= 1.2 ? "balanced" : "aggressive";
  } else if (trendDown && score <= 32) {
    bias = "bearish";
    regime = "trend-down";
    setup = "Capital Preservation";
    summary = "弱势结构，防守优先";
    riskLabel = "defensive";
  } else if (score >= 58) {
    bias = "neutral";
    regime = trendUp ? "trend-up" : "range";
    setup = "Watch Break";
    summary = "接近可交易区，等进一步确认";
    riskLabel = "balanced";
  } else {
    bias = trendDown ? "bearish" : "neutral";
    regime = trendDown ? "trend-down" : "range";
    setup = "Hands Off";
    summary = "信号不完整，耐心比动作更重要";
    riskLabel = "defensive";
  }

  const entryAnchorLow = trendUp
    ? Math.min(ma10, ma20)
    : Math.min(last.close, ma20);
  const entryAnchorHigh = trendUp
    ? Math.max(ma10, ma5)
    : Math.max(last.close, ma10);
  const stop = trendUp
    ? Math.min(ma20 - atr14 * 1.2, last.low - atr14 * 0.35)
    : Math.min(last.close, ma20) - atr14 * 1.1;
  const take1 = last.close + atr14 * (trendUp ? 1.2 : 0.8);
  const take2 = last.close + atr14 * (trendUp ? 2.1 : 1.2);

  return {
    bias,
    regime,
    setup,
    score: round(score, 0),
    summary,
    reasons,
    riskLabel,
    indicators: {
      ma5: round(ma5),
      ma10: round(ma10),
      ma20: round(ma20),
      ma60: round(ma60),
      rsi14: round(rsi14, 1),
      atr14: round(atr14),
      macdDiff: round(macd.diff, 3),
      macdDea: round(macd.dea, 3),
      macdHist: round(macd.hist, 3),
      avgVolume20: round(avgVolume20, 0),
    },
    levels: {
      entryLow: round(entryAnchorLow),
      entryHigh: round(entryAnchorHigh),
      stop: round(stop),
      take1: round(take1),
      take2: round(take2),
    },
  };
}

function toMt4Symbol(code: string) {
  const normalized = code.toLowerCase();
  if (normalized.startsWith("sh"))
    return `ASH${normalized.slice(2)}`.slice(0, 12);
  if (normalized.startsWith("sz"))
    return `ASZ${normalized.slice(2)}`.slice(0, 12);
  if (normalized.startsWith("bj"))
    return `ABJ${normalized.slice(2)}`.slice(0, 12);
  return `AST${normalized.replace(/[^a-z0-9]/g, "").slice(0, 9)}`.slice(0, 12);
}

function inferDigits(price: number) {
  const text = price.toFixed(3);
  if (text.endsWith("000")) return 0;
  if (text.endsWith("00")) return 1;
  if (text.endsWith("0")) return 2;
  return 3;
}

function timeframeToMinutes(period: "D1" | "W1" | "MN1") {
  if (period === "W1") return 10080;
  if (period === "MN1") return 43200;
  return 1440;
}

function buildMt4Csv(bars: Mt4Bar[]) {
  const header = "DATE,TIME,OPEN,HIGH,LOW,CLOSE,VOLUME";
  const rows = bars.map((bar) =>
    [
      bar.date.replace(/-/g, "."),
      "00:00",
      bar.open.toFixed(3),
      bar.high.toFixed(3),
      bar.low.toFixed(3),
      bar.close.toFixed(3),
      Math.round(bar.volume || 0),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

function buildHstFile(params: {
  symbol: string;
  period: "D1" | "W1" | "MN1";
  digits: number;
  bars: Mt4Bar[];
}) {
  const { symbol, period, digits, bars } = params;
  const headerBytes = 148;
  const recordBytes = 60;
  const buffer = Buffer.alloc(headerBytes + bars.length * recordBytes);
  let offset = 0;
  const writeFixedText = (value: string, length: number) => {
    const text = Buffer.from(value, "ascii");
    text.copy(buffer, offset, 0, Math.min(length, text.length));
    offset += length;
  };

  buffer.writeInt32LE(401, offset);
  offset += 4;
  writeFixedText("Copyright 2003-2026, MetaQuotes Software Corp.", 64);
  writeFixedText(symbol, 12);
  buffer.writeInt32LE(timeframeToMinutes(period), offset);
  offset += 4;
  buffer.writeInt32LE(digits, offset);
  offset += 4;
  const now = Math.floor(Date.now() / 1000);
  buffer.writeInt32LE(now, offset);
  offset += 4;
  buffer.writeInt32LE(now, offset);
  offset += 4;
  offset += 52;

  for (const bar of bars) {
    buffer.writeBigInt64LE(BigInt(Math.floor(bar.ts / 1000)), offset);
    offset += 8;
    buffer.writeDoubleLE(bar.open, offset);
    offset += 8;
    buffer.writeDoubleLE(bar.high, offset);
    offset += 8;
    buffer.writeDoubleLE(bar.low, offset);
    offset += 8;
    buffer.writeDoubleLE(bar.close, offset);
    offset += 8;
    buffer.writeBigInt64LE(BigInt(Math.round(bar.volume || 0)), offset);
    offset += 8;
    buffer.writeInt32LE(0, offset);
    offset += 4;
    buffer.writeBigInt64LE(BigInt(Math.round(bar.volume || 0)), offset);
    offset += 8;
  }

  return buffer;
}

async function fetchSingleAshareQuote(code: string) {
  const url = `https://hq.sinajs.cn/list=${code.replace(".", "$")}`;
  const start = logRequestStart("sina:stock:single", { url, code });
  try {
    const resp = await axios.get(url, {
      responseType: "arraybuffer",
      headers: randHeader(),
    });
    logRequestOk("sina:stock:single", start, { status: resp.status });
    const body = decode(Buffer.from(resp.data), "GB18030");
    const list = parseSinaStockResponse(body, [code]);
    const item = Array.isArray(list) ? list[0] : null;
    if (!item) throw new Error(`未取到 ${code} 的行情`);
    return {
      code: String(item.code || code).toLowerCase(),
      name: String(item.name || code),
      market: String(item.type || "a"),
      price: Number(item.price || 0),
      open: Number(item.open || 0),
      high: Number(item.high || 0),
      low: Number(item.low || 0),
      prevClose: Number(item.yestclose || 0),
      percent: Number(String(item.percent || 0).replace("%", "")),
      volume: Number(item.volume || 0),
      amount: Number(item.amount || 0),
      time: String(item.time || ""),
    };
  } catch (e) {
    logRequestError("sina:stock:single", start, e, { url, code });
    throw e;
  }
}

async function fetchNewsItems(limit = 20) {
  const url = "https://rss.sina.com.cn/roll/finance/hgjj.xml";
  try {
    const { data } = await axios.get(url, { timeout: 15000 });
    const xml = String(data || "");
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .map((m) => m[1])
      .map((block) => {
        const title =
          /<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(block)?.[1] || "";
        const link = /<link>(.*?)<\/link>/.exec(block)?.[1] || "";
        const pubDate = /<pubDate>(.*?)<\/pubDate>/.exec(block)?.[1] || "";
        return { title, link, pubDate };
      })
      .filter((item) => item.title && item.title !== "新浪财经")
      .slice(0, limit);
    return items;
  } catch {
    return [];
  }
}

const app = express();
const PORT = 3001;

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] || "Content-Type",
  );
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const randHeader = () => ({
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "http://finance.sina.com.cn/",
});

// ===== 低吸/回踩扫描（规则） =====

type ScanBar = {
  ts: number;
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount?: number;
};

type PullbackSignal = {
  code: string;
  name?: string;
  strategy: "swing_pullback" | "reversal_rsi";
  signal: "buy" | "watch" | "none";
  score: number;
  reason: string[];
  entry: number;
  stop: number;
  take: number;
  last: {
    close: number;
    percent?: number;
    amount?: number;
  };
};

function inferAsharePrefix(code6: string): "sh" | "sz" | "bj" {
  const s = String(code6 || "").replace(/\D/g, "");
  if (s.startsWith("6")) return "sh";
  if (s.startsWith("0") || s.startsWith("3")) return "sz";
  // 8/4 常见为北交所
  return "bj";
}

function toAshareCode(raw: string): string {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s.startsWith("sh") || s.startsWith("sz") || s.startsWith("bj")) return s;
  const digits = s.replace(/\D/g, "");
  if (!digits) return s;
  const prefix = inferAsharePrefix(digits);
  return `${prefix}${digits}`;
}

function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function rsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period + 1) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const chg = values[i] - values[i - 1];
    if (chg >= 0) gain += chg;
    else loss -= chg;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const chg = values[i] - values[i - 1];
    const g = chg > 0 ? chg : 0;
    const l = chg < 0 ? -chg : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return out;
}

function atr(bars: ScanBar[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(bars.length).fill(null);
  if (bars.length < period + 1) return out;

  const tr: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      tr.push(bars[i].high - bars[i].low);
    } else {
      const prevClose = bars[i - 1].close;
      const highLow = bars[i].high - bars[i].low;
      const highClose = Math.abs(bars[i].high - prevClose);
      const lowClose = Math.abs(bars[i].low - prevClose);
      tr.push(Math.max(highLow, highClose, lowClose));
    }
  }

  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    sum += tr[i];
    if (i === period - 1) {
      out[i] = sum / period;
    } else if (i >= period) {
      const prev = out[i - 1];
      if (prev != null) out[i] = (prev * (period - 1) + tr[i]) / period;
    }
  }

  return out;
}

function analyzeSwingPullback(bars: ScanBar[]): {
  signal: PullbackSignal["signal"];
  score: number;
  reason: string[];
  entry: number;
  stop: number;
  take: number;
} {
  const trendMa = 20;
  const pullbackMa = 10;
  const slopeLookback = 5;
  const strongDist = 1;
  const weakDist = 2;
  const atrPeriod = 14;
  const atrStopMult = 1.0;
  const atrTakeMult = 2.2;

  const closes = bars.map((b) => b.close);
  const maTrend = sma(closes, trendMa);
  const maPull = sma(closes, pullbackMa);
  const a = atr(bars, atrPeriod);

  const i = bars.length - 1;
  const c = closes[i];

  const reasons: string[] = [];
  let score = 0;

  const maTNow = maTrend[i];
  const maTPrev = maTrend[i - slopeLookback];
  if (maTNow != null && maTPrev != null && maTNow > maTPrev) {
    reasons.push("趋势向上（20日均线抬升）");
    score += 35;
  } else {
    reasons.push("趋势不明（更偏震荡）");
  }

  const maPNow = maPull[i];
  if (maPNow != null) {
    const distPct = (Math.abs(c - maPNow) / maPNow) * 100;
    if (distPct <= strongDist) {
      reasons.push(`回踩到位（距10日均线约 ${distPct.toFixed(2)}%）`);
      score += 35;
    } else if (distPct <= weakDist) {
      reasons.push(`接近回踩位（距10日均线约 ${distPct.toFixed(2)}%）`);
      score += 20;
    } else {
      reasons.push(`离回踩位偏远（距10日均线约 ${distPct.toFixed(2)}%）`);
    }

    if (c >= maPNow) {
      reasons.push("回踩未破位（收盘在10日线之上）");
      score += 20;
    } else {
      reasons.push("回踩破位（收盘跌破10日线，需谨慎）");
      score += 5;
    }
  }

  score = Math.min(100, score);
  const atrNow = a[i] ?? 0;
  const entry = c;
  const stop = atrNow ? c - atrStopMult * atrNow : c * 0.97;
  const take = atrNow ? c + atrTakeMult * atrNow : c * 1.08;

  let signal: PullbackSignal["signal"] = "none";
  if (score >= 70) signal = "buy";
  else if (score >= 45) signal = "watch";

  return { signal, score, reason: reasons, entry, stop, take };
}

function analyzeReversalRSI(bars: ScanBar[]): {
  signal: PullbackSignal["signal"];
  score: number;
  reason: string[];
  entry: number;
  stop: number;
  take: number;
} {
  const closes = bars.map((b) => b.close);
  const rs = rsi(closes, 14);
  const maFast = sma(closes, 5);
  const maTrend = sma(closes, 20);
  const a = atr(bars, 14);

  const i = bars.length - 1;
  const r = rs[i];
  const c = closes[i];
  const prev = closes[i - 1] ?? c;

  const reasons: string[] = [];
  let score = 0;

  if (r != null) {
    if (r < 25) {
      reasons.push(`超跌（RSI=${r.toFixed(1)}）`);
      score += 45;
    } else if (r < 30) {
      reasons.push(`偏弱（RSI=${r.toFixed(1)}）`);
      score += 30;
    } else if (r < 35) {
      reasons.push(`弱转稳（RSI=${r.toFixed(1)}）`);
      score += 15;
    }
  }

  if (maFast[i] != null && c > (maFast[i] as number)) {
    reasons.push("反转确认（收盘站上短均线）");
    score += 20;
  }
  if (c > prev) {
    reasons.push("收盘高于昨收");
    score += 10;
  }

  if (maTrend[i] != null && c < (maTrend[i] as number)) {
    reasons.push("仍在20日线下（试错思路）");
    score += 5;
  } else if (maTrend[i] != null) {
    reasons.push("回到20日线附近/之上（更像企稳）");
    score += 10;
  }

  score = Math.min(100, score);
  const atrNow = a[i] ?? 0;
  const entry = c;
  const stop = atrNow ? c - 1.2 * atrNow : c * 0.97;
  const take = atrNow ? c + 2.0 * atrNow : c * 1.06;

  let signal: PullbackSignal["signal"] = "none";
  if (r != null && r < 30 && score >= 55) signal = "buy";
  else if (r != null && r < 35 && score >= 35) signal = "watch";

  return { signal, score, reason: reasons, entry, stop, take };
}

async function fetchAshareKlineBars(
  code: string,
  count = 140,
): Promise<ScanBar[]> {
  const raw = await fetchKline({ code, period: "daily", count });
  return (raw || [])
    .map((line) => String(line).split(","))
    .filter((arr) => arr.length >= 6)
    .map((arr) => {
      const date = arr[0];
      const open = Number(arr[1]);
      const close = Number(arr[2]);
      const high = Number(arr[3]);
      const low = Number(arr[4]);
      const volume = Number(arr[5]);
      const amount = arr[6] != null ? Number(arr[6]) : undefined;
      const ts = Date.parse(date + "T00:00:00+08:00");
      return { ts, date, open, close, high, low, volume, amount };
    })
    .filter((b) => Number.isFinite(b.ts) && Number.isFinite(b.close));
}

async function mapLimitConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (x: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length) as any;
  let cursor = 0;
  const workers = new Array(Math.max(1, limit)).fill(0).map(async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

// 规则扫描：给前端提供更靠谱的候选集
app.post("/api/a/scan", async (req, res) => {
  try {
    const { scope, watchlistCodes, marketLimit, topN } = req.body || {};

    let codes: string[] = [];
    let snapshot: any[] = [];

    if (String(scope || "market") === "watchlist") {
      codes = (Array.isArray(watchlistCodes) ? watchlistCodes : [])
        .map((c: any) => toAshareCode(String(c)))
        .filter(
          (c: string) =>
            c.startsWith("sh") || c.startsWith("sz") || c.startsWith("bj"),
        );
    } else {
      const limit = Math.min(Math.max(Number(marketLimit) || 400, 50), 800);
      snapshot = await fetchAshareSnapshot(limit);
      // fetchAshareSnapshot 返回纯数字 code，这里转成带前缀 code
      codes = snapshot
        .map((x: any) => toAshareCode(String(x.code)))
        .filter(Boolean);
    }

    codes = Array.from(new Set(codes)).slice(0, 900);
    if (!codes.length) return res.json({ candidates: [], note: "empty" });

    // 并发拉K线 + 计算信号
    const concurrency = 8;
    const results = await mapLimitConcurrency(
      codes,
      concurrency,
      async (code) => {
        try {
          const bars = await fetchAshareKlineBars(code, 140);
          if (bars.length < 60) return null;

          const swing = analyzeSwingPullback(bars);
          const rev = analyzeReversalRSI(bars);
          const best =
            swing.score >= rev.score
              ? { ...swing, strategy: "swing_pullback" as const }
              : { ...rev, strategy: "reversal_rsi" as const };

          const last = bars[bars.length - 1];
          const prev = bars[bars.length - 2] || last;
          const pct = prev.close
            ? ((last.close - prev.close) / prev.close) * 100
            : undefined;

          const name = (() => {
            const digits = code.replace(/^(sh|sz|bj)/, "");
            const hit = snapshot.find((x: any) => String(x.code) === digits);
            return hit?.name;
          })();

          const amount = (() => {
            const digits = code.replace(/^(sh|sz|bj)/, "");
            const hit = snapshot.find((x: any) => String(x.code) === digits);
            return hit?.amount;
          })();

          const sig: PullbackSignal = {
            code,
            name,
            strategy: best.strategy,
            signal: best.signal,
            score: best.score,
            reason: best.reason,
            entry: best.entry,
            stop: best.stop,
            take: best.take,
            last: { close: last.close, percent: pct, amount },
          };

          return sig;
        } catch {
          return null;
        }
      },
    );

    const cleaned = results.filter(Boolean) as PullbackSignal[];
    cleaned.sort((a, b) => (b.score || 0) - (a.score || 0));

    res.json({
      scope: String(scope || "market"),
      candidates: cleaned.slice(
        0,
        Math.min(Math.max(Number(topN) || 80, 10), 200),
      ),
    });
  } catch (e: any) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
});

// ===== 用户系统 & 数据持久化路由 =====
app.use("/api/auth", createAuthRouter());
app.use("/api/watchlist", createWatchlistRouter());
app.use("/api/trades", createTradesRouter());
app.use("/api/journals", createJournalsRouter());
app.use("/api/admin", createAdminRouter());
app.use("/api/simulation", createSimulationRouter());

// Production: serve the built frontend
const isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
  const distPath = path.resolve(rootDir, "dist");
  app.use(express.static(distPath, { maxAge: "7d" }));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

async function start() {
  try {
    await initDatabase();
    console.log("[db] MySQL connected & tables ready");
  } catch (e) {
    console.error(
      "[db] MySQL init failed, running without database:",
      e instanceof Error ? e.message : e,
    );
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `Stock API ${isProduction ? "(production)" : "(dev)"}: http://localhost:${PORT}`,
    );
    startSimulationScheduler();
  });
}

start();
