import axios from 'axios'

type EastmoneyClistResp = {
  data?: { diff?: any[] }
  rc?: number
}

async function fetchEastmoneyClist(params: Record<string, any>) {
  // 东方财富 push2 列表接口（公开、无需 key；但可能有频率限制）
  const url = 'https://push2.eastmoney.com/api/qt/clist/get'
  const resp = await axios.get<EastmoneyClistResp>(url, {
    params,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://quote.eastmoney.com/',
    },
    timeout: 20000,
  })
  return resp.data?.data?.diff || []
}

function mapAshareMarketFs(): string {
  // 沪深A：上证A(0/6,0/80) + 深证A(1/2,1/23)
  return 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23'
}

export async function fetchHotSectors(limit = 10) {
  // 行业板块（t:2）+ 概念板块（t:3）
  // 关键字段：f12=代码 f14=名称 f3=涨跌幅 f62=主力净流入（不一定有） f6=成交额
  const fields = 'f12,f14,f2,f3,f4,f5,f6,f62,f184,f66,f69,f72,f75'

  const [industry, concept] = await Promise.all([
    fetchEastmoneyClist({
      pn: 1,
      pz: Math.min(limit, 30),
      po: 1,
      np: 1,
      fltt: 2,
      invt: 2,
      fid: 'f3',
      fs: 'm:90+t:2',
      fields,
    }),
    fetchEastmoneyClist({
      pn: 1,
      pz: Math.min(limit, 30),
      po: 1,
      np: 1,
      fltt: 2,
      invt: 2,
      fid: 'f3',
      fs: 'm:90+t:3',
      fields,
    }),
  ])

  const toSector = (x: any) => ({
    code: String(x.f12 || ''),
    name: String(x.f14 || ''),
    price: x.f2,
    percent: x.f3,
    amount: x.f6,
    mainNetIn: x.f62,
  })

  return {
    industry: industry.map(toSector).filter((s: any) => s.code && s.name),
    concept: concept.map(toSector).filter((s: any) => s.code && s.name),
  }
}

export async function fetchSectorConstituents(bkCode: string, limit = 30) {
  const fields = 'f12,f14,f2,f3,f4,f5,f6,f15,f16,f17'
  const diff = await fetchEastmoneyClist({
    pn: 1,
    pz: Math.min(limit, 200),
    po: 1,
    np: 1,
    fltt: 2,
    invt: 2,
    fid: 'f3',
    fs: `b:${bkCode}`,
    fields,
  })

  return diff
    .map((x: any) => ({
      code: String(x.f12 || '').toLowerCase(),
      name: String(x.f14 || ''),
      price: x.f2,
      percent: x.f3,
      updown: x.f4,
      volume: x.f5,
      amount: x.f6,
      high: x.f15,
      low: x.f16,
      open: x.f17,
    }))
    .filter((s: any) => s.code && s.name)
}

export async function fetchAshareSnapshot(limit = 200) {
  const fields = 'f12,f14,f2,f3,f4,f5,f6,f15,f16,f17'
  const diff = await fetchEastmoneyClist({
    pn: 1,
    pz: Math.min(limit, 500),
    po: 1,
    np: 1,
    fltt: 2,
    invt: 2,
    fid: 'f6', // 成交额
    fs: mapAshareMarketFs(),
    fields,
  })

  return diff
    .map((x: any) => ({
      code: String(x.f12 || '').toLowerCase(),
      name: String(x.f14 || ''),
      price: x.f2,
      percent: x.f3,
      updown: x.f4,
      volume: x.f5,
      amount: x.f6,
      high: x.f15,
      low: x.f16,
      open: x.f17,
    }))
    .filter((s: any) => s.code && s.name)
}

export async function fetchNewsHeadlines(limit = 10) {
  // 新浪财经 RSS（公开、无需 key）。不可用就返回空数组。
  const url = 'https://rss.sina.com.cn/roll/finance/hgjj.xml'
  try {
    const { data } = await axios.get(url, { timeout: 15000 })
    const xml = String(data || '')
    const titles = [...xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)]
      .map((m) => m[1])
      .filter((t) => t && t !== '新浪财经' && t !== '滚动新闻')
      .slice(0, limit)
    return titles
  } catch {
    return []
  }
}

// 轻量 mock：用于前端调试（query/mock=1 或 body.mock=true）
export const AI_SECTOR_MOCK = {
  bestSectors: [
    {
      kind: 'industry',
      code: 'BK0000',
      name: '示例板块',
      rank: 1,
      whyHot: ['这是 mock 数据：用于本地/预览环境调试'],
      riskNotes: ['不构成投资建议'],
      keySignals: { percent: 0, amount: 0, mainNetIn: 0 },
    },
  ],
  focus: { todayHotSectors: ['示例板块'], watchListSectors: [] },
  openCandidates: [],
  disclaimer: '不构成投资建议',
}
