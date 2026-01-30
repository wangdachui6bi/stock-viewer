import { readBody, sendJson, setCors } from '../../_lib/http.js'
import { callLLM, safeJsonParse, type ChatMessage } from '../../_lib/ai.js'
import { fetchAshareSnapshot } from '../../_lib/a_share.js'

export default async function handler(req: any, res: any) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method Not Allowed' })

  try {
    const body = await readBody(req)
    const { query, limit, horizon, riskProfile } = body || {}
    const q = String(query || '').trim()
    if (!q) return sendJson(res, 400, { error: 'missing query' })

    const snapshot = await fetchAshareSnapshot(Math.min(Number(limit) || 200, 500))

    const system: ChatMessage = {
      role: 'system',
      content:
        '你是A股条件选股助手。你只能基于传入的行情字段（价格、涨跌幅、开高低、成交量/成交额等）进行筛选和排序，不要编造基本面/新闻。输出必须是严格 JSON（纯 JSON 字符串），不要输出 Markdown/```。必须包含风险提示：不构成投资建议。',
    }

    const user: ChatMessage = {
      role: 'user',
      content: JSON.stringify(
        {
          task: 'screen',
          horizon: horizon || 'swing_1_5_days',
          riskProfile: riskProfile || 'medium',
          query: q,
          candidates: snapshot,
          outputSchema: {
            interpretation: {
              must: ['硬条件'],
              prefer: ['偏好条件'],
              avoid: ['排除项'],
            },
            picks: [
              {
                code: '',
                name: '',
                rank: 1,
                reason: ['理由'],
                plan: {
                  entry: '触发条件',
                  invalidation: '止损/无效',
                  takeProfit: '止盈',
                },
                riskNotes: ['风险'],
              },
            ],
            excludedExamples: [{ code: '', name: '', why: '' }],
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
