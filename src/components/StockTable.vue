<template>
  <div class="table-wrap">
    <div v-if="loading && !list.length" class="loading">加载中…</div>
    <div v-else-if="!list.length" class="empty">
      暂无自选，请在上方搜索并添加（支持 A股/港股/美股/期货）
    </div>
    <div v-else class="table-scroll">
      <table class="stock-table">
        <thead>
          <tr>
            <th class="name-col">名称</th>
            <th class="code-col">代码</th>
            <th class="market-col">市场</th>
            <th>最新价</th>
            <th>涨跌幅</th>
            <th>涨跌额</th>
            <th>今开</th>
            <th>最高</th>
            <th>最低</th>
            <th class="vol-col">成交量</th>
            <th class="hold-col">持仓</th>
            <th class="earn-col">盈亏</th>
            <th class="earn-pct-col">收益率</th>
            <th class="th-action">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in list"
            :key="row.code"
            class="row"
            :class="{ 'is-sell-out': row.isSellOut }"
          >
            <td class="name-col">{{ row.name }}</td>
            <td class="code-col">{{ row.code }}</td>
            <td class="market-col">{{ marketLabel(row.type) }}</td>
            <td class="price">{{ row.price ?? "—" }}</td>
            <td :class="['percent', percentClass(row.percent)]">
              {{ row.percent || "—" }}
            </td>
            <td :class="['updown', percentClass(row.percent)]">
              {{ row.updown ?? "—" }}
            </td>
            <td class="num">{{ row.open ?? "—" }}</td>
            <td class="num">{{ row.high ?? "—" }}</td>
            <td class="num">{{ row.low ?? "—" }}</td>
            <td class="vol-col">{{ row.volume ?? "—" }}</td>
            <td class="hold-col">
              <template v-if="row.heldAmount != null && row.heldAmount > 0 && !row.isSellOut">
                {{ row.heldAmount }}股 / {{ row.heldPrice ?? "—" }}
              </template>
              <span v-else-if="row.isSellOut" class="muted">已清仓</span>
              <span v-else class="muted">—</span>
            </td>
            <td :class="['earn-col', earnClass(row.earnings)]">
              {{ formatEarnings(row.earnings) }}
            </td>
            <td :class="['earn-pct-col', earnClass(row.earningPercent)]">
              {{ formatEarnPct(row.earningPercent) }}
            </td>
            <td class="action-col">
              <button
                class="btn-cell btn-holding"
                title="设置持仓"
                @click="emit('setHolding', row)"
              >
                持仓
              </button>
              <button
                class="btn-cell btn-remove"
                title="移除"
                @click="emit('remove', row.code)"
              >
                ×
              </button>
            </td>
          </tr>
        </tbody>
      </table>
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

function percentClass(p: string) {
  if (!p || p === "—") return "";
  return p.startsWith("+") ? "up" : "down";
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
</script>

<style scoped>
.table-wrap {
  min-height: 120px;
}
.loading,
.empty {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}
.table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.stock-table {
  width: 100%;
  min-width: 960px;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.stock-table th,
.stock-table td {
  padding: 0.5rem 0.65rem;
  text-align: right;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.stock-table th {
  color: var(--text-muted);
  font-weight: 500;
  position: sticky;
  top: 0;
  background: var(--bg-card);
  z-index: 1;
}
.stock-table .name-col,
.stock-table .code-col {
  text-align: left;
}
.stock-table .name-col {
  font-weight: 500;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stock-table .market-col {
  color: var(--text-muted);
  font-size: 0.8rem;
}
.stock-table .percent,
.stock-table .updown,
.stock-table .earn-col,
.stock-table .earn-pct-col {
  font-weight: 600;
}
.stock-table .vol-col {
  color: var(--text-muted);
  font-size: 0.8rem;
}
.stock-table .hold-col {
  font-size: 0.8rem;
  color: var(--text-muted);
}
.stock-table .muted {
  color: var(--text-muted);
}
.th-action {
  width: 90px;
}
.action-col {
  text-align: center;
}
.btn-cell {
  padding: 0.25rem 0.4rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  margin-right: 2px;
  background: transparent;
  color: var(--text-muted);
}
.btn-cell:hover {
  background: var(--border);
}
.btn-holding:hover {
  color: var(--accent);
}
.btn-remove {
  font-size: 1rem;
  line-height: 1;
}
.btn-remove:hover {
  color: var(--down);
}
.row:hover {
  background: rgba(255, 255, 255, 0.03);
}
.row.is-sell-out {
  opacity: 0.7;
}
</style>
