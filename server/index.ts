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
import { parseSinaStockResponse, parseTencentHKResponse } from "./parser.ts";

const { decode } = iconv;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(rootDir, ".env.local") });
dotenv.config({ path: path.join(rootDir, ".env") });

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function extractJsonObject(text: string): string {
  const s = String(text || "").trim();

  // 1) ```json ... ``` / ``` ... ```
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  // 2) 尝试截取第一段 JSON 对象
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) return s.slice(first, last + 1);

  return s;
}

function safeJsonParse<T = any>(text: string): T {
  const raw = extractJsonObject(text);
  try {
    return JSON.parse(raw) as T;
  } catch (e: any) {
    // 报错时把原始前缀带出来，方便定位模型输出
    const preview = String(text || "").slice(0, 200);
    throw new Error(`${e?.message || "Invalid JSON"} [0] preview=${JSON.stringify(preview)}`);
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
    process.env.VOLCENGINE_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
  const volcModel = process.env.VOLCENGINE_MODEL || "deepseek-v3.2";

  const openaiApiKey = process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY;
  const openaiBaseUrl =
    process.env.OPENAI_BASE_URL || process.env.CHATGPT_BASE_URL || "https://api.openai.com";
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
    try {
      const url =
        provider === "volc"
          ? `${volcBaseUrl.replace(/\/$/, "")}/chat/completions`
          : `${openaiBaseUrl.replace(/\/$/, "")}/v1/chat/completions`;

      const model = provider === "volc" ? volcModel : openaiModel;
      const apiKey = provider === "volc" ? volcApiKey! : openaiApiKey!;

      const { data } = await axios.post(
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
          timeout: 60000,
        },
      );

      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("LLM API returned empty content");
      aiCache.set(key, { ts: Date.now(), content });
      return content as string;
    } catch (e: any) {
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
  const detail = e?.response?.data ? JSON.stringify(e.response.data) : e?.message;
  throw new Error(`LLM API error${status ? ` (${status})` : ""} [${provider}]: ${detail}`);
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

// 股票行情：新浪（A股、美股、期货）
app.get("/api/stock", async (req, res) => {
  const codes = String(req.query.codes || "")
    .split(",")
    .filter(Boolean);
  if (!codes.length) return res.json([]);
  const url = `https://hq.sinajs.cn/list=${codes
    .map((c) => c.replace(".", "$"))
    .join(",")}`;
  try {
    const resp = await axios.get(url, {
      responseType: "arraybuffer",
      headers: randHeader(),
    });
    const body = decode(Buffer.from(resp.data), "GB18030");
    const list = parseSinaStockResponse(body, codes);
    res.json(list);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
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
  try {
    const resp = await axios.get(url, {
      params: { q, fmt: "json" },
      responseType: "arraybuffer",
    });
    const body = decode(Buffer.from(resp.data), "GBK");
    const data = JSON.parse(body);
    const list = parseTencentHKResponse(data, codes);
    res.json(list);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
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
  try {
    const resp = await axios.get(url, { params: { q } });
    const arr = resp.data?.data?.stock || [];
    const list = arr.map((item: string[]) => ({
      code: (item[1] || "").toLowerCase(),
      name: item[2] || "",
      market: item[0] || "",
      abbreviation: item[3] || "",
      label: `${(item[0] || "")}${(item[1] || "").toLowerCase()} | ${
        item[2] || ""
      }`,
    }));
    res.json(list);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("/api/search", message);
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

app.listen(PORT, () => {
  console.log(`Stock API proxy: http://localhost:${PORT}`);
});
