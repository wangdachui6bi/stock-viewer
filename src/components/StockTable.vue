<template>
  <div class="table-wrap" v-loading="loading && !list.length">
    <el-empty
      v-if="!loading && !list.length"
      :description="
        compact
          ? '暂无自选，请搜索添加'
          : '暂无自选，请在上方搜索并添加（支持 A股/港股/美股/期货）'
      "
    />

    <!-- H5: compact card list -->
    <div v-else-if="compact && list.length" class="mobile-list">
      <div
        v-for="row in list"
        :key="row.code"
        class="mobile-row"
        :class="{ 'is-sell-out': row.isSellOut }"
        @click="emit('aiAnalyze', row)"
      >
        <div class="mobile-main">
          <div class="mobile-name-row">
            <span class="mobile-name">{{ row.name }}</span>
            <span class="mobile-code muted">{{ row.code }}</span>
          </div>
          <div
            v-if="row.heldAmount && row.heldAmount > 0 && !row.isSellOut"
            class="mobile-hold muted"
          >
            {{ row.heldAmount }}股
            <span :class="earnClass(row.earnings)">{{
              formatEarnings(row.earnings)
            }}</span>
          </div>
        </div>
        <div class="mobile-price-col">
          <span class="mobile-price" :class="percentClassFrom(row)">{{
            row.price ?? "—"
          }}</span>
          <span class="mobile-pct" :class="percentClassFrom(row)">{{
            formatPercentText(row)
          }}</span>
        </div>
        <div class="mobile-actions" @click.stop>
          <button class="m-act act-kline" @click="emit('kline', row)">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M9 2v6" />
              <path d="M15 2v6" />
              <path d="M9 16v6" />
              <path d="M15 16v6" />
              <rect x="7" y="8" width="4" height="8" rx="1" />
              <rect x="13" y="4" width="4" height="12" rx="1" />
            </svg>
          </button>
          <button class="m-act act-hold" @click="emit('setHolding', row)">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
              <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
              <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
            </svg>
          </button>
          <button class="m-act act-del" @click="emit('remove', row.code)">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Desktop: full table -->
    <div v-else-if="list.length" class="table-scroll">
      <el-table
        :data="list"
        stripe
        style="width: 100%"
        :row-class-name="rowClassName"
        class="stock-table"
        :header-cell-style="{ background: 'var(--bg-card)' }"
        highlight-current-row
        :default-sort="{ prop: 'percent', order: 'descending' }"
      >
        <el-table-column
          prop="name"
          label="名称"
          min-width="120"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <span>{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="code" label="代码" width="100" />
        <el-table-column label="市场" width="70">
          <template #default="{ row }">{{ marketLabel(row.type) }}</template>
        </el-table-column>
        <el-table-column
          label="最新价"
          width="85"
          align="right"
          sortable
          :sort-method="sortByPrice"
        >
          <template #default="{ row }">{{ row.price ?? "—" }}</template>
        </el-table-column>
        <el-table-column
          prop="percent"
          label="涨跌幅"
          width="85"
          align="right"
          sortable
          :sort-method="sortByPercent"
        >
          <template #default="{ row }">
            <span :class="percentClassFrom(row)">{{
              formatPercentText(row)
            }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="涨跌额"
          width="85"
          align="right"
          sortable
          :sort-method="sortByUpdown"
        >
          <template #default="{ row }">
            <span :class="percentClassFrom(row)">{{ row.updown ?? "—" }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="今开"
          width="80"
          align="right"
          sortable
          :sort-method="sortByOpen"
        >
          <template #default="{ row }">{{ row.open ?? "—" }}</template>
        </el-table-column>
        <el-table-column
          label="最高"
          width="80"
          align="right"
          sortable
          :sort-method="sortByHigh"
        >
          <template #default="{ row }">{{ row.high ?? "—" }}</template>
        </el-table-column>
        <el-table-column
          label="最低"
          width="80"
          align="right"
          sortable
          :sort-method="sortByLow"
        >
          <template #default="{ row }">{{ row.low ?? "—" }}</template>
        </el-table-column>
        <el-table-column
          label="成交量"
          width="90"
          align="right"
          show-overflow-tooltip
          sortable
          :sort-method="sortByVolume"
        >
          <template #default="{ row }">{{ row.volume ?? "—" }}</template>
        </el-table-column>
        <el-table-column
          label="持仓"
          min-width="110"
          align="right"
          sortable
          :sort-method="sortByHeldAmount"
        >
          <template #default="{ row }">
            <template
              v-if="
                row.heldAmount != null && row.heldAmount > 0 && !row.isSellOut
              "
            >
              {{ row.heldAmount }}股 / {{ row.heldPrice ?? "—" }}
            </template>
            <span v-else-if="row.isSellOut" class="muted">已清仓</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column
          label="盈亏"
          width="90"
          align="right"
          sortable
          :sort-method="sortByEarnings"
        >
          <template #default="{ row }">
            <span :class="earnClass(row.earnings)">{{
              formatEarnings(row.earnings)
            }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="今日盈亏"
          width="90"
          align="right"
          sortable
          :sort-method="sortByTodayEarnings"
        >
          <template #default="{ row }">
            <span :class="earnClass(row.todayEarnings)">{{
              formatEarnings(row.todayEarnings)
            }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="收益率"
          width="90"
          align="right"
          sortable
          :sort-method="sortByEarningPercent"
        >
          <template #default="{ row }">
            <span :class="earnClass(row.earningPercent)">{{
              formatEarnPct(row.earningPercent)
            }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="center" fixed="right">
          <template #default="{ row }">
            <div class="action-icons">
              <el-tooltip content="AI 分析" placement="top" :show-after="400">
                <el-button
                  link
                  size="small"
                  class="act-btn act-ai"
                  @click="emit('aiAnalyze', row)"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M12 2a4 4 0 0 1 4 4v1a1 1 0 0 0 1 1h1a4 4 0 0 1 0 8h-1a1 1 0 0 0-1 1v1a4 4 0 0 1-8 0v-1a1 1 0 0 0-1-1H6a4 4 0 0 1 0-8h1a1 1 0 0 0 1-1V6a4 4 0 0 1 4-4z"
                    />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                </el-button>
              </el-tooltip>
              <el-tooltip content="K线图" placement="top" :show-after="400">
                <el-button
                  link
                  size="small"
                  class="act-btn act-kline"
                  @click="emit('kline', row)"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M9 2v6" />
                    <path d="M15 2v6" />
                    <path d="M9 16v6" />
                    <path d="M15 16v6" />
                    <rect x="7" y="8" width="4" height="8" rx="1" />
                    <rect x="13" y="4" width="4" height="12" rx="1" />
                  </svg>
                </el-button>
              </el-tooltip>
              <el-tooltip content="设置持仓" placement="top" :show-after="400">
                <el-button
                  link
                  size="small"
                  class="act-btn act-hold"
                  @click="emit('setHolding', row)"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                    <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                  </svg>
                </el-button>
              </el-tooltip>
              <el-tooltip content="移除" placement="top" :show-after="400">
                <el-button
                  link
                  size="small"
                  class="act-btn act-del"
                  @click="emit('remove', row.code)"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </el-button>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { StockItem } from "@/types/stock";
import { marketLabel } from "@/types/stock";

defineProps<{
  list: StockItem[];
  loading?: boolean;
  compact?: boolean;
}>();
const emit = defineEmits<{
  remove: [code: string];
  setHolding: [row: StockItem];
  aiAnalyze: [row: StockItem];
  kline: [row: StockItem];
}>();

function rowClassName({ row }: { row: StockItem }) {
  return row.isSellOut ? "is-sell-out" : "";
}

function percentClassFrom(row: StockItem) {
  const raw = String(row.percent ?? "").trim();
  if (!raw || raw === "—") return "";
  if (raw.startsWith("+")) return "up";
  if (raw.startsWith("-")) return "down";
  const updown = toSignedNumber(row.updown);
  if (updown > 0) return "up";
  if (updown < 0) return "down";
  return "";
}

function earnClass(v: number | undefined) {
  if (v == null || v === 0) return "";
  return v > 0 ? "up" : "down";
}

function formatEarnings(v: number | undefined): string {
  if (v == null) return "—";
  if (v === 0) return "0";
  const s = v >= 0 ? "+" : "";
  return s + v.toFixed(2);
}

function formatEarnPct(v: number | undefined): string {
  if (v == null) return "—";
  if (v === 0) return "0%";
  const s = v >= 0 ? "+" : "";
  return s + v.toFixed(2) + "%";
}

function toNumber(v: string | number | undefined): number {
  if (v == null || v === "—") return 0;
  const s = String(v).replace("%", "").replace("+", "");
  const n = Number.parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

function toSignedNumber(v: string | number | undefined): number {
  if (v == null || v === "—") return 0;
  const s = String(v).replace("%", "").trim();
  const n = Number.parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

function formatPercentText(row: StockItem): string {
  const raw = String(row.percent ?? "").trim();
  if (!raw || raw === "—") return "—";
  if (raw.startsWith("+") || raw.startsWith("-")) return raw;
  const value = toSignedNumber(raw);
  if (!Number.isFinite(value)) return raw;
  const suffix = raw.includes("%") ? "%" : "";
  const abs = Math.abs(value).toFixed(2).replace(/\.00$/, "");
  const updown = toSignedNumber(row.updown);
  if (updown > 0) return `+${abs}${suffix}`;
  if (updown < 0) return `-${abs}${suffix}`;
  return value === 0 ? `0${suffix}` : raw;
}

function getSignedPercent(row: StockItem): number {
  const raw = String(row.percent ?? "").trim();
  if (!raw || raw === "—") return 0;
  if (raw.startsWith("+") || raw.startsWith("-")) return toSignedNumber(raw);
  const value = Math.abs(toSignedNumber(raw));
  const updown = toSignedNumber(row.updown);
  if (updown > 0) return value;
  if (updown < 0) return -value;
  return toSignedNumber(raw);
}

function toVolume(v: string | number | undefined): number {
  if (v == null || v === "—") return 0;
  const s = String(v).trim();
  const num = Number.parseFloat(s.replace(/[^\d.-]/g, ""));
  if (Number.isNaN(num)) return 0;
  if (s.endsWith("亿")) return num * 100000000;
  if (s.endsWith("万")) return num * 10000;
  return num;
}

const sortByPrice = (a: StockItem, b: StockItem) =>
  toNumber(a.price) - toNumber(b.price);
const sortByPercent = (a: StockItem, b: StockItem) =>
  getSignedPercent(a) - getSignedPercent(b);
const sortByUpdown = (a: StockItem, b: StockItem) =>
  toNumber(a.updown) - toNumber(b.updown);
const sortByOpen = (a: StockItem, b: StockItem) =>
  toNumber(a.open) - toNumber(b.open);
const sortByHigh = (a: StockItem, b: StockItem) =>
  toNumber(a.high) - toNumber(b.high);
const sortByLow = (a: StockItem, b: StockItem) =>
  toNumber(a.low) - toNumber(b.low);
const sortByVolume = (a: StockItem, b: StockItem) =>
  toVolume(a.volume) - toVolume(b.volume);
const sortByHeldAmount = (a: StockItem, b: StockItem) =>
  toNumber(a.heldAmount) - toNumber(b.heldAmount);
const sortByEarnings = (a: StockItem, b: StockItem) =>
  toNumber(a.earnings) - toNumber(b.earnings);
const sortByTodayEarnings = (a: StockItem, b: StockItem) =>
  toNumber(a.todayEarnings) - toNumber(b.todayEarnings);
const sortByEarningPercent = (a: StockItem, b: StockItem) =>
  toNumber(a.earningPercent) - toNumber(b.earningPercent);
</script>

<style scoped>
.table-wrap {
  min-height: 120px;
}
.table-scroll {
  overflow-x: auto;
  border-radius: var(--radius);
}
.stock-table :deep(.el-table) {
  --el-table-bg-color: var(--bg-card);
  --el-table-tr-bg-color: var(--bg-card);
  --el-table-header-bg-color: var(--bg-card);
  --el-table-row-hover-bg-color: rgba(99, 102, 241, 0.04);
  --el-table-border-color: var(--border);
  --el-table-text-color: var(--text);
  font-variant-numeric: tabular-nums;
}
.stock-table :deep(.el-table__header th) {
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-muted) !important;
}
.stock-table :deep(.el-table__row.is-sell-out) {
  opacity: 0.55;
}
.stock-table :deep(.el-table__row) {
  transition: all var(--transition-fast, 0.15s);
}
.stock-table :deep(.el-table__row:hover) {
  background: rgba(99, 102, 241, 0.04) !important;
}
.stock-table :deep(.up) {
  color: var(--up);
  font-weight: 600;
}
.stock-table :deep(.down) {
  color: var(--down);
  font-weight: 600;
}
.stock-table :deep(.muted) {
  color: var(--text-muted);
}
.table-wrap :deep(.el-loading-mask) {
  background-color: rgba(10, 10, 15, 0.75);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.action-icons {
  display: inline-flex;
  gap: 2px;
  align-items: center;
}
.act-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--text-muted);
  transition: all 0.15s;
}
.act-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}
.act-ai:hover {
  color: #10b981;
}
.act-kline:hover {
  color: #6366f1;
}
.act-hold:hover {
  color: #3b82f6;
}
.act-del:hover {
  color: #ef4444;
}

/* Mobile card list */
.mobile-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.mobile-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0.85rem;
  background: var(--bg-card);
  cursor: pointer;
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.mobile-row:active {
  background: var(--bg-card-hover);
}
.mobile-row.is-sell-out {
  opacity: 0.5;
}
.mobile-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mobile-name-row {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}
.mobile-name {
  font-weight: 600;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mobile-code {
  font-size: 0.75rem;
  flex-shrink: 0;
}
.mobile-hold {
  font-size: 0.75rem;
}
.mobile-price-col {
  flex-shrink: 0;
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  font-variant-numeric: tabular-nums;
  min-width: 70px;
}
.mobile-price {
  font-weight: 600;
  font-size: 0.95rem;
}
.mobile-pct {
  font-size: 0.8rem;
  font-weight: 500;
}
.mobile-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 0.25rem;
}
.m-act {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: 6px;
  cursor: pointer;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
  transition:
    background 0.15s,
    color 0.15s;
}
.m-act:active {
  background: rgba(255, 255, 255, 0.08);
}
.m-act.act-kline:active {
  color: #6366f1;
}
.m-act.act-hold:active {
  color: #3b82f6;
}
.m-act.act-del:active {
  color: #ef4444;
}
.up {
  color: var(--up);
  font-weight: 600;
}
.down {
  color: var(--down);
  font-weight: 600;
}
.muted {
  color: var(--text-muted);
}
</style>
