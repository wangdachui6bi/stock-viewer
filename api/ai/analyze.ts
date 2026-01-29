import { readBody, sendJson, setCors } from '../_lib/http'
import { callLLM, safeJsonParse, type ChatMessage } from '../_lib/ai'

export default async function handler(req: any, res: any) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method Not Allowed' })

  try {
    const body = await readBody(req)
    const { stock, horizon, riskProfile } = body || {}
    if (!stock?.code) return sendJson(res, 400, { error: 'missing stock' })

    const system: ChatMessage = {
      role: 'system',
      content:
        '你是一个严谨的交易分析助手。你只能基于用户提供的行情字段进行分析，不要编造财务数据或新闻。输出必须是严格 JSON（纯 JSON 字符串），不要输出 Markdown，不要使用 ```json 代码块。必须包含风险提示：不构成投资建议。',
    }

    const user: ChatMessage = {
      role: 'user',
      content: JSON.stringify(
        {
          task: 'analyze',
          horizon: horizon || 'swing_1_5_days',
          riskProfile: riskProfile || 'medium',
          stock,
          outputSchema: {
            summary: '一句话结论',
            bias: 'bullish|bearish|neutral',
            keyObservations: ['要点1', '要点2'],
            levels: { support: ['数字或区间'], resistance: ['数字或区间'] },
            plan: {
              entry: '入场触发条件（例如突破/回踩确认）',
              invalidation: '无效条件/止损依据',
              takeProfit: '止盈/减仓建议',
              positionSizing: '仓位建议（文字）',
            },
            risks: ['风险1', '风险2'],
            disclaimer: '固定写：不构成投资建议',
          },
        },
        null,
        2,
      ),
    }

    const content = await callLLM([system, user])
    sendJson(res, 200, safeJsonParse(content))
  } catch (e: any) {
    sendJson(res, 500, { error: e?.message || String(e) })
  }
}
