import axios from 'axios'
import { parseQuery, sendJson, setCors } from './_lib/http'

async function fetchNewsItems(limit = 20) {
  const url = 'https://rss.sina.com.cn/roll/finance/hgjj.xml'
  const { data } = await axios.get(url, { timeout: 15000 })
  const xml = String(data || '')
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((m) => m[1])
    .map((block) => {
      const title = /<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(block)?.[1] || ''
      const link = /<link>(.*?)<\/link>/.exec(block)?.[1] || ''
      const pubDate = /<pubDate>(.*?)<\/pubDate>/.exec(block)?.[1] || ''
      return { title, link, pubDate }
    })
    .filter((item) => item.title && item.title !== '新浪财经')
    .slice(0, limit)
  return items
}

export default async function handler(req: any, res: any) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const q = parseQuery(req)
  const limit = Math.min(Number(q.limit) || 20, 50)
  try {
    const items = await fetchNewsItems(limit)
    sendJson(res, 200, items)
  } catch (e: any) {
    sendJson(res, 200, [])
  }
}
