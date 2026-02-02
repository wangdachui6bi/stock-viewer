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
import JSON5 from "json5";
import { parseSinaStockResponse, parseTencentHKResponse } from "./parser.ts";

const { decode } = iconv;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(rootDir, ".env.local") });
dotenv.config({ path: path.join(rootDir, ".env") });

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type EastmoneyClistResp = {
  data?: {
    diff?: Array<Record<string, any>>;
  };
};

type EastmoneyKlineResp = {
  data?: {
    klines?: string[];
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

function extractJsonObject(text: string): string {
  const s = String(text || "").trim();

  // 1) ```json ... ``` / ``` ... ```
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  // 2) 尝试截取第一段完整 JSON（支持对象/数组）
  const firstBrace = s.indexOf("{");
  const firstBracket = s.indexOf("[");
  let start = -1;
  let openChar = "";
  if (firstBrace !== -1 && firstBracket !== -1) {
    if (firstBrace < firstBracket) {
      start = firstBrace;
      openChar = "{";
    } else {
      start = firstBracket;
      openChar = "[";
    }
  } else if (firstBrace !== -1) {
    start = firstBrace;
    openChar = "{";
  } else if (firstBracket !== -1) {
    start = firstBracket;
    openChar = "[";
  }

  if (start !== -1) {
    const closeChar = openChar === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < s.length; i += 1) {
      const ch = s[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === openChar) depth += 1;
      if (ch === closeChar) depth -= 1;
      if (depth === 0) {
        return s.slice(start, i + 1);
      }
    }
  }

  return s;
}

function safeJsonParse<T = any>(text: string): T {
  const raw = extractJsonObject(text);
  try {
    return JSON.parse(raw) as T;
  } catch (e: any) {
    // 兼容返回了 JSON 字符串（被额外包了一层引号）的情况
    try {
      const unwrapped = JSON.parse(raw);
      if (typeof unwrapped === "string") {
        return JSON.parse(extractJsonObject(unwrapped)) as T;
      }
    } catch {
      // ignore
    }
    try {
      return JSON5.parse(raw) as T;
    } catch (e2: any) {
      // 报错时把原始前缀带出来，方便定位模型输出
      const preview = String(text || "").slice(0, 200);
      const message = e2?.message || e?.message || "Invalid JSON";
      throw new Error(`${message} [0] preview=${JSON.stringify(preview)}`);
    }
  }
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

async function fetchEastmoneyKline(params: {
  code: string;
  period: "daily" | "weekly" | "monthly";
  count: number;
}) {
  const { code, period, count } = params;
  const pure = String(code || "").toLowerCase();
  const digits = pure.replace(/^(sh|sz|bj)/, "");
  const market = pure.startsWith("sh") ? 1 : 0;
  const secid = `${market}.${digits}`;
  const kltMap: Record<string, number> = {
    daily: 101,
    weekly: 102,
    monthly: 103,
  };
  const klt = kltMap[period] || 101;

  const url = "https://push2his.eastmoney.com/api/qt/stock/kline/get";
  const start = logRequestStart("eastmoney:kline", { url, secid, klt, count });
  try {
    const resp = await axios.get<EastmoneyKlineResp>(url, {
      params: {
        secid,
        klt,
        fqt: 1,
        // 仅传 lmt 有时会返回 data:null（rc=102），加 beg/end 更稳定
        beg: 0,
        end: 20500101,
        lmt: Math.min(Math.max(50, count), 500),
        fields1: "f1,f2,f3,f4,f5,f6",
        fields2: "f51,f52,f53,f54,f55,f56,f57,f58",
      },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://quote.eastmoney.com/",
      },
      timeout: 20000,
    });
    logRequestOk("eastmoney:kline", start, { status: resp.status });

    const klines = resp.data?.data?.klines || [];
    return klines;
  } catch (e) {
    logRequestError("eastmoney:kline", start, e, { secid, klt, count });
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

const aiCache = new Map<string, { ts: number; content: string }>();
const AI_CACHE_TTL_MS = 30_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function cacheKey(messages: ChatMessage[]) {
  return JSON.stringify(messages);
}

async function callLLM(messages: ChatMessage[]) {
  /**
   * 优先使用火山引擎（ARK）DeepSeek。
   * 兼容保留 OpenAI 配置做 fallback（如果你未来还想切回去）。
   */
  const volcApiKey = process.env.VOLCENGINE_API_KEY;
  const volcBaseUrl =
    process.env.VOLCENGINE_BASE_URL ||
    "https://ark.cn-beijing.volces.com/api/v3";
  const volcModel = process.env.VOLCENGINE_MODEL || "deepseek-v3.2";

  const openaiApiKey =
    process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY;
  const openaiBaseUrl =
    process.env.OPENAI_BASE_URL ||
    process.env.CHATGPT_BASE_URL ||
    "https://api.openai.com";
  const openaiModel =
    process.env.OPENAI_MODEL || process.env.CHATGPT_MODEL || "gpt-4o-mini";

  const provider: "volc" | "openai" = volcApiKey ? "volc" : "openai";

  if (provider === "openai" && !openaiApiKey) {
    throw new Error(
      "Missing VOLCENGINE_API_KEY (recommended) or OPENAI_API_KEY. Tip: put it in .env.local and restart `yarn dev`.",
    );
  }

  // 简单缓存：避免你连续点按钮导致同样 payload 重复打到 429
  const key = cacheKey(messages);
  const now = Date.now();
  const cached = aiCache.get(key);
  if (cached && now - cached.ts < AI_CACHE_TTL_MS) return cached.content;

  const maxRetries = 3;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let start = 0;
    try {
      const url =
        provider === "volc"
          ? `${volcBaseUrl.replace(/\/$/, "")}/chat/completions`
          : `${openaiBaseUrl.replace(/\/$/, "")}/v1/chat/completions`;

      const model = provider === "volc" ? volcModel : openaiModel;
      const apiKey = provider === "volc" ? volcApiKey! : openaiApiKey!;
      const msgMeta = messages.map((m) => ({
        role: m.role,
        length: (m.content || "").length,
      }));
      start = logRequestStart(`llm:${provider}`, {
        url,
        model,
        attempt,
        timeout: 120000,
        messages: msgMeta,
      });

      const resp = await axios.post(
        url,
        {
          model,
          messages,
          temperature: 0.2,
          // 为了兼容火山引擎 / DeepSeek，这里不强依赖 response_format。
          // 我们通过 system+schema 强约束模型输出 JSON。
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 120000,
        },
      );

      logRequestOk(`llm:${provider}`, start, { status: resp.status });
      const { data } = resp;
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("LLM API returned empty content");
      aiCache.set(key, { ts: Date.now(), content });
      return content as string;
    } catch (e: any) {
      logRequestError(`llm:${provider}`, start || Date.now(), e, {
        attempt,
      });
      lastErr = e;
      const status = e?.response?.status;
      if (status === 429 && attempt < maxRetries) {
        const retryAfterHeader = e?.response?.headers?.["retry-after"];
        const retryAfterMs = retryAfterHeader
          ? Number(retryAfterHeader) * 1000
          : 500 * Math.pow(2, attempt);
        await sleep(Math.min(retryAfterMs, 5000));
        continue;
      }
      break;
    }
  }

  const e: any = lastErr;
  const status = e?.response?.status;
  const detail = e?.response?.data
    ? JSON.stringify(e.response.data)
    : e?.message;
  throw new Error(
    `LLM API error${status ? ` (${status})` : ""} [${provider}]: ${detail}`,
  );
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

const AI_SECTOR_MOCK = {
  bestSectors: [
    {
      kind: "industry",
      code: "BK0732",
      name: "贵金属",
      rank: 1,
      whyHot: [
        "盘中领涨幅度超10%，板块强度高",
        "主力资金持续净流入，市场关注度高",
        "黄金作为传统避险资产，在市场波动预期下或受资金青睐",
      ],
      riskNotes: [
        "受国际金价波动影响大，短期波动风险较高",
        "板块涨幅已较大，追高需谨慎",
      ],
      keySignals: {
        percent: 10.75,
        amount: 45680837023,
        mainNetIn: 446530048,
      },
    },
    {
      kind: "concept",
      code: "BK0547",
      name: "黄金概念",
      rank: 2,
      whyHot: [
        "板块覆盖范围更广，涉及多只黄金相关龙头个股",
        "成交额超1800亿，主力净流入超45亿，资金面支撑强",
        "与贵金属板块联动性高，具备板块轮动延续性可能",
      ],
      riskNotes: [
        "部分个股存在炒作成分，估值波动风险大",
        "受国际金价短期走势影响明显",
      ],
      keySignals: {
        percent: 7.51,
        amount: 182527979903,
        mainNetIn: 4521706496,
      },
    },
    {
      kind: "industry",
      code: "BK1017",
      name: "采掘行业",
      rank: 3,
      whyHot: [
        "涨幅超6%，板块内多只个股涨停，情绪面积极",
        "主力净流入超10亿，资金参与度较高",
        "周期类板块景气度或有回升预期",
      ],
      riskNotes: [
        "周期性强，受政策、供需关系影响大",
        "部分个股前期涨幅已累积，回调风险需警惕",
      ],
      keySignals: {
        percent: 6.78,
        amount: 16924114706,
        mainNetIn: 1064808224,
      },
    },
    {
      kind: "industry",
      code: "BK1027",
      name: "小金属",
      rank: 4,
      whyHot: [
        "涨幅近5%，成交额超940亿，流动性充裕",
        "主力净流入超35亿，资金持续流入",
        "稀缺资源属性突出，或受益于产业政策支持",
      ],
      riskNotes: [
        "部分小金属价格波动剧烈，影响个股业绩",
        "板块内个股分化较大，选股难度较高",
      ],
      keySignals: {
        percent: 4.85,
        amount: 94346314229,
        mainNetIn: 3509261824,
      },
    },
  ],
  focus: {
    todayHotSectors: ["贵金属", "珠宝首饰", "黄金概念", "采掘行业"],
    watchListSectors: ["小金属", "有色金属", "煤炭行业"],
  },
  openCandidates: [
    {
      code: "600547",
      name: "山东黄金",
      rank: 1,
      reason: [
        "国内黄金龙头企业，与贵金属板块联动性强",
        "盘子适中，流动性良好，适合短线操作",
        "近期金价上涨，公司业绩或有支撑",
      ],
      plan: {
        entry: "盘中回调至5日均线附近",
        invalidation: "跌破10日均线",
        takeProfit: "涨幅5-10%",
      },
    },
    {
      code: "601899",
      name: "紫金矿业",
      rank: 2,
      reason: [
        "覆盖黄金、铜、锂等多种稀缺资源，受益于多板块上涨",
        "市值大，抗风险能力强，适合中线配置",
        "主力资金持续流入，资金面支撑强",
      ],
      plan: {
        entry: "盘中回调至5日均线附近",
        invalidation: "跌破10日均线",
        takeProfit: "涨幅8-12%",
      },
    },
    {
      code: "601088",
      name: "中国神华",
      rank: 3,
      reason: [
        "煤炭行业龙头，采掘板块核心标的",
        "业绩稳定，分红率高，风险相对较低",
        "主力资金净流入，情绪面积极",
      ],
      plan: {
        entry: "盘中回调至5日均线附近",
        invalidation: "跌破10日均线",
        takeProfit: "涨幅5-8%",
      },
    },
  ],
  disclaimer: "不构成投资建议",
  bestSectorStocks: [
    {
      code: "300139",
      name: "晓程科技",
      price: 70.6,
      percent: 20.01,
      updown: 11.77,
      volume: 599686,
      amount: 3989810779.47,
      high: 70.6,
      low: 58.84,
      open: 59.03,
    },
    {
      code: "002237",
      name: "恒邦股份",
      price: 21.42,
      percent: 10.02,
      updown: 1.95,
      volume: 1531384,
      amount: 3147556742.4,
      high: 21.42,
      low: 19.21,
      open: 19.78,
    },
    {
      code: "000506",
      name: "招金黄金",
      price: 25.93,
      percent: 10.01,
      updown: 2.36,
      volume: 712577,
      amount: 1821235793.46,
      high: 25.93,
      low: 24.9,
      open: 25.1,
    },
    {
      code: "600489",
      name: "中金黄金",
      price: 37.71,
      percent: 10.01,
      updown: 3.43,
      volume: 1838971,
      amount: 6715332968,
      high: 37.71,
      low: 34.39,
      open: 35,
    },
    {
      code: "001337",
      name: "四川黄金",
      price: 66.86,
      percent: 10,
      updown: 6.08,
      volume: 258212,
      amount: 1698566941.08,
      high: 66.86,
      low: 64,
      open: 64,
    },
    {
      code: "600988",
      name: "赤峰黄金",
      price: 46.86,
      percent: 10,
      updown: 4.26,
      volume: 1396342,
      amount: 6375989997,
      high: 46.86,
      low: 43.11,
      open: 43.96,
    },
    {
      code: "002155",
      name: "湖南黄金",
      price: 30.58,
      percent: 10,
      updown: 2.78,
      volume: 35403,
      amount: 108263780.68,
      high: 30.58,
      low: 30.58,
      open: 30.58,
    },
    {
      code: "601069",
      name: "西部黄金",
      price: 44.26,
      percent: 9.99,
      updown: 4.02,
      volume: 389473,
      amount: 1686196019,
      high: 44.26,
      low: 41.04,
      open: 41.13,
    },
    {
      code: "002716",
      name: "湖南白银",
      price: 19.4,
      percent: 9.98,
      updown: 1.76,
      volume: 5039659,
      amount: 9415586013.14,
      high: 19.4,
      low: 17.64,
      open: 17.64,
    },
    {
      code: "600547",
      name: "山东黄金",
      price: 59.66,
      percent: 9.97,
      updown: 5.41,
      volume: 1294336,
      amount: 7511574721,
      high: 59.67,
      low: 55.3,
      open: 55.67,
    },
    {
      code: "000975",
      name: "山金国际",
      price: 38.69,
      percent: 8.28,
      updown: 2.96,
      volume: 852165,
      amount: 3210723268.03,
      high: 38.9,
      low: 35.78,
      open: 36.69,
    },
  ],
};

// 股票行情：新浪（A股、美股、期货）
app.get("/api/stock", async (req, res) => {
  const codes = String(req.query.codes || "")
    .split(",")
    .filter(Boolean);
  if (!codes.length) return res.json([]);
  const url = `https://hq.sinajs.cn/list=${codes
    .map((c) => c.replace(".", "$"))
    .join(",")}`;
  let start = 0;
  try {
    start = logRequestStart("sina:stock", { url, codes });
    const resp = await axios.get(url, {
      responseType: "arraybuffer",
      headers: randHeader(),
    });
    logRequestOk("sina:stock", start, { status: resp.status });
    const body = decode(Buffer.from(resp.data), "GB18030");
    const list = parseSinaStockResponse(body, codes);
    res.json(list);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logRequestError("sina:stock", start || Date.now(), e, { url, codes });
    console.error("/api/stock", message);
    res.status(500).json({ error: message });
  }
});

// 港股行情：腾讯
app.get("/api/hk", async (req, res) => {
  const codes = String(req.query.codes || "")
    .split(",")
    .filter(Boolean);
  if (!codes.length) return res.json([]);
  const q = codes.map((c) => `r_${c}`).join(",");
  const url = "https://qt.gtimg.cn/q=";
  let start = 0;
  try {
    start = logRequestStart("tencent:hk", { url, q });
    const resp = await axios.get(url, {
      params: { q, fmt: "json" },
      responseType: "arraybuffer",
    });
    logRequestOk("tencent:hk", start, { status: resp.status });
    const body = decode(Buffer.from(resp.data), "GBK");
    const data = JSON.parse(body);
    const list = parseTencentHKResponse(data, codes);
    res.json(list);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logRequestError("tencent:hk", start || Date.now(), e, { url, q });
    console.error("/api/hk", message);
    res.status(500).json({ error: message });
  }
});

// 搜索股票/指数：腾讯
app.get("/api/search", async (req, res) => {
  const q = String(req.query.q || "");
  if (!q.trim()) return res.json([]);
  const url =
    "https://proxy.finance.qq.com/ifzqgtimg/appstock/smartbox/search/get";
  let start = 0;
  try {
    start = logRequestStart("tencent:search", { url, q });
    const resp = await axios.get(url, { params: { q } });
    logRequestOk("tencent:search", start, { status: resp.status });
    const arr = resp.data?.data?.stock || [];
    const list = arr.map((item: string[]) => ({
      code: (item[1] || "").toLowerCase(),
      name: item[2] || "",
      market: item[0] || "",
      abbreviation: item[3] || "",
      label: `${item[0] || ""}${(item[1] || "").toLowerCase()} | ${
        item[2] || ""
      }`,
    }));
    res.json(list);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logRequestError("tencent:search", start || Date.now(), e, { url, q });
    console.error("/api/search", message);
    res.status(500).json({ error: message });
  }
});

// K线（A股）：东方财富 push2his
app.get("/api/kline", async (req, res) => {
  const code = String(req.query.code || "")
    .trim()
    .toLowerCase();
  const period = String(req.query.period || "daily").toLowerCase();
  const count = Math.min(Number(req.query.count) || 200, 500);
  if (!code) return res.status(400).json({ error: "missing code" });
  if (
    !code.startsWith("sh") &&
    !code.startsWith("sz") &&
    !code.startsWith("bj")
  ) {
    return res
      .status(400)
      .json({ error: "only A-share codes supported: sh/sz/bj" });
  }

  try {
    const raw = await fetchEastmoneyKline({
      code,
      period:
        period === "weekly" || period === "monthly" ? (period as any) : "daily",
      count,
    });

    const bars = raw
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

    res.json(bars);
  } catch (e: any) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
});

// 资讯：新浪财经 RSS
app.get("/api/news", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  let start = 0;
  try {
    start = logRequestStart("sina:news", { limit });
    const items = await fetchNewsItems(limit);
    logRequestOk("sina:news", start, { count: items.length });
    res.json(items);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logRequestError("sina:news", start || Date.now(), e, { limit });
    console.error("/api/news", message);
    res.status(500).json({ error: message });
  }
});

// AI 分析：对单只标的做结构化解读（不构成投资建议）
app.post("/api/ai/analyze", async (req, res) => {
  try {
    const { stock, horizon, riskProfile } = req.body || {};
    if (!stock?.code) return res.status(400).json({ error: "missing stock" });

    const system: ChatMessage = {
      role: "system",
      content:
        "你是一个严谨的交易分析助手。你只能基于用户提供的行情字段进行分析，不要编造财务数据或新闻。输出必须是严格 JSON（纯 JSON 字符串），不要输出 Markdown，不要使用 ```json 代码块。必须包含风险提示：不构成投资建议。",
    };

    const user: ChatMessage = {
      role: "user",
      content: JSON.stringify(
        {
          task: "analyze",
          horizon: horizon || "swing_1_5_days",
          riskProfile: riskProfile || "medium",
          stock,
          outputSchema: {
            summary: "一句话结论",
            bias: "bullish|bearish|neutral",
            keyObservations: ["要点1", "要点2"],
            levels: {
              support: ["数字或区间"],
              resistance: ["数字或区间"],
            },
            plan: {
              entry: "入场触发条件（例如突破/回踩确认）",
              invalidation: "无效条件/止损依据",
              takeProfit: "止盈/减仓建议",
              positionSizing: "仓位建议（文字）",
            },
            risks: ["风险1", "风险2"],
            disclaimer: "固定写：不构成投资建议",
          },
        },
        null,
        2,
      ),
    };

    const content = await callLLM([system, user]);
    res.json(safeJsonParse(content));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("/api/ai/analyze", message);
    res.status(500).json({ error: message });
  }
});

// AI 选股：从候选列表中挑选更符合风格的标的
app.post("/api/ai/pick", async (req, res) => {
  try {
    const { candidates, horizon, riskProfile, topN } = req.body || {};
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ error: "missing candidates" });
    }

    const system: ChatMessage = {
      role: "system",
      content:
        "你是一个严谨的选股助手。你只能基于传入的行情字段（价格、涨跌幅、开高低、成交量、持仓盈亏等）进行排序与筛选，不要编造基本面/新闻。输出必须是严格 JSON（纯 JSON 字符串），不要输出 Markdown，不要使用 ```json 代码块。必须包含风险提示：不构成投资建议。",
    };

    const user: ChatMessage = {
      role: "user",
      content: JSON.stringify(
        {
          task: "pick",
          horizon: horizon || "swing_1_5_days",
          riskProfile: riskProfile || "medium",
          topN: Math.min(Number(topN) || 3, 10),
          candidates,
          outputSchema: {
            picks: [
              {
                code: "",
                name: "",
                rank: 1,
                bias: "bullish|bearish|neutral",
                reason: ["理由1", "理由2"],
                plan: {
                  entry: "触发条件",
                  invalidation: "止损/无效",
                  takeProfit: "止盈",
                },
                riskNotes: ["风险"],
              },
            ],
            excluded: [
              {
                code: "",
                name: "",
                why: "排除原因",
              },
            ],
            disclaimer: "固定写：不构成投资建议",
          },
        },
        null,
        2,
      ),
    };

    const content = await callLLM([system, user]);
    res.json(safeJsonParse(content));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("/api/ai/pick", message);
    res.status(500).json({ error: message });
  }
});

// ===== A股板块 & 条件选股（AI + 开源行情接口） =====

// 1) 推荐当下最强板块（可用于盘中/盘后）：结合板块涨跌 + 新闻标题，给出原因和建议个股
app.post("/api/ai/a/sector", async (req, res) => {
  try {
    const mockFlag =
      String(req.query.mock || "").toLowerCase() === "1" ||
      String(req.query.mock || "").toLowerCase() === "true" ||
      Boolean((req.body || {}).mock);
    console.log(mockFlag, "mockFlag");
    if (mockFlag) return res.json(AI_SECTOR_MOCK);
    const { mode, topSectorN, topStockN, horizon, riskProfile } =
      req.body || {};
    const sectors = await fetchHotSectors(
      Math.min(Number(topSectorN) || 10, 20),
    );
    const news = await fetchNewsHeadlines(12);

    const sectorCandidates = [
      ...sectors.industry.map((s) => ({ ...s, kind: "industry" })),
      ...sectors.concept.map((s) => ({ ...s, kind: "concept" })),
    ].slice(0, 40);

    const system: ChatMessage = {
      role: "system",
      content:
        "你是A股盘面研究与选股助手。你只能基于传入的板块涨跌幅/成交额/资金等字段，以及提供的新闻标题进行归因，不要编造不存在的消息细节。输出必须是严格 JSON（纯 JSON 字符串），不要输出 Markdown/```。必须包含风险提示：不构成投资建议。",
    };

    const user: ChatMessage = {
      role: "user",
      content: JSON.stringify(
        {
          task: "sector_recommend",
          mode: mode || "intraday", // intraday | after_close
          horizon: horizon || "swing_1_5_days",
          riskProfile: riskProfile || "medium",
          sectorCandidates,
          newsHeadlines: news,
          outputSchema: {
            bestSectors: [
              {
                kind: "industry|concept",
                code: "BKxxxx",
                name: "",
                rank: 1,
                whyHot: ["原因1", "原因2"],
                riskNotes: ["风险"],
                keySignals: {
                  percent: "number",
                  amount: "number",
                  mainNetIn: "number",
                },
              },
            ],
            focus: {
              todayHotSectors: ["板块名..."],
              watchListSectors: ["板块名..."],
            },
            openCandidates: [
              {
                code: "",
                name: "",
                rank: 1,
                reason: ["理由"],
                plan: {
                  entry: "触发条件",
                  invalidation: "止损/无效",
                  takeProfit: "止盈",
                },
                riskNotes: ["风险"],
              },
            ],
            disclaimer: "固定写：不构成投资建议",
          },
        },
        null,
        2,
      ),
    };

    const content = await callLLM([system, user]);
    const parsed = safeJsonParse<any>(content);

    // 补充“最值得开仓板块”的成分股行情（取 bestSectors[0]）
    const best = parsed?.bestSectors?.[0];
    if (best?.code) {
      parsed.bestSectorStocks = await fetchSectorConstituents(
        String(best.code),
        Math.min(Number(topStockN) || 20, 80),
      );
    }

    res.json(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("/api/ai/a/sector", message);
    res.status(500).json({ error: message });
  }
});

// 2) 收盘后复盘：你可以传 mode=after_close（逻辑与上面一致，但 prompt 会看 mode 字段）
app.post("/api/ai/a/afterclose", async (req, res) => {
  try {
    const { topSectorN, topStockN, horizon, riskProfile } = req.body || {};
    const sectors = await fetchHotSectors(
      Math.min(Number(topSectorN) || 10, 20),
    );
    const news = await fetchNewsHeadlines(20);

    const sectorCandidates = [
      ...sectors.industry.map((s) => ({ ...s, kind: "industry" })),
      ...sectors.concept.map((s) => ({ ...s, kind: "concept" })),
    ].slice(0, 60);

    const system: ChatMessage = {
      role: "system",
      content:
        "你是A股收盘复盘助手。你只能基于传入的板块涨跌幅/成交额/资金等字段，以及提供的新闻标题进行归因与复盘，不要编造不存在的消息细节。输出必须是严格 JSON（纯 JSON 字符串），不要输出 Markdown/```。必须包含风险提示：不构成投资建议。",
    };

    const user: ChatMessage = {
      role: "user",
      content: JSON.stringify(
        {
          task: "after_close_review",
          horizon: horizon || "swing_1_5_days",
          riskProfile: riskProfile || "medium",
          sectorCandidates,
          newsHeadlines: news,
          outputSchema: {
            hotSectors: [
              {
                kind: "industry|concept",
                code: "BKxxxx",
                name: "",
                rank: 1,
                whyHot: ["原因1", "原因2"],
                riskNotes: ["风险"],
                keySignals: {
                  percent: "number",
                  amount: "number",
                  mainNetIn: "number",
                },
              },
            ],
            worthWatching: [
              {
                name: "",
                why: ["原因"],
              },
            ],
            openCandidates: [
              {
                code: "",
                name: "",
                rank: 1,
                reason: ["理由"],
                plan: {
                  entry: "触发条件",
                  invalidation: "止损/无效",
                  takeProfit: "止盈",
                },
                riskNotes: ["风险"],
              },
            ],
            disclaimer: "固定写：不构成投资建议",
          },
        },
        null,
        2,
      ),
    };

    const content = await callLLM([system, user]);
    const parsed = safeJsonParse<any>(content);

    const best = parsed?.hotSectors?.[0];
    if (best?.code) {
      parsed.bestSectorStocks = await fetchSectorConstituents(
        String(best.code),
        Math.min(Number(topStockN) || 20, 80),
      );
    }

    res.json(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("/api/ai/a/afterclose", message);
    res.status(500).json({ error: message });
  }
});

// 3) 条件选股：输入自然语言条件，在A股快照里筛出满足的标的
app.post("/api/ai/a/screen", async (req, res) => {
  try {
    const { query, limit, horizon, riskProfile } = req.body || {};
    const q = String(query || "").trim();
    if (!q) return res.status(400).json({ error: "missing query" });

    const snapshot = await fetchAshareSnapshot(
      Math.min(Number(limit) || 200, 500),
    );

    const system: ChatMessage = {
      role: "system",
      content:
        "你是A股条件选股助手。你只能基于传入的行情字段（价格、涨跌幅、开高低、成交量/成交额等）进行筛选和排序，不要编造基本面/新闻。输出必须是严格 JSON（纯 JSON 字符串），不要输出 Markdown/```。必须包含风险提示：不构成投资建议。",
    };

    const user: ChatMessage = {
      role: "user",
      content: JSON.stringify(
        {
          task: "screen",
          horizon: horizon || "swing_1_5_days",
          riskProfile: riskProfile || "medium",
          query: q,
          candidates: snapshot,
          outputSchema: {
            interpretation: {
              must: ["硬条件"],
              prefer: ["偏好条件"],
              avoid: ["排除项"],
            },
            picks: [
              {
                code: "",
                name: "",
                rank: 1,
                reason: ["理由"],
                plan: {
                  entry: "触发条件",
                  invalidation: "止损/无效",
                  takeProfit: "止盈",
                },
                riskNotes: ["风险"],
              },
            ],
            excludedExamples: [{ code: "", name: "", why: "" }],
            disclaimer: "固定写：不构成投资建议",
          },
        },
        null,
        2,
      ),
    };

    const content = await callLLM([system, user]);
    res.json(safeJsonParse(content));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("/api/ai/a/screen", message);
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Stock API proxy: http://localhost:${PORT}`);
});
