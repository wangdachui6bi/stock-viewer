import { parseQuery, sendJson, setCors } from './_lib/http.js'
import { fetchEastmoneyKline } from './_lib/eastmoney.js'

export default async function handler(req: any, res: any) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const q = parseQuery(req)
  const code = String(q.code || '').trim().toLowerCase()
  const period = String(q.period || 'daily').toLowerCase()
  const count = Math.min(Number(q.count) || 200, 500)

  if (!code) return sendJson(res, 400, { error: 'missing code' })
  if (!code.startsWith('sh') && !code.startsWith('sz') && !code.startsWith('bj')) {
    return sendJson(res, 400, { error: 'only A-share codes supported: sh/sz/bj' })
  }

  try {
    const raw = await fetchEastmoneyKline({
      code,
      period: period === 'weekly' || period === 'monthly' ? (period as any) : 'daily',
      count,
    })

    const bars = raw
      .map((line) => String(line).split(','))
      .filter((arr) => arr.length >= 6)
      .map((arr) => {
        const date = arr[0]
        const open = Number(arr[1])
        const close = Number(arr[2])
        const high = Number(arr[3])
        const low = Number(arr[4])
        const volume = Number(arr[5])
        const amount = arr[6] != null ? Number(arr[6]) : undefined
        const ts = Date.parse(date + 'T00:00:00+08:00')
        return { ts, date, open, close, high, low, volume, amount }
      })
      .filter((b) => Number.isFinite(b.ts) && Number.isFinite(b.close))

    sendJson(res, 200, bars)
  } catch (e: any) {
    sendJson(res, 500, { error: e?.message || String(e) })
  }
}
