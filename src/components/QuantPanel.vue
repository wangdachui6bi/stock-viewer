<template>
  <div class="quant">
    <div class="quant-head">
      <el-form inline>
        <el-form-item label="策略">
          <el-select v-model="strategy" style="width: 220px">
            <el-option
              v-for="(label, key) in STRATEGY_LABEL"
              :key="key"
              :label="label"
              :value="key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="周期">
          <el-select v-model="period" style="width: 120px">
            <el-option label="日K" value="daily" />
            <el-option label="周K" value="weekly" />
            <el-option label="月K" value="monthly" />
          </el-select>
        </el-form-item>
        <el-form-item label="回测持有(天)">
          <el-tooltip content="回测里最多拿多久：比如 10 表示最多持有 10 根K线（约10天/10周/10月，取决于你选的周期）" placement="bottom">
            <el-input-number v-model="holdMaxBars" :min="3" :max="30" />
          </el-tooltip>
        </el-form-item>
        <el-form-item label="新手模式">
          <el-tooltip content="开启后只显示更容易理解的少量参数，并在每个参数旁边加解释。" placement="bottom">
            <el-switch v-model="beginnerMode" inline-prompt active-text="开" inactive-text="关" />
          </el-tooltip>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="runScan">
            扫描当前列表
          </el-button>
        </el-form-item>
        <el-form-item>
          <el-button @click="riskOpen = true">仓位/风控</el-button>
        </el-form-item>
        <el-form-item>
          <el-button :disabled="!journal.length" @click="exportJournal">导出日志CSV</el-button>
        </el-form-item>
        <el-form-item>
          <el-button type="danger" plain :disabled="!journal.length" @click="clearJournal">清空日志</el-button>
        </el-form-item>
        <el-form-item>
          <span class="muted" v-if="progress.total">{{ progress.done }}/{{ progress.total }}</span>
        </el-form-item>
      </el-form>

      <div class="params" v-if="strategy === 'reversal_rsi'">
        <span class="muted">抄底尝试的参数：</span>

        <template v-if="beginnerMode">
          <span class="muted help">
            跌得很厉害
            <el-tooltip content="越小越‘严格’，只有跌得特别多才会提示；越大越‘敏感’，更容易提示。建议：30 左右。" placement="bottom">
              <el-icon><QuestionFilled /></el-icon>
            </el-tooltip>
          </span>
          <el-input-number v-model="reversalParams.oversold" :min="10" :max="50" :step="1" />

          <span class="muted help">
            止损距离（按波动）
            <el-tooltip content="越大：止损更宽松（不容易被震出去）；越小：止损更紧（更容易止损）。建议：1.0~1.5。" placement="bottom">
              <el-icon><QuestionFilled /></el-icon>
            </el-tooltip>
          </span>
          <el-input-number v-model="reversalParams.atrStopMult" :min="0.5" :max="5" :step="0.1" />

          <span class="muted help">
            止盈距离（按波动）
            <el-tooltip content="越大：目标更远（可能更难到）；越小：更容易到但收益可能偏小。建议：1.8~2.5。" placement="bottom">
              <el-icon><QuestionFilled /></el-icon>
            </el-tooltip>
          </span>
          <el-input-number v-model="reversalParams.atrTakeMult" :min="0.5" :max="8" :step="0.1" />
        </template>

        <template v-else>
          <span class="muted">“跌得很厉害”阈值</span>
          <el-input-number v-model="reversalParams.oversold" :min="10" :max="50" :step="1" />
          <span class="muted">“极端下跌”阈值</span>
          <el-input-number v-model="reversalParams.extremeOversold" :min="5" :max="40" :step="1" />
          <span class="muted">止损距离（按波动）</span>
          <el-input-number v-model="reversalParams.atrStopMult" :min="0.5" :max="5" :step="0.1" />
          <span class="muted">止盈距离（按波动）</span>
          <el-input-number v-model="reversalParams.atrTakeMult" :min="0.5" :max="8" :step="0.1" />
        </template>
      </div>

      <div class="params" v-else>
        <span class="muted">波段策略的参数：</span>

        <template v-if="beginnerMode">
          <span class="muted help">
            看大方向（天数）
            <el-tooltip content="越大：更看重长期趋势（更稳但更慢）；越小：更看重短期（更灵敏但更容易误判）。建议：20。" placement="bottom">
              <el-icon><QuestionFilled /></el-icon>
            </el-tooltip>
          </span>
          <el-input-number v-model="swingParams.trendMa" :min="5" :max="60" :step="1" />

          <span class="muted help">
            看回踩（天数）
            <el-tooltip content="越小：回踩更贴近价格（更灵敏）；越大：回踩更宽（更稳）。建议：10。" placement="bottom">
              <el-icon><QuestionFilled /></el-icon>
            </el-tooltip>
          </span>
          <el-input-number v-model="swingParams.pullbackMa" :min="3" :max="40" :step="1" />

          <span class="muted help">
            “接近合理位置”距离%
            <el-tooltip content="价格离回踩均线的距离。越小越苛刻（必须贴得更近）；越大更宽松。建议：1%~2%。" placement="bottom">
              <el-icon><QuestionFilled /></el-icon>
            </el-tooltip>
          </span>
          <el-input-number v-model="swingParams.pullbackDistWeakPct" :min="0.2" :max="8" :step="0.1" />
        </template>

        <template v-else>
          <span class="muted">看大方向（天数）</span>
          <el-input-number v-model="swingParams.trendMa" :min="5" :max="60" :step="1" />
          <span class="muted">看回踩（天数）</span>
          <el-input-number v-model="swingParams.pullbackMa" :min="3" :max="40" :step="1" />
          <span class="muted">“很接近”距离%</span>
          <el-input-number v-model="swingParams.pullbackDistStrongPct" :min="0.2" :max="5" :step="0.1" />
          <span class="muted">“接近”距离%</span>
          <el-input-number v-model="swingParams.pullbackDistWeakPct" :min="0.2" :max="8" :step="0.1" />
        </template>
      </div>

      <div class="muted small">
        说明：这里只是用历史价格做“规则筛选”，帮你更快挑出值得关注的票；不构成投资建议。
      </div>
    </div>

    <el-empty v-if="!loading && !rows.length" description="暂无结果，点击“扫描当前列表”" />

    <el-table v-else :data="rows" size="small" stripe>
      <el-table-column label="股票" min-width="150">
        <template #default="{ row }">
          <div class="name">
            <b>{{ row.name }}</b>
            <span class="muted">({{ row.code }})</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="分类" width="70">
        <template #default="{ row }">
          <span :class="row.signal === 'buy' ? 'tag-buy' : row.signal === 'watch' ? 'tag-watch' : 'muted'">
            {{ row.signal === 'buy' ? '买' : row.signal === 'watch' ? '观察' : '—' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column
        label="分数"
        width="70"
        align="right"
        sortable
        :sort-method="(a: any, b: any) => a.score - b.score"
      >
        <template #default="{ row }">{{ row.score }}</template>
      </el-table-column>
      <el-table-column label="计划" min-width="220">
        <template #default="{ row }">
          <div class="plan" v-if="row.entry">
            <div><b>入：</b>{{ fmt(row.entry) }}</div>
            <div><b>止：</b>{{ fmt(row.stop) }} / <b>盈：</b>{{ fmt(row.take) }}</div>
          </div>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="理由" min-width="260">
        <template #default="{ row }">
          <ul class="reasons">
            <li v-for="(x,i) in row.reason" :key="i">{{ x }}</li>
          </ul>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right" align="center">
        <template #default="{ row }">
          <el-button size="small" @click="copyPlan(row)">复制计划</el-button>
          <el-button size="small" type="primary" plain @click="openBacktest(row)">回测</el-button>
          <el-button size="small" type="success" plain @click="saveToJournal(row)">记日志</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-divider />
    <div class="journal">
      <div class="journal-head">
        <b>交易日志（计划）</b>
        <span class="muted">{{ journal.length }} 条</span>
      </div>
      <el-empty v-if="!journal.length" description="还没有记录" />
      <el-table v-else :data="journal" size="small" stripe height="220">
        <el-table-column label="时间" width="150">
          <template #default="{ row }">{{ new Date(row.ts).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="股票" min-width="160">
          <template #default="{ row }">
            <b>{{ row.name }}</b> <span class="muted">({{ row.code }})</span>
          </template>
        </el-table-column>
        <el-table-column label="信号" width="70">
          <template #default="{ row }">
            <span :class="row.signal === 'buy' ? 'tag-buy' : row.signal === 'watch' ? 'tag-watch' : 'muted'">
              {{ row.signal === 'buy' ? '买' : row.signal === 'watch' ? '观察' : '—' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="入/止/盈" min-width="220">
          <template #default="{ row }">
            <span v-if="row.entry">{{ fmt(row.entry) }} / {{ fmt(row.stop) }} / {{ fmt(row.take) }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="danger" size="small" @click="removeJournal(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="riskOpen" title="仓位 / 风控计算器" width="640px" destroy-on-close>
      <el-form label-position="top">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px">
          <el-form-item label="账户权益/可用资金">
            <el-input-number v-model="riskForm.equity" :min="0" :step="1000" style="width: 100%" />
          </el-form-item>
          <el-form-item label="单笔风险 %">
            <el-input-number v-model="riskForm.riskPct" :min="0.1" :max="5" :step="0.1" style="width: 100%" />
          </el-form-item>
          <el-form-item label="入场价">
            <el-input-number v-model="riskForm.entry" :min="0" :step="0.01" :precision="2" style="width: 100%" />
          </el-form-item>
          <el-form-item label="止损价">
            <el-input-number v-model="riskForm.stop" :min="0" :step="0.01" :precision="2" style="width: 100%" />
          </el-form-item>
          <el-form-item label="一手股数（A股通常 100）">
            <el-input-number v-model="riskForm.lotSize" :min="1" :step="1" style="width: 100%" />
          </el-form-item>
        </div>
      </el-form>

      <el-divider />
      <el-empty v-if="!riskResult" description="请输入有效的入场价/止损价（且入场价 > 止损价）" />
      <div v-else class="bt-metrics" style="grid-template-columns: repeat(4, 1fr)">
        <div class="bt-card"><div class="muted">单笔最大亏损</div><b>{{ riskResult.riskAmount.toFixed(2) }}</b></div>
        <div class="bt-card"><div class="muted">每股风险</div><b>{{ riskResult.riskPerShare.toFixed(2) }}</b></div>
        <div class="bt-card"><div class="muted">建议股数</div><b>{{ riskResult.shares }}</b></div>
        <div class="bt-card"><div class="muted">预估占用资金</div><b>{{ riskResult.estCost.toFixed(2) }}</b></div>
      </div>

      <template #footer>
        <el-button @click="riskOpen=false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="btOpen" :title="`回测 · ${btTarget?.name ?? ''} (${btTarget?.code ?? ''})`" width="760px" destroy-on-close>
      <el-skeleton v-if="btLoading" :rows="10" animated />
      <template v-else>
        <el-empty v-if="!btResult" description="暂无结果" />
        <div v-else>
          <div class="bt-metrics">
            <div class="bt-card"><div class="muted">胜率</div><b>{{ btResult.winRate.toFixed(1) }}%</b></div>
            <div class="bt-card"><div class="muted">平均单笔</div><b>{{ btResult.avgPnlPct.toFixed(2) }}%</b></div>
            <div class="bt-card"><div class="muted">累计收益</div><b>{{ btResult.totalPnlPct.toFixed(2) }}%</b></div>
            <div class="bt-card"><div class="muted">最大回撤</div><b>{{ btResult.maxDrawdownPct.toFixed(2) }}%</b></div>
          </div>
          <el-divider />
          <el-table :data="btResult.trades" size="small" stripe height="360">
            <el-table-column prop="entryDate" label="买入" width="110" />
            <el-table-column prop="entryPrice" label="买入价" width="90" align="right" />
            <el-table-column prop="exitDate" label="卖出" width="110" />
            <el-table-column prop="exitPrice" label="卖出价" width="90" align="right" />
            <el-table-column prop="pnlPct" label="收益%" width="90" align="right">
              <template #default="{ row }">
                <span :class="row.pnlPct > 0 ? 'down' : row.pnlPct < 0 ? 'up' : ''">{{ row.pnlPct.toFixed(2) }}%</span>
              </template>
            </el-table-column>
            <el-table-column prop="reason" label="退出原因" />
          </el-table>
        </div>
      </template>
      <template #footer>
        <el-button @click="btOpen=false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import type { StockItem } from '@/types/stock'
import type { KlinePeriod } from '@/types/kline'
import { fetchKline } from '@/api/kline'
import { STRATEGY_LABEL, type StrategyId, runStrategy, type StrategyParams } from '@/quant/strategies'
import { backtest, type BacktestResult } from '@/quant/backtest'
import { positionSizing } from '@/quant/positionSizing'
import { downloadText, toCsv } from '@/utils/csv'
import { uid } from '@/utils/id'

type Row = {
  code: string
  name: string
  signal: 'buy' | 'watch' | 'none'
  score: number
  reason: string[]
  entry?: number
  stop?: number
  take?: number
}

type JournalItem = {
  id: string
  ts: number
  code: string
  name: string
  period: KlinePeriod
  strategy: StrategyId
  signal: Row['signal']
  score: number
  entry?: number
  stop?: number
  take?: number
  reason: string[]
}

const props = defineProps<{ candidates: StockItem[] }>()

const aCandidates = computed(() =>
  props.candidates.filter((s) => (s.type || '').toLowerCase() === 'a' && /^((sh|sz|bj)\d{6})$/i.test(s.code))
)

const strategy = ref<StrategyId>('reversal_rsi')
const period = ref<KlinePeriod>('daily')
const holdMaxBars = ref(10)

// 新手模式：减少术语 + 给出解释
const STORAGE_BEGINNER_KEY = 'vue-stock-viewer-quantBeginnerMode'
const beginnerMode = ref(true)
try {
  const raw = localStorage.getItem(STORAGE_BEGINNER_KEY)
  beginnerMode.value = raw ? JSON.parse(raw) : true
} catch {
  beginnerMode.value = true
}
watch(beginnerMode, (v) => {
  localStorage.setItem(STORAGE_BEGINNER_KEY, JSON.stringify(!!v))
})

// 策略参数（可调）
const reversalParams = ref({
  oversold: 30,
  extremeOversold: 25,
  confirmMa: 5,
  trendMa: 20,
  atrStopMult: 1.2,
  atrTakeMult: 2.0,
})
const swingParams = ref({
  trendMa: 20,
  pullbackMa: 10,
  slopeLookback: 5,
  pullbackDistStrongPct: 1,
  pullbackDistWeakPct: 2,
  atrStopMult: 1.0,
  atrTakeMult: 2.2,
})
const params = computed<StrategyParams>(() => ({
  reversal: reversalParams.value,
  swing: swingParams.value,
}))

const loading = ref(false)
const rows = ref<Row[]>([])
const progress = ref({ done: 0, total: 0 })

// 交易日志（本地）
const STORAGE_JOURNAL_KEY = 'vue-stock-viewer-quantJournal'
const journal = ref<JournalItem[]>([])
try {
  const raw = localStorage.getItem(STORAGE_JOURNAL_KEY)
  journal.value = raw ? (JSON.parse(raw) as JournalItem[]) : []
} catch {
  journal.value = []
}

function fmt(v?: number) {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(2)
}

async function runScan() {
  const list = aCandidates.value
  if (!list.length) {
    ElMessage.warning('当前列表没有 A 股标的')
    return
  }

  loading.value = true
  rows.value = []
  progress.value = { done: 0, total: list.length }

  // 并发限制：避免打爆免费接口
  const concurrency = 3
  let idx = 0

  const worker = async () => {
    while (idx < list.length) {
      const cur = list[idx++]
      try {
        const bars = await fetchKline({ code: cur.code, period: period.value, count: 260 })
        const sig = runStrategy(strategy.value, bars, params.value)
        rows.value.push({
          code: cur.code,
          name: cur.name,
          signal: sig.signal,
          score: sig.score,
          reason: sig.reason,
          entry: sig.entry,
          stop: sig.stop,
          take: sig.take,
        })
      } catch {
        // ignore per-stock
      } finally {
        progress.value.done += 1
      }
    }
  }

  await Promise.all(new Array(concurrency).fill(0).map(() => worker()))

  rows.value.sort((a, b) => {
    const rank = (x: Row) => (x.signal === 'buy' ? 2 : x.signal === 'watch' ? 1 : 0)
    const r = rank(b) - rank(a)
    if (r !== 0) return r
    return b.score - a.score
  })

  loading.value = false
}

async function copyPlan(row: Row) {
  const text = [
    `【量化计划】${row.name} (${row.code})`,
    `策略：${STRATEGY_LABEL[strategy.value]}`,
    `信号：${row.signal === 'buy' ? '买' : row.signal === 'watch' ? '观察' : '—'} / 分数：${row.score}`,
    row.entry ? `入场参考：${fmt(row.entry)}` : '',
    row.stop ? `止损参考：${fmt(row.stop)}` : '',
    row.take ? `止盈参考：${fmt(row.take)}` : '',
    `理由：${row.reason.join('；')}`,
    '提示：不构成投资建议',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.warning('复制失败（浏览器权限限制）')
  }
}

// 仓位/风控
const riskOpen = ref(false)
const riskForm = ref({ equity: 100000, riskPct: 1, entry: 0, stop: 0, lotSize: 100 })
const riskResult = computed(() => positionSizing(riskForm.value))

const btOpen = ref(false)
const btLoading = ref(false)
const btTarget = ref<Row | null>(null)
const btResult = ref<BacktestResult | null>(null)

function persistJournal() {
  localStorage.setItem(STORAGE_JOURNAL_KEY, JSON.stringify(journal.value))
}

function saveToJournal(row: Row) {
  const item: JournalItem = {
    id: uid('q'),
    ts: Date.now(),
    code: row.code,
    name: row.name,
    period: period.value,
    strategy: strategy.value,
    signal: row.signal,
    score: row.score,
    entry: row.entry,
    stop: row.stop,
    take: row.take,
    reason: row.reason,
  }
  journal.value = [item, ...journal.value].slice(0, 500)
  persistJournal()
  ElMessage.success('已记录到日志')
}

function removeJournal(id: string) {
  journal.value = journal.value.filter((x) => x.id !== id)
  persistJournal()
}

function clearJournal() {
  if (!confirm('确定清空量化日志吗？')) return
  journal.value = []
  persistJournal()
}

function exportJournal() {
  if (!journal.value.length) return
  const rows = journal.value.map((x) => ({
    time: new Date(x.ts).toLocaleString(),
    code: x.code,
    name: x.name,
    period: x.period,
    strategy: STRATEGY_LABEL[x.strategy],
    signal: x.signal,
    score: x.score,
    entry: x.entry ?? '',
    stop: x.stop ?? '',
    take: x.take ?? '',
    reason: x.reason.join('；'),
  }))
  const csv = toCsv(rows, [
    { key: 'time', label: '时间' },
    { key: 'code', label: '代码' },
    { key: 'name', label: '名称' },
    { key: 'period', label: '周期' },
    { key: 'strategy', label: '策略' },
    { key: 'signal', label: '信号' },
    { key: 'score', label: '分数' },
    { key: 'entry', label: '入场' },
    { key: 'stop', label: '止损' },
    { key: 'take', label: '止盈' },
    { key: 'reason', label: '理由' },
  ])
  downloadText(`quant-journal-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8')
}

async function openBacktest(row: Row) {
  btOpen.value = true
  btLoading.value = true
  btTarget.value = row
  btResult.value = null
  try {
    const bars = await fetchKline({ code: row.code, period: period.value, count: 360 })
    btResult.value = backtest(strategy.value, bars, { holdMaxBars: holdMaxBars.value, params: params.value })
  } finally {
    btLoading.value = false
  }
}
</script>

<style scoped>
.quant-head {
  margin-bottom: 10px;
}
.params {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 8px 0;
}
.help {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.help :deep(.el-icon) {
  font-size: 14px;
  opacity: 0.85;
  cursor: help;
}
.journal {
  margin-top: 8px;
}
.journal-head {
  display: flex;
  gap: 10px;
  align-items: baseline;
  margin: 6px 0 10px;
}
.muted {
  color: var(--text-muted);
}
.small {
  font-size: 12px;
}
.name {
  display: flex;
  gap: 6px;
  align-items: baseline;
}
.reasons {
  margin: 0;
  padding-left: 18px;
}
.plan {
  line-height: 1.4;
}
.tag-buy {
  color: var(--down);
  font-weight: 700;
}
.tag-watch {
  color: #d6a100;
  font-weight: 700;
}
.up {
  color: var(--up);
  font-weight: 600;
}
.down {
  color: var(--down);
  font-weight: 600;
}
.bt-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.bt-card {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
}
</style>
