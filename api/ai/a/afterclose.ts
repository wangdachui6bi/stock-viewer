import { readBody, sendJson, setCors } from '../../_lib/http.js'
import { callLLM, safeJsonParse, type ChatMessage } from '../../_lib/ai.js'
import { fetchHotSectors, fetchNewsHeadlines, fetchSectorConstituents } from '../../_lib/a_share.js'

export default async function handler(req: any, res: any) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method Not Allowed' })

  try {
    const body = await readBody(req)
    const { topSectorN, topStockN, horizon, riskProfile } = body || {}

    const sectors = await fetchHotSectors(Math.min(Number(topSectorN) || 10, 20))
    const news = await fetchNewsHeadlines(20)

    const sectorCandidates = [
      ...sectors.industry.map((s: any) => ({ ...s, kind: 'industry' })),
      ...sectors.concept.map((s: any) => ({ ...s, kind: 'concept' })),
    ].slice(0, 60)

    const system: ChatMessage = {
      role: 'system',
      content:
        '你是A股收盘复盘助手。你只能基于传入的板块涨跌幅/成交额/资金等字段，以及提供的新闻标题进行归因与复盘，不要编造不存在的消息细节。输出必须是严格 JSON（纯 JSON 字符串），不要输出 Markdown/```。必须包含风险提示：不构成投资建议。',
    }

    const user: ChatMessage = {
      role: 'user',
      content: JSON.stringify(
        {
          task: 'after_close_review',
          horizon: horizon || 'swing_1_5_days',
          riskProfile: riskProfile || 'medium',
          sectorCandidates,
          newsHeadlines: news,
          outputSchema: {
            hotSectors: [
              {
                kind: 'industry|concept',
                code: 'BKxxxx',
                name: '',
                rank: 1,
                whyHot: ['原因1', '原因2'],
                riskNotes: ['风险'],
                keySignals: { percent: 'number', amount: 'number', mainNetIn: 'number' },
              },
            ],
            worthWatching: [{ name: '', why: ['原因'] }],
            openCandidates: [
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
            disclaimer: '固定写：不构成投资建议',
          },
        },
        null,
        2,
      ),
    }

    const content = await callLLM([system, user])
    const parsed = safeJsonParse<any>(content)

    const best = parsed?.hotSectors?.[0]
    if (best?.code) {
      parsed.bestSectorStocks = await fetchSectorConstituents(
        String(best.code),
        Math.min(Number(topStockN) || 20, 80),
      )
    }

    sendJson(res, 200, parsed)
  } catch (e: any) {
    sendJson(res, 500, { error: e?.message || String(e) })
  }
}
