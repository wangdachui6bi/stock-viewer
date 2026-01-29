import axios from 'axios'
import * as iconv from 'iconv-lite'
import { parseQuery, sendJson, setCors } from './_lib/http'
import { parseTencentHKResponse } from './_lib/parser'

const { decode } = iconv

export default async function handler(req: any, res: any) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const q = parseQuery(req)
  const codes = String(q.codes || '')
    .split(',')
    .filter(Boolean)
  if (!codes.length) return sendJson(res, 200, [])

  const qq = codes.map((c) => `r_${c}`).join(',')
  const url = 'https://qt.gtimg.cn/q='
  try {
    const resp = await axios.get(url, {
      params: { q: qq, fmt: 'json' },
      responseType: 'arraybuffer',
      timeout: 20000,
    })
    const body = decode(Buffer.from(resp.data), 'GBK')
    const data = JSON.parse(body)
    const list = parseTencentHKResponse(data, codes)
    sendJson(res, 200, list)
  } catch (e: any) {
    sendJson(res, 500, { error: e?.message || String(e) })
  }
}
