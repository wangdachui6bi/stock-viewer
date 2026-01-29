import type { IncomingMessage, ServerResponse } from 'http'

export type Req = IncomingMessage & {
  query?: Record<string, any>
  body?: any
  method?: string
}

export type Res = ServerResponse & {
  status?: (code: number) => Res
  json?: (data: any) => void
  send?: (data: any) => void
}

export function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export function sendJson(res: any, status: number, data: any) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

export async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
  const raw = Buffer.concat(chunks).toString('utf-8')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export function parseQuery(req: IncomingMessage): Record<string, string> {
  const url = new URL(req.url || '/', 'http://localhost')
  const q: Record<string, string> = {}
  url.searchParams.forEach((v, k) => (q[k] = v))
  return q
}
