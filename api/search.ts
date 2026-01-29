import axios from 'axios'
import { parseQuery, sendJson, setCors } from './_lib/http'

export default async function handler(req: any, res: any) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const q = parseQuery(req)
  const kw = String(q.q || '').trim()
  if (!kw) return sendJson(res, 200, [])

  const url = 'https://proxy.finance.qq.com/ifzqgtimg/appstock/smartbox/search/get'
  try {
    const resp = await axios.get(url, { params: { q: kw }, timeout: 20000 })
    const arr = resp.data?.data?.stock || []
    const list = arr.map((item: string[]) => ({
      code: (item[1] || '').toLowerCase(),
      name: item[2] || '',
      market: item[0] || '',
      abbreviation: item[3] || '',
      label: `${(item[0] || '')}${(item[1] || '').toLowerCase()} | ${item[2] || ''}`,
    }))
    sendJson(res, 200, list)
  } catch (e: any) {
    sendJson(res, 500, { error: e?.message || String(e) })
  }
}
