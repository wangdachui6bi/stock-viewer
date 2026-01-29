import type { KlineBar } from '@/types/kline'
import type { StrategyId, StrategyParams } from './strategies'
import { runStrategy } from './strategies'

export type BacktestTrade = {
  entryDate: string
  entryPrice: number
  exitDate: string
  exitPrice: number
  holdBars: number
  pnlPct: number
  reason: string
}

export type BacktestResult = {
  trades: BacktestTrade[]
  winRate: number
  avgPnlPct: number
  totalPnlPct: number
  maxDrawdownPct: number
}

function maxDrawdown(equity: number[]): number {
  let peak = -Infinity
  let mdd = 0
  for (const v of equity) {
    peak = Math.max(peak, v)
    if (peak > 0) mdd = Math.min(mdd, (v - peak) / peak)
  }
  return Math.abs(mdd) * 100
}

/**
 * 极简回测：
 * - 每天用截至当日的 bars 计算信号
 * - 出现 buy 信号：次日开盘买入
 * - 止损/止盈：使用信号给的 stop/take（以当日收盘为基准的动态价），实际用之后 K 线的 low/high 触发
 * - 最大持有天数：holdMaxBars
 */
export function backtest(
  strategy: StrategyId,
  bars: KlineBar[],
  opts?: { holdMaxBars?: number; params?: StrategyParams }
): BacktestResult {
  const holdMax = Math.max(3, opts?.holdMaxBars ?? 10)
  const trades: BacktestTrade[] = []

  let i = 50
  while (i < bars.length - 2) {
    const sig = runStrategy(strategy, bars.slice(0, i + 1), opts?.params)
    if (sig.signal !== 'buy' || !sig.entry || !sig.stop || !sig.take) {
      i += 1
      continue
    }

    const entryIndex = i + 1
    const entryBar = bars[entryIndex]
    const entryPrice = entryBar.open
    let exitIndex = entryIndex
    let exitPrice = entryBar.close
    let exitDate = entryBar.date
    let reason = '到期退出'

    const stop = sig.stop
    const take = sig.take

    for (let j = entryIndex; j < Math.min(bars.length, entryIndex + holdMax); j++) {
      const b = bars[j]
      // 先判断止损（保守）
      if (b.low <= stop) {
        exitIndex = j
        exitPrice = stop
        exitDate = b.date
        reason = '止损'
        break
      }
      if (b.high >= take) {
        exitIndex = j
        exitPrice = take
        exitDate = b.date
        reason = '止盈'
        break
      }
      exitIndex = j
      exitPrice = b.close
      exitDate = b.date
    }

    const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100
    trades.push({
      entryDate: entryBar.date,
      entryPrice,
      exitDate,
      exitPrice,
      holdBars: exitIndex - entryIndex + 1,
      pnlPct,
      reason,
    })

    i = exitIndex + 2
  }

  const wins = trades.filter((t) => t.pnlPct > 0).length
  const winRate = trades.length ? (wins / trades.length) * 100 : 0
  const avgPnlPct = trades.length ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length : 0
  const equity: number[] = [1]
  for (const t of trades) {
    const prev = equity[equity.length - 1]
    equity.push(prev * (1 + t.pnlPct / 100))
  }
  const totalPnlPct = (equity[equity.length - 1] - 1) * 100
  const maxDrawdownPct = maxDrawdown(equity)

  return {
    trades,
    winRate,
    avgPnlPct,
    totalPnlPct,
    maxDrawdownPct,
  }
}
