import { readBody, sendJson, setCors } from "../../_lib/http.js";
import { callLLM, safeJsonParse, type ChatMessage } from "../../_lib/ai.js";
import {
  fetchHotSectors,
  fetchNewsHeadlines,
  fetchAshareSnapshot,
} from "../../_lib/a_share.js";

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return sendJson(res, 405, { error: "Method Not Allowed" });

  try {
    const body = await readBody(req);
    const { limit, horizon, riskProfile } = body || {};

    const [sectors, news, snapshot] = await Promise.all([
      fetchHotSectors(15),
      fetchNewsHeadlines(15),
      fetchAshareSnapshot(Math.min(Number(limit) || 260, 500)),
    ]);

    const topByAmount = [...snapshot]
      .sort(
        (a: any, b: any) => (Number(b.amount) || 0) - (Number(a.amount) || 0),
      )
      .slice(0, 60);
    const topGainers = [...snapshot]
      .sort(
        (a: any, b: any) => (Number(b.percent) || 0) - (Number(a.percent) || 0),
      )
      .slice(0, 60);
    const topLosers = [...snapshot]
      .sort(
        (a: any, b: any) => (Number(a.percent) || 0) - (Number(b.percent) || 0),
      )
      .slice(0, 60);

    const sectorCandidates = [
      ...sectors.industry.map((s: any) => ({ ...s, kind: "industry" })),
      ...sectors.concept.map((s: any) => ({ ...s, kind: "concept" })),
    ].slice(0, 40);

    const system: ChatMessage = {
      role: "system",
      content:
        "你是A股盘面雷达助手（短线/波段/低吸/埋伏/风险控制）。你只能基于传入的行情字段（价格、涨跌幅、开高低、成交量/成交额）和板块字段（涨跌幅/成交额/资金）以及提供的新闻标题进行归因与分组，不要编造不存在的消息细节，不要编造基本面/财务数据。输出必须是严格 JSON（纯 JSON 字符串），不要输出 Markdown/```。必须包含风险提示：不构成投资建议。",
    };

    const user: ChatMessage = {
      role: "user",
      content: JSON.stringify(
        {
          task: "market_radar",
          horizon: horizon || "swing_1_5_days",
          riskProfile: riskProfile || "medium",
          sectorCandidates,
          newsHeadlines: news,
          topByAmount,
          topGainers,
          topLosers,
          outputSchema: {
            market: {
              sentiment: "risk_on|risk_off|mixed",
              mainThemes: ["主题/板块"],
              notes: ["盘面要点"],
              riskLevel: "low|medium|high",
            },
            baskets: {
              hotMomentum: [
                {
                  code: "",
                  name: "",
                  rank: 1,
                  reason: ["为何热"],
                  plan: { entry: "", invalidation: "", takeProfit: "" },
                  riskNotes: [""],
                  tags: ["强势", "情绪"],
                },
              ],
              lowAbsorbPullback: [
                {
                  code: "",
                  name: "",
                  rank: 1,
                  reason: ["为何适合低吸/回踩观察"],
                  plan: { entry: "", invalidation: "", takeProfit: "" },
                  riskNotes: [""],
                  tags: ["低吸", "回踩"],
                },
              ],
              ambushWatch: [
                {
                  code: "",
                  name: "",
                  rank: 1,
                  reason: ["为何适合埋伏观察"],
                  trigger: ["观察触发条件"],
                  riskNotes: [""],
                  tags: ["埋伏", "等待确认"],
                },
              ],
              avoid: [
                {
                  code: "",
                  name: "",
                  why: "为何回避",
                },
              ],
            },
            watchSectors: ["板块名"],
            disclaimer: "固定写：不构成投资建议",
          },
        },
        null,
        2,
      ),
    };

    const content = await callLLM([system, user]);
    const parsed = safeJsonParse<any>(content);
    sendJson(res, 200, parsed);
  } catch (e: any) {
    sendJson(res, 500, { error: e?.message || String(e) });
  }
}
