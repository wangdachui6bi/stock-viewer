import axios from 'axios'

type EastmoneyKlineResp = {
  data?: { klines?: string[] }
  rc?: number
}

export async function fetchEastmoneyKline(params: {
  code: string
  period: 'daily' | 'weekly' | 'monthly'
  count: number
}) {
  const { code, period, count } = params
  const pure = String(code || '').toLowerCase()
  const digits = pure.replace(/^(sh|sz|bj)/, '')
  const market = pure.startsWith('sh') ? 1 : 0
  const secid = `${market}.${digits}`
  const kltMap: Record<string, number> = { daily: 101, weekly: 102, monthly: 103 }
  const klt = kltMap[period] || 101

  const url = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
  const resp = await axios.get<EastmoneyKlineResp>(url, {
    params: {
      secid,
      klt,
      fqt: 1,
      beg: 0,
      end: 20500101,
      lmt: Math.min(Math.max(50, count), 500),
      fields1: 'f1,f2,f3,f4,f5,f6',
      fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
    },
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://quote.eastmoney.com/',
    },
    timeout: 20000,
  })

  const klines = resp.data?.data?.klines || []
  return klines
}
