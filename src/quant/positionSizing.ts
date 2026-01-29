export type PositionSizingInput = {
  equity: number // 账户权益/可用资金
  riskPct: number // 单笔风险百分比，例如 1
  entry: number
  stop: number
  lotSize?: number // A股常用 100
}

export type PositionSizingResult = {
  riskAmount: number
  riskPerShare: number
  shares: number
  lots: number
  estCost: number
}

export function positionSizing(input: PositionSizingInput): PositionSizingResult | null {
  const equity = Number(input.equity) || 0
  const riskPct = Number(input.riskPct) || 0
  const entry = Number(input.entry) || 0
  const stop = Number(input.stop) || 0
  const lot = Math.max(1, Math.floor(Number(input.lotSize) || 100))

  if (equity <= 0 || riskPct <= 0 || entry <= 0 || stop <= 0) return null
  const riskPerShare = Math.max(0, entry - stop)
  if (riskPerShare <= 0) return null

  const riskAmount = (equity * riskPct) / 100
  const rawShares = Math.floor(riskAmount / riskPerShare)
  const shares = Math.floor(rawShares / lot) * lot
  const lots = shares / lot
  const estCost = shares * entry

  return { riskAmount, riskPerShare, shares, lots, estCost }
}
