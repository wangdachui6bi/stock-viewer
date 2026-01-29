export type KlineBar = {
  ts: number // ms
  date: string // YYYY-MM-DD
  open: number
  close: number
  high: number
  low: number
  volume?: number
  amount?: number
}

export type KlinePeriod = 'daily' | 'weekly' | 'monthly'
