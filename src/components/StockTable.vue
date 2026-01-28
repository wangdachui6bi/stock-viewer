<template>
  <div class="table-wrap" v-loading="loading && !list.length">
    <el-empty
      v-if="!loading && !list.length"
      description="暂无自选，请在上方搜索并添加（支持 A股/港股/美股/期货）"
    />
    <div v-else-if="list.length" class="table-scroll">
      <el-table
        :data="list"
        stripe
        style="width: 100%"
        :row-class-name="rowClassName"
        class="stock-table"
        :header-cell-style="{ background: 'var(--bg-card)' }"
        highlight-current-row
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
          label="涨跌幅"
          width="85"
          align="right"
          sortable
          :sort-method="sortByPercent"
        >
          <template #default="{ row }">
            <span :class="percentClass(row.percent)">{{
              row.percent ?? "—"
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
            <span :class="percentClass(row.percent)">{{
              row.updown ?? "—"
            }}</span>
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
        <el-table-column label="操作" width="120" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              size="small"
              title="设置持仓"
              @click="emit('setHolding', row)"
            >
              持仓
            </el-button>
            <el-button
              type="danger"
              link
              size="small"
              title="移除"
              @click="emit('remove', row.code)"
            >
              ×
            </el-button>
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
}>();
const emit = defineEmits<{
  remove: [code: string];
  setHolding: [row: StockItem];
}>();

function rowClassName({ row }: { row: StockItem }) {
  return row.isSellOut ? "is-sell-out" : "";
}

function percentClass(p: string) {
  if (!p || p === "—") return "";
  return p.startsWith("+") ? "down" : "up";
}

function earnClass(v: number | undefined) {
  if (v == null || v === 0) return "";
  return v > 0 ? "down" : "up";
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
  toNumber(a.percent) - toNumber(b.percent);
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
  --el-table-row-hover-bg-color: rgba(255, 255, 255, 0.04);
  --el-table-border-color: var(--border);
  --el-table-text-color: var(--text);
}
.stock-table :deep(.el-table__row.is-sell-out) {
  opacity: 0.7;
}
.stock-table :deep(.el-table__row) {
  transition: background-color 0.2s ease;
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
  background-color: rgba(15, 15, 18, 0.7);
}
</style>
