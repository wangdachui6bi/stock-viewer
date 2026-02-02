import axios from "axios";
import JSON5 from "json5";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const aiCache = new Map<string, { ts: number; content: string }>();
const AI_CACHE_TTL_MS = 30_000;

function cacheKey(messages: ChatMessage[]) {
  return JSON.stringify(messages);
}

function extractJsonObject(text: string): string {
  const s = String(text || "").trim();

  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

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
      if (depth === 0) return s.slice(start, i + 1);
    }
  }

  return s;
}

export function safeJsonParse<T = any>(text: string): T {
  const raw = extractJsonObject(text);
  try {
    return JSON.parse(raw) as T;
  } catch {
    try {
      const unwrapped = JSON.parse(raw);
      if (typeof unwrapped === "string") {
        return JSON.parse(extractJsonObject(unwrapped)) as T;
      }
    } catch {
      // ignore
    }
    return JSON5.parse(raw) as T;
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function callLLM(messages: ChatMessage[]) {
  const volcApiKey = process.env.VOLCENGINE_API_KEY;
  const volcBaseUrl =
    process.env.VOLCENGINE_BASE_URL ||
    "https://ark.cn-beijing.volces.com/api/v3";
  const volcModel = process.env.VOLCENGINE_MODEL || "deepseek-v3.2";

  if (!volcApiKey) throw new Error("Missing VOLCENGINE_API_KEY");

  const key = cacheKey(messages);
  const now = Date.now();
  const cached = aiCache.get(key);
  if (cached && now - cached.ts < AI_CACHE_TTL_MS) return cached.content;

  const url = `${volcBaseUrl.replace(/\/$/, "")}/chat/completions`;
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await axios.post(
        url,
        { model: volcModel, messages, temperature: 0.2 },
        {
          headers: {
            Authorization: `Bearer ${volcApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 120_000,
        },
      );
      const content = resp.data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("LLM API returned empty content");
      aiCache.set(key, { ts: Date.now(), content });
      return content as string;
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 429 && attempt < maxRetries) {
        const retryAfterHeader = e?.response?.headers?.["retry-after"];
        const retryAfterMs = retryAfterHeader
          ? Number(retryAfterHeader) * 1000
          : 500 * Math.pow(2, attempt);
        await sleep(Math.min(retryAfterMs, 5000));
        continue;
      }
      throw new Error(
        `LLM API error${status ? ` (${status})` : ""}: ${e?.message || String(e)}`,
      );
    }
  }

  throw new Error("LLM API error: exhausted retries");
}
