import type { KlineBar } from '@/types/kline'
import { atr, rsi, sma } from './indicators'

export type StrategyId = 'reversal_rsi' | 'swing_pullback'

export type StrategySignal = {
  strategy: StrategyId
  signal: 'buy' | 'watch' | 'none'
  reason: string[]
  score: number // 0-100
  entry?: number
  stop?: number
  take?: number
}

export type ReversalParams = {
  rsiPeriod?: number
  oversold?: number // 默认 30
  extremeOversold?: number // 默认 25
  confirmMa?: number // 默认 5
  trendMa?: number // 默认 20
  atrPeriod?: number // 默认 14
  atrStopMult?: number // 默认 1.2
  atrTakeMult?: number // 默认 2.0
  watchRsi?: number // 默认 35
  buyScore?: number // 默认 45
  watchScore?: number // 默认 30
}

export type SwingParams = {
  trendMa?: number // 默认 20
  pullbackMa?: number // 默认 10
  slopeLookback?: number // 默认 5
  pullbackDistStrongPct?: number // 默认 1
  pullbackDistWeakPct?: number // 默认 2
  atrPeriod?: number // 默认 14
  atrStopMult?: number // 默认 1.0
  atrTakeMult?: number // 默认 2.2
  buyScore?: number // 默认 65
  watchScore?: number // 默认 40
}

export type StrategyParams = {
  reversal?: ReversalParams
  swing?: SwingParams
}

export function analyzeReversalRSI(bars: KlineBar[], p?: ReversalParams): StrategySignal {
  const rsiPeriod = p?.rsiPeriod ?? 14
  const oversold = p?.oversold ?? 30
  const extreme = p?.extremeOversold ?? 25
  const confirmMa = p?.confirmMa ?? 5
  const trendMa = p?.trendMa ?? 20
  const atrPeriod = p?.atrPeriod ?? 14
  const atrStopMult = p?.atrStopMult ?? 1.2
  const atrTakeMult = p?.atrTakeMult ?? 2.0
  const watchRsi = p?.watchRsi ?? 35
  const buyScore = p?.buyScore ?? 45
  const watchScore = p?.watchScore ?? 30

  const closes = bars.map((b) => b.close)
  const rs = rsi(closes, rsiPeriod)
  const maFast = sma(closes, confirmMa)
  const maTrend = sma(closes, trendMa)
  const a = atr(bars, atrPeriod)

  const i = bars.length - 1
  const r = rs[i]
  const c = closes[i]
  const prev = closes[i - 1] ?? c

  const reasons: string[] = []
  let score = 0
  if (r != null) {
    if (r < extreme) {
      reasons.push(`RSI(${rsiPeriod})=${r.toFixed(1)}，极度超卖`)
      score += 40
    } else if (r < oversold) {
      reasons.push(`RSI(${rsiPeriod})=${r.toFixed(1)}，超卖区`)
      score += 25
    }
  }

  // 反转确认：收盘上穿短均线 或者 今日收阳且高于昨日收盘
  if (maFast[i] != null && c > (maFast[i] as number)) {
    reasons.push(`收盘站上MA${confirmMa}，短线转强`)
    score += 20
  }
  if (c > prev) {
    reasons.push('收盘高于昨收')
    score += 10
  }

  // 如果仍在趋势均线下方，认为是“反转尝试”而非趋势
  if (maTrend[i] != null && c < (maTrend[i] as number)) {
    reasons.push(`仍在MA${trendMa}下方，定位为反转博弈`)
    score += 5
  } else if (maTrend[i] != null) {
    reasons.push(`站上MA${trendMa}，反转更稳`)
    score += 10
  }

  score = Math.min(100, score)
  const atrNow = a[i] ?? 0
  const entry = c
  const stop = atrNow ? c - atrStopMult * atrNow : c * 0.97
  const take = atrNow ? c + atrTakeMult * atrNow : c * 1.06

  let signal: StrategySignal['signal'] = 'none'
  if (r != null && r < oversold && score >= buyScore) signal = 'buy'
  else if (r != null && r < watchRsi && score >= watchScore) signal = 'watch'

  return {
    strategy: 'reversal_rsi',
    signal,
    reason: reasons,
    score,
    entry,
    stop,
    take,
  }
}

export function analyzeSwingPullback(bars: KlineBar[], p?: SwingParams): StrategySignal {
  const trendMa = p?.trendMa ?? 20
  const pullbackMa = p?.pullbackMa ?? 10
  const slopeLookback = p?.slopeLookback ?? 5
  const strongDist = p?.pullbackDistStrongPct ?? 1
  const weakDist = p?.pullbackDistWeakPct ?? 2
  const atrPeriod = p?.atrPeriod ?? 14
  const atrStopMult = p?.atrStopMult ?? 1.0
  const atrTakeMult = p?.atrTakeMult ?? 2.2
  const buyScore = p?.buyScore ?? 65
  const watchScore = p?.watchScore ?? 40

  const closes = bars.map((b) => b.close)
  const maTrend = sma(closes, trendMa)
  const maPull = sma(closes, pullbackMa)
  const a = atr(bars, atrPeriod)

  const i = bars.length - 1
  const c = closes[i]

  const reasons: string[] = []
  let score = 0

  // 趋势过滤：趋势均线 上行（近 N 天）
  const maTNow = maTrend[i]
  const maTPrev = maTrend[i - slopeLookback]
  if (maTNow != null && maTPrev != null && maTNow > maTPrev) {
    reasons.push(`MA${trendMa} 上行，趋势偏多`)
    score += 30
  } else {
    reasons.push(`MA${trendMa} 未明显上行，趋势不强`)
  }

  // 回踩：价格接近 pullback 均线
  const maPNow = maPull[i]
  if (maPNow != null) {
    const distPct = (Math.abs(c - maPNow) / maPNow) * 100
    if (distPct <= strongDist) {
      reasons.push(`回踩MA${pullbackMa}（偏差 ${distPct.toFixed(2)}%）`)
      score += 30
    } else if (distPct <= weakDist) {
      reasons.push(`接近MA${pullbackMa}（偏差 ${distPct.toFixed(2)}%）`)
      score += 15
    }
  }

  // 强势确认：收盘不破 pullback 均线
  if (maPNow != null && c >= maPNow) {
    reasons.push(`收盘不破MA${pullbackMa}，回踩有效`)
    score += 20
  }

  score = Math.min(100, score)
  const atrNow = a[i] ?? 0
  const entry = c
  const stop = atrNow ? c - atrStopMult * atrNow : c * 0.97
  const take = atrNow ? c + atrTakeMult * atrNow : c * 1.08

  let signal: StrategySignal['signal'] = 'none'
  if (score >= buyScore) signal = 'buy'
  else if (score >= watchScore) signal = 'watch'

  return {
    strategy: 'swing_pullback',
    signal,
    reason: reasons,
    score,
    entry,
    stop,
    take,
  }
}

export function runStrategy(strategy: StrategyId, bars: KlineBar[], params?: StrategyParams): StrategySignal {
  if (bars.length < 40) {
    return {
      strategy,
      signal: 'none',
      reason: ['K线数据不足（至少需要 40 根日K）'],
      score: 0,
    }
  }
  if (strategy === 'reversal_rsi') return analyzeReversalRSI(bars, params?.reversal)
  return analyzeSwingPullback(bars, params?.swing)
}

export const STRATEGY_LABEL: Record<StrategyId, string> = {
  reversal_rsi: '反转：RSI超卖反弹',
  swing_pullback: '波段：MA20趋势 + 回踩MA10',
}
