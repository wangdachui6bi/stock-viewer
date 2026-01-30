import { readBody, sendJson, setCors } from '../_lib/http.js'
import { callLLM, safeJsonParse, type ChatMessage } from '../_lib/ai.js'

export default async function handler(req: any, res: any) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method Not Allowed' })

  try {
    const body = await readBody(req)
    const { candidates, horizon, riskProfile, topN } = body || {}
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return sendJson(res, 400, { error: 'missing candidates' })
    }

    const system: ChatMessage = {
      role: 'system',
      content:
        '你是一个严谨的选股助手。你只能基于传入的行情字段（价格、涨跌幅、开高低、成交量、持仓盈亏等）进行排序与筛选，不要编造基本面/新闻。输出必须是严格 JSON（纯 JSON 字符串），不要输出 Markdown，不要使用 ```json 代码块。必须包含风险提示：不构成投资建议。',
    }

    const user: ChatMessage = {
      role: 'user',
      content: JSON.stringify(
        {
          task: 'pick',
          horizon: horizon || 'swing_1_5_days',
          riskProfile: riskProfile || 'medium',
          topN: Math.min(Number(topN) || 3, 10),
          candidates,
          outputSchema: {
            picks: [
              {
                code: '',
                name: '',
                rank: 1,
                bias: 'bullish|bearish|neutral',
                reason: ['理由1', '理由2'],
                plan: { entry: '触发条件', invalidation: '止损/无效', takeProfit: '止盈' },
                riskNotes: ['风险'],
              },
            ],
            excluded: [{ code: '', name: '', why: '排除原因' }],
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
