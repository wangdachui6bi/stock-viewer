import type { KlineBar } from '@/types/kline'

export function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null)
  if (period <= 0) return out
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function ema(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null)
  if (period <= 0) return out
  const k = 2 / (period + 1)
  let prev: number | null = null
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (prev == null) {
      prev = v
      out[i] = v
    } else {
      prev = v * k + prev * (1 - k)
      out[i] = prev
    }
  }
  // 前 period-1 根不稳定，标 null
  for (let i = 0; i < Math.min(period - 1, out.length); i++) out[i] = null
  return out
}

export function rsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null)
  if (values.length < period + 1) return out

  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const chg = values[i] - values[i - 1]
    if (chg >= 0) gain += chg
    else loss -= chg
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = period + 1; i < values.length; i++) {
    const chg = values[i] - values[i - 1]
    const g = chg > 0 ? chg : 0
    const l = chg < 0 ? -chg : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }

  return out
}

export function atr(bars: KlineBar[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(bars.length).fill(null)
  if (bars.length < period + 1) return out

  const tr: number[] = []
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      tr.push(bars[i].high - bars[i].low)
    } else {
      const prevClose = bars[i - 1].close
      const highLow = bars[i].high - bars[i].low
      const highClose = Math.abs(bars[i].high - prevClose)
      const lowClose = Math.abs(bars[i].low - prevClose)
      tr.push(Math.max(highLow, highClose, lowClose))
    }
  }

  // Wilder's smoothing
  let sum = 0
  for (let i = 0; i < tr.length; i++) {
    sum += tr[i]
    if (i === period - 1) {
      out[i] = sum / period
    } else if (i >= period) {
      const prev = out[i - 1]
      if (prev != null) out[i] = (prev * (period - 1) + tr[i]) / period
    }
  }

  return out
}
