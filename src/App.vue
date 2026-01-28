<template>
  <div class="app">
    <header class="header">
      <div class="header-inner">
        <h1 class="title">股票行情</h1>
        <p class="subtitle">
          基于 leek-fund 数据 · A股/港股/美股/期货 · PC 端交易助手
        </p>
        <div class="quick-links">
          <a
            href="https://data.eastmoney.com/hsgt/index.html"
            target="_blank"
            rel="noopener"
            >北向资金</a
          >
          <a
            href="https://data.eastmoney.com/zjlx/detail.html"
            target="_blank"
            rel="noopener"
            >主力资金</a
          >
        </div>
      </div>
    </header>
    <main class="main">
      <StockSearch
        v-model:keyword="searchKeyword"
        :loading="searchLoading"
        :suggestions="searchSuggestions"
        @search="onSearch"
        @select="onSelectSearchItem"
      />
      <section class="watchlist-section">
        <div class="section-head">
          <div class="section-title-row">
            <h2>自选列表</h2>
            <span
              v-if="lastUpdateTime && displayList.length"
              class="last-update"
            >
              更新于 {{ formatTime(lastUpdateTime) }}
            </span>
          </div>
          <div class="actions">
            <el-tooltip :content="`开启后每 ${realtimeInterval} 秒自动刷新行情`" placement="bottom">
              <div class="realtime-wrap">
                <span class="realtime-label">实时</span>
                <el-switch
                  v-model="realtimeMode"
                  size="default"
                  inline-prompt
                  :active-text="`${realtimeInterval}s`"
                  inactive-text="关"
                />
              </div>
            </el-tooltip>
            <el-button
              :type="sortType !== 0 ? 'primary' : 'default'"
              plain
              @click="cycleSort"
            >
              {{ SORT_LABELS[sortType] }}
            </el-button>
            <el-button :loading="loading" @click="refreshList">
              {{ loading ? "刷新中…" : "刷新" }}
            </el-button>
          </div>
        </div>
        <StockTable
          :list="displayList"
          :loading="loading"
          @remove="removeCode"
          @set-holding="openHoldingModal"
        />
      </section>
    </main>
    <el-dialog
      v-model="holdingModal"
      :title="`持仓设置 · ${holdingStock?.name ?? ''} (${holdingStock?.code ?? ''})`"
      width="420px"
      destroy-on-close
      @close="closeHoldingModal"
    >
      <el-form label-position="top">
        <el-form-item label="持仓股数">
          <el-input-number
            v-model="holdingForm.amount"
            :min="0"
            :step="1"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="持仓成本价">
          <el-input-number
            v-model="holdingForm.unitPrice"
            :min="0"
            :step="0.01"
            :precision="2"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="今日成本价">
          <el-input-number
            v-model="holdingForm.todayUnitPrice"
            :min="0"
            :step="0.01"
            :precision="2"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="holdingForm.isSellOut">已清仓</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeHoldingModal">取消</el-button>
        <el-button type="primary" @click="saveHolding">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from "vue";
let searchTimer: ReturnType<typeof setTimeout> | null = null;
import StockSearch from "./components/StockSearch.vue";
import StockTable from "./components/StockTable.vue";
import { fetchStockList, searchStock, searchItemToCode } from "./api/stock";
import type {
  StockItem,
  SearchItem,
  StockPriceItem,
  SortType,
} from "./types/stock";
import { SORT_LABELS } from "./types/stock";

const STORAGE_KEY = "vue-stock-viewer-codes";
const STORAGE_PRICE_KEY = "vue-stock-viewer-stockPrice";

const searchKeyword = ref("");
const searchLoading = ref(false);
const searchSuggestions = ref<SearchItem[]>([]);
const stockList = ref<StockItem[]>([]);
const codes = ref<string[]>([]);
const loading = ref(false);
const sortType = ref<SortType>(0);
const stockPrice = ref<Record<string, StockPriceItem>>({});
const holdingModal = ref(false);
const holdingStock = ref<StockItem | null>(null);
const holdingForm = ref({
  amount: 0,
  unitPrice: 0,
  todayUnitPrice: 0,
  isSellOut: false,
});
const realtimeMode = ref(false);
const realtimeInterval = ref(1.5); // 单位：秒
let realtimeTimer: ReturnType<typeof setInterval> | null = null;
const lastUpdateTime = ref<number | null>(null);

function loadCodes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    codes.value = raw ? JSON.parse(raw) : [];
  } catch {
    codes.value = [];
  }
}

function loadStockPrice() {
  try {
    const raw = localStorage.getItem(STORAGE_PRICE_KEY);
    stockPrice.value = raw ? JSON.parse(raw) : {};
  } catch {
    stockPrice.value = {};
  }
}

function saveCodes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(codes.value));
}

function saveStockPrice() {
  localStorage.setItem(STORAGE_PRICE_KEY, JSON.stringify(stockPrice.value));
}

function mergeHeldAndEarnings(list: StockItem[]): StockItem[] {
  const priceMap = stockPrice.value;
  return list.map((row) => {
    const cfg = priceMap[row.code];
    const amount = cfg?.amount ?? 0;
    const unitPrice = cfg?.unitPrice ?? 0;
    const todayUnitPrice = cfg?.todayUnitPrice ?? 0;
    const isSellOut = cfg?.isSellOut ?? false;
    const priceNum = parseFloat(row.price || "0") || 0;
    let earnings = 0;
    let earningPercent: number | undefined;
    if (amount > 0 && unitPrice > 0 && !isSellOut) {
      const cost = amount * unitPrice;
      const current = amount * priceNum;
      earnings = current - cost;
      earningPercent = cost ? (earnings / cost) * 100 : 0;
    }
    return {
      ...row,
      heldAmount: amount,
      heldPrice: unitPrice,
      todayHeldPrice: todayUnitPrice,
      isSellOut,
      earnings,
      earningPercent,
    };
  });
}

function sortList(list: StockItem[]): StockItem[] {
  if (sortType.value === 0) return list;
  const arr = [...list];
  arr.sort((a, b) => {
    const pa = parsePercent(a.percent);
    const pb = parsePercent(b.percent);
    return sortType.value === 1 ? pa - pb : pb - pa;
  });
  return arr;
}

function parsePercent(p: string): number {
  if (!p || p === "—") return 0;
  return parseFloat(String(p).replace("+", "")) || 0;
}

const displayList = computed(() => {
  const merged = mergeHeldAndEarnings(stockList.value);
  return sortList(merged);
});

function cycleSort() {
  if (sortType.value === 0) sortType.value = -1;
  else if (sortType.value === -1) sortType.value = 1;
  else sortType.value = 0;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

watch(realtimeMode, (on) => {
  if (realtimeTimer) {
    clearInterval(realtimeTimer);
    realtimeTimer = null;
  }
  if (on) {
    realtimeTimer = setInterval(() => {
      loadStockList({ background: true });
    }, realtimeInterval.value * 1000);
  }
});

async function loadStockList(options?: { background?: boolean }) {
  if (!codes.value.length) {
    stockList.value = [];
    return;
  }
  if (!options?.background) loading.value = true;
  try {
    stockList.value = await fetchStockList(codes.value);
    lastUpdateTime.value = Date.now();
  } catch (e) {
    console.error(e);
    if (!options?.background) stockList.value = [];
  } finally {
    if (!options?.background) loading.value = false;
  }
}

function refreshList() {
  loadStockList();
}

function removeCode(code: string) {
  codes.value = codes.value.filter(
    (c) => c.toLowerCase() !== code.toLowerCase(),
  );
  saveCodes();
  const key = code.toLowerCase();
  if (stockPrice.value[key]) {
    delete stockPrice.value[key];
    saveStockPrice();
  }
  loadStockList();
}

function addCode(code: string) {
  const lower = code.toLowerCase();
  if (codes.value.some((c) => c.toLowerCase() === lower)) return;
  codes.value = [...codes.value, lower];
  saveCodes();
  loadStockList();
}

function openHoldingModal(row: StockItem) {
  holdingStock.value = row;
  const cfg = stockPrice.value[row.code] || {};
  holdingForm.value = {
    amount: cfg.amount ?? 0,
    unitPrice: cfg.unitPrice ?? 0,
    todayUnitPrice: cfg.todayUnitPrice ?? 0,
    isSellOut: cfg.isSellOut ?? false,
  };
  holdingModal.value = true;
}

function closeHoldingModal() {
  holdingModal.value = false;
  holdingStock.value = null;
}

function saveHolding() {
  if (!holdingStock.value) return;
  const code = holdingStock.value.code;
  stockPrice.value[code] = {
    name: holdingStock.value.name,
    amount: Number(holdingForm.value.amount) || 0,
    unitPrice: Number(holdingForm.value.unitPrice) || 0,
    todayUnitPrice: Number(holdingForm.value.todayUnitPrice) || 0,
    isSellOut: !!holdingForm.value.isSellOut,
  };
  saveStockPrice();
  stockPrice.value = { ...stockPrice.value };
  closeHoldingModal();
}

function onSearch() {
  const q = searchKeyword.value.trim();
  if (!q) {
    searchSuggestions.value = [];
    return;
  }
  searchLoading.value = true;
  searchStock(q)
    .then((list) => {
      searchSuggestions.value = list;
    })
    .catch(() => {
      searchSuggestions.value = [];
    })
    .finally(() => {
      searchLoading.value = false;
    });
}

function onSelectSearchItem(item: SearchItem) {
  const code = searchItemToCode(item);
  addCode(code);
  searchKeyword.value = "";
  searchSuggestions.value = [];
}

watch(codes, () => loadStockList(), { immediate: false });
watch(searchKeyword, (q) => {
  if (searchTimer) clearTimeout(searchTimer);
  if (!q.trim()) {
    searchSuggestions.value = [];
    return;
  }
  searchTimer = setTimeout(() => onSearch(), 300);
});
onMounted(() => {
  loadCodes();
  loadStockPrice();
  loadStockList();
});
onUnmounted(() => {
  if (realtimeTimer) {
    clearInterval(realtimeTimer);
    realtimeTimer = null;
  }
});
</script>

<style scoped>
.app {
  padding-bottom: 2rem;
  min-height: 100vh;
}
.header {
  margin-bottom: 1.5rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--border);
}
.header-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.5rem;
}
.title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.02em;
}
.subtitle {
  color: var(--text-muted);
  font-size: 0.875rem;
  margin: 0;
}
.quick-links {
  display: flex;
  gap: 1rem;
  margin-left: auto;
}
.quick-links a {
  color: var(--accent);
  text-decoration: none;
  font-size: 0.875rem;
  transition: opacity 0.2s ease;
}
.quick-links a:hover {
  opacity: 0.85;
  text-decoration: underline;
}
.main {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.watchlist-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: box-shadow 0.2s ease;
}
.watchlist-section:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.section-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.section-head h2 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}
.last-update {
  font-size: 0.75rem;
  color: var(--text-muted);
}
.realtime-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.realtime-label {
  font-size: 0.8125rem;
  color: var(--text-muted);
}
.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>
