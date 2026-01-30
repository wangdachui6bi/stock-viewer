import axios from 'axios'
import iconv from 'iconv-lite'
import { parseQuery, readBody, sendJson, setCors } from './_lib/http.js'
import { parseSinaStockResponse } from './_lib/parser.js'

const { decode } = iconv

const randHeader = () => ({
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'http://finance.sina.com.cn/',
  Accept: '*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Connection: 'keep-alive',
})

function isAshare(code: string) {
  return /^(sh|sz|bj)\d+$/i.test(code)
}

function toEastmoneySecId(code: string) {
  const pure = String(code || '').toLowerCase()
  const digits = pure.replace(/^(sh|sz|bj)/, '')
  const market = pure.startsWith('sh') ? 1 : 0
  return `${market}.${digits}`
}

function fmt2(v: any) {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  return (n / 100).toFixed(2)
}

function fmtInt(v: any) {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  return String(n)
}

async function fetchEastmoneyQuotes(codes: string[]) {
  // 使用东财公开 quote 接口做 fallback：避免新浪 403（Vercel 出口 IP 可能被拦）
  const fields = 'f58,f43,f44,f45,f46,f47,f48,f60,f169,f170'
  const list = await Promise.all(
    codes.map(async (c) => {
      const secid = toEastmoneySecId(c)
      const url = 'https://push2.eastmoney.com/api/qt/stock/get'
      const resp = await axios.get(url, {
        params: { secid, fields },
        timeout: 20000,
        headers: {
          'User-Agent': randHeader()['User-Agent'],
          Referer: 'https://quote.eastmoney.com/',
          Accept: 'application/json,text/plain,*/*',
        },
        validateStatus: () => true,
      })

      if (resp.status !== 200) {
        return { code: c, name: `无数据 ${c}`, type: 'nodata', percent: '' }
      }

      const d = resp.data?.data || {}
      const name = String(d.f58 || '')
      const price = fmt2(d.f43)
      const high = fmt2(d.f44)
      const low = fmt2(d.f45)
      const open = fmt2(d.f46)
      const volume = fmtInt(d.f47)
      const amount = fmtInt(d.f48)
      const yestclose = fmt2(d.f60)
      const updown = fmt2(d.f169)
      const percentNum = Number(d.f170)
      const percent = Number.isFinite(percentNum) ? `${percentNum >= 0 ? '+' : ''}${(percentNum / 100).toFixed(2)}` : ''

      return {
        code: String(c).toLowerCase(),
        name,
        type: 'a',
        symbol: String(c).toLowerCase().replace(/^(sh|sz|bj)/, ''),
        open,
        yestclose,
        price,
        high,
        low,
        volume,
        amount,
        time: '',
        updown,
        percent,
      }
    }),
  )

  return list
}

export default async function handler(req: any, res: any) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const q = parseQuery(req)
  const codes = String(q.codes || '')
    .split(',')
    .filter(Boolean)
  if (!codes.length) return sendJson(res, 200, [])

  // 新浪接口对部分云厂商出口 IP 偶发 403；优先用 http + 完整 headers，失败再 fallback 东财
  const url = `http://hq.sinajs.cn/list=${codes.map((c) => c.replace('.', '$')).join(',')}`
  try {
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: randHeader(),
      timeout: 20000,
      validateStatus: () => true,
    })

    if (resp.status === 200) {
      const body = decode(Buffer.from(resp.data), 'GB18030')
      const list = parseSinaStockResponse(body, codes)
      return sendJson(res, 200, list)
    }

    // 只对 A 股做 fallback（你的前端把 HK 分流到了 /api/hk）
    if (resp.status === 403 || resp.status === 451) {
      const aCodes = codes.filter((c) => isAshare(c))
      const fallback = await fetchEastmoneyQuotes(aCodes)
      return sendJson(res, 200, fallback)
    }

    return sendJson(res, resp.status || 500, { error: `upstream status ${resp.status}` })
  } catch (e: any) {
    // 网络错误等：同样 fallback
    const aCodes = codes.filter((c) => isAshare(c))
    if (aCodes.length) {
      const fallback = await fetchEastmoneyQuotes(aCodes)
      return sendJson(res, 200, fallback)
    }
    sendJson(res, 500, { error: e?.message || String(e) })
  }
}
