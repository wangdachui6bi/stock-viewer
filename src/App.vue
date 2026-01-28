<template>
  <div class="app">
    <header class="header">
      <div class="header-inner">
        <h1 class="title">股票行情</h1>
        <p class="subtitle">基于 leek-fund 数据 · A股/港股/美股/期货 · PC 端交易助手</p>
        <div class="quick-links">
          <a href="https://data.eastmoney.com/hsgt/index.html" target="_blank" rel="noopener">北向资金</a>
          <a href="https://data.eastmoney.com/zjlx/detail.html" target="_blank" rel="noopener">主力资金</a>
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
          <h2>自选列表</h2>
          <div class="actions">
            <button class="btn btn-ghost" :class="{ active: sortType !== 0 }" @click="cycleSort">
              {{ SORT_LABELS[sortType] }}
            </button>
            <button
              class="btn btn-ghost"
              :disabled="loading"
              @click="refreshList"
            >
              {{ loading ? "刷新中…" : "刷新" }}
            </button>
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
    <Teleport to="body">
      <div v-if="holdingModal" class="modal-backdrop" @click.self="closeHoldingModal">
        <div class="modal holding-modal">
          <div class="modal-head">
            <h3>持仓设置 · {{ holdingStock?.name }} ({{ holdingStock?.code }})</h3>
            <button class="btn-close" @click="closeHoldingModal">×</button>
          </div>
          <div class="modal-body">
            <div class="form-row">
              <label>持仓股数</label>
              <input v-model.number="holdingForm.amount" type="number" min="0" step="1" />
            </div>
            <div class="form-row">
              <label>持仓成本价</label>
              <input v-model.number="holdingForm.unitPrice" type="number" min="0" step="0.01" />
            </div>
            <div class="form-row">
              <label>今日成本价</label>
              <input v-model.number="holdingForm.todayUnitPrice" type="number" min="0" step="0.01" />
            </div>
            <div class="form-row checkbox-row">
              <label>
                <input v-model="holdingForm.isSellOut" type="checkbox" />
                已清仓
              </label>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" @click="closeHoldingModal">取消</button>
            <button class="btn btn-primary" @click="saveHolding">保存</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from "vue";
let searchTimer: ReturnType<typeof setTimeout> | null = null;
import StockSearch from "./components/StockSearch.vue";
import StockTable from "./components/StockTable.vue";
import { fetchStockList, searchStock, searchItemToCode } from "./api/stock";
import type { StockItem, SearchItem, StockPriceItem, SortType } from "./types/stock";
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

async function loadStockList() {
  if (!codes.value.length) {
    stockList.value = [];
    return;
  }
  loading.value = true;
  try {
    stockList.value = await fetchStockList(codes.value);
  } catch (e) {
    console.error(e);
    stockList.value = [];
  } finally {
    loading.value = false;
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
</script>

<style scoped>
.app {
  padding-bottom: 2rem;
  min-height: 100vh;
}
.header {
  margin-bottom: 1.5rem;
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
}
.quick-links a:hover {
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
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.section-head h2 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}
.actions {
  display: flex;
  gap: 0.5rem;
}
.btn {
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  border: none;
  font-weight: 500;
  font-size: 0.875rem;
}
.btn-ghost {
  background: transparent;
  color: var(--text-muted);
}
.btn-ghost:hover:not(:disabled),
.btn-ghost.active {
  background: var(--border);
  color: var(--text);
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn-primary {
  background: var(--accent);
  color: #fff;
}
.btn-primary:hover {
  filter: brightness(1.1);
}

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}
.modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  min-width: 320px;
  max-width: 420px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}
.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
}
.modal-head h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}
.btn-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 0.25rem;
}
.btn-close:hover {
  color: var(--text);
}
.modal-body {
  padding: 1.25rem;
}
.form-row {
  margin-bottom: 1rem;
}
.form-row label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.875rem;
  color: var(--text-muted);
}
.form-row input[type="number"] {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 0.875rem;
}
.form-row input[type="number"]:focus {
  outline: none;
  border-color: var(--accent);
}
.checkbox-row label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}
.checkbox-row input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border);
}
</style>
