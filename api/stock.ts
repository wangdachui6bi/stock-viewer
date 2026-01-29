import axios from 'axios'
import iconv from 'iconv-lite'
import { parseQuery, readBody, sendJson, setCors } from './_lib/http'
import { parseSinaStockResponse } from './_lib/parser'

const { decode } = iconv

const randHeader = () => ({
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'http://finance.sina.com.cn/',
})

export default async function handler(req: any, res: any) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const q = parseQuery(req)
  const codes = String(q.codes || '')
    .split(',')
    .filter(Boolean)
  if (!codes.length) return sendJson(res, 200, [])

  const url = `https://hq.sinajs.cn/list=${codes.map((c) => c.replace('.', '$')).join(',')}`
  try {
    const resp = await axios.get(url, { responseType: 'arraybuffer', headers: randHeader() })
    const body = decode(Buffer.from(resp.data), 'GB18030')
    const list = parseSinaStockResponse(body, codes)
    sendJson(res, 200, list)
  } catch (e: any) {
    sendJson(res, 500, { error: e?.message || String(e) })
  }
}
