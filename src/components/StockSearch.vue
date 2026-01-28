<template>
  <div class="search-wrap">
    <div class="search-box">
      <input
        v-model="localKeyword"
        type="text"
        class="search-input"
        placeholder="搜索股票 / 指数，如：贵州茅台、000001、hk00700、nvda"
        @input="emit('update:keyword', localKeyword)"
        @focus="showSuggestions = true"
        @blur="onBlur"
        @keydown.enter="confirmFirst"
      />
      <button class="search-btn" :disabled="searchLoading" @click="emit('search')">
        {{ searchLoading ? '…' : '搜索' }}
      </button>
    </div>
    <Transition name="dropdown">
      <ul v-if="showSuggestions && suggestions.length" class="suggestions">
        <li
          v-for="(item, i) in suggestions"
          :key="item.code + item.market"
          class="suggestion-item"
          @click="selectItem(item)"
        >
          <span class="suggestion-label">{{ item.label }}</span>
          <span class="suggestion-market">{{ marketLabel(item.market) }}</span>
        </li>
      </ul>
    </Transition>
    <div v-if="showSuggestions && keyword && !suggestions.length && !searchLoading" class="suggestions empty">
      无结果，请换关键词
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { SearchItem } from '@/types/stock'

const props = withDefaults(
  defineProps<{
    keyword: string
    loading?: boolean
    suggestions?: SearchItem[]
  }>(),
  { loading: false, suggestions: () => [] }
)
const emit = defineEmits<{
  'update:keyword': [string]
  search: []
  select: [SearchItem]
}>()

const localKeyword = ref(props.keyword)
const showSuggestions = ref(false)

watch(
  () => props.keyword,
  (v) => { localKeyword.value = v }
)
watch(localKeyword, (v) => emit('update:keyword', v))

function marketLabel(m: string) {
  const map: Record<string, string> = { sh: '沪', sz: '深', bj: '北', hk: '港', us: '美' }
  return map[(m || '').toLowerCase()] || m
}

function selectItem(item: SearchItem) {
  emit('select', item)
  showSuggestions.value = false
}

function confirmFirst() {
  if (props.suggestions.length) selectItem(props.suggestions[0])
  else emit('search')
}

function onBlur() {
  setTimeout(() => { showSuggestions.value = false }, 150)
}
</script>

<style scoped>
.search-wrap { position: relative; }
.search-box { display: flex; gap: 0.5rem; }
.search-input {
  flex: 1;
  padding: 0.65rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  outline: none;
}
.search-input::placeholder { color: var(--text-muted); }
.search-input:focus { border-color: var(--accent); }
.search-btn {
  padding: 0.65rem 1rem;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  font-weight: 500;
}
.search-btn:disabled { opacity: 0.7; cursor: not-allowed; }
.suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  list-style: none;
  padding: 0.25rem;
  max-height: 280px;
  overflow-y: auto;
  z-index: 10;
}
.suggestion-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  border-radius: 6px;
}
.suggestion-item:hover { background: var(--border); }
.suggestion-label { font-weight: 500; }
.suggestion-market { color: var(--text-muted); font-size: 0.85rem; }
.suggestions.empty { padding: 0.75rem; color: var(--text-muted); }
.dropdown-enter-active, .dropdown-leave-active { transition: opacity 0.15s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; }
</style>
