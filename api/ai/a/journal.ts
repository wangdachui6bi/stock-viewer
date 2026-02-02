import { readBody, sendJson, setCors } from "../../_lib/http.js";
import { callLLM, safeJsonParse, type ChatMessage } from "../../_lib/ai.js";

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return sendJson(res, 405, { error: "Method Not Allowed" });

  try {
    const body = await readBody(req);
    const { notes, trades, horizon, riskProfile, context } = body || {};
    const text = String(notes || "").trim();
    if (!text && (!Array.isArray(trades) || trades.length === 0)) {
      return sendJson(res, 400, { error: "missing notes" });
    }

    const system: ChatMessage = {
      role: "system",
      content:
        "你是A股交易复盘教练与记录整理助手。你只根据用户提供的交易/感受/复盘笔记进行总结和行动化，不要编造用户没有提供的成交、新闻、财务等细节。输出必须是严格 JSON（纯 JSON 字符串），不要输出 Markdown/```。必须包含风险提示：不构成投资建议。",
    };

    const user: ChatMessage = {
      role: "user",
      content: JSON.stringify(
        {
          task: "journal",
          horizon: horizon || "swing_1_5_days",
          riskProfile: riskProfile || "medium",
          notes: text,
          trades: Array.isArray(trades) ? trades : [],
          context: context || {},
          outputSchema: {
            recap: {
              oneSentence: "一句话总结",
              whatWorked: [""],
              whatDidnt: [""],
              keyLessons: [""],
            },
            tomorrowPlan: {
              focus: [""],
              riskControl: [""],
              ifThen: ["如果...那么..."],
            },
            watchlist: [
              {
                code: "",
                name: "",
                whyWatch: [""],
                trigger: ["触发条件"],
                invalidation: "无效/止损依据",
              },
            ],
            checklist: {
              beforeOpen: [""],
              intraday: [""],
              afterClose: [""],
            },
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
