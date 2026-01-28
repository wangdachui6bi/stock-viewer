<template>
  <div class="search-wrap">
    <div class="search-box">
      <el-input
        v-model="localKeyword"
        class="search-input"
        placeholder="搜索股票 / 指数，如：贵州茅台、000001、hk00700、nvda"
        clearable
        size="large"
        @input="emit('update:keyword', localKeyword)"
        @focus="showSuggestions = true"
        @blur="onBlur"
        @keydown.enter="confirmFirst"
      >
        <template #prefix>
          <el-icon class="search-prefix-icon"><Search /></el-icon>
        </template>
      </el-input>
      <el-button type="primary" size="large" :loading="loading" @click="emit('search')">
        搜索
      </el-button>
    </div>
    <Transition name="dropdown">
      <ul v-if="showSuggestions && suggestions.length" class="suggestions">
        <li
          v-for="item in suggestions"
          :key="item.code + item.market"
          class="suggestion-item"
          @click="selectItem(item)"
        >
          <span class="suggestion-label">{{ item.label }}</span>
          <span class="suggestion-market">{{ marketLabel(item.market) }}</span>
        </li>
      </ul>
    </Transition>
    <Transition name="dropdown">
      <div
        v-if="showSuggestions && keyword && !suggestions.length && !loading"
        class="suggestions empty"
      >
        无结果，请换关键词
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Search } from "@element-plus/icons-vue";
import type { SearchItem } from "@/types/stock";

const props = withDefaults(
  defineProps<{
    keyword: string;
    loading?: boolean;
    suggestions?: SearchItem[];
  }>(),
  { loading: false, suggestions: () => [] },
);
const emit = defineEmits<{
  "update:keyword": [string];
  search: [];
  select: [SearchItem];
}>();

const localKeyword = ref(props.keyword);
const showSuggestions = ref(false);

watch(
  () => props.keyword,
  (v) => {
    localKeyword.value = v;
  },
);
watch(localKeyword, (v) => emit("update:keyword", v));

function marketLabel(m: string) {
  const map: Record<string, string> = {
    sh: "沪",
    sz: "深",
    bj: "北",
    hk: "港",
    us: "美",
  };
  return map[(m || "").toLowerCase()] || m;
}

function selectItem(item: SearchItem) {
  emit("select", item);
  showSuggestions.value = false;
}

function confirmFirst() {
  if (props.suggestions.length) selectItem(props.suggestions[0]);
  else emit("search");
}

function onBlur() {
  setTimeout(() => {
    showSuggestions.value = false;
  }, 150);
}
</script>

<style scoped>
.search-wrap {
  position: relative;
}
.search-box {
  display: flex;
  gap: 0.5rem;
}
.search-input {
  flex: 1;
}
.search-prefix-icon {
  color: var(--text-muted);
  font-size: 1.1rem;
}
.search-box :deep(.el-input__wrapper) {
  border-radius: var(--radius);
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
.search-box :deep(.el-input__wrapper:hover),
.search-box :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--accent);
}
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.15s ease;
}
.suggestion-item:hover {
  background: rgba(255, 255, 255, 0.06);
}
.suggestion-label {
  font-weight: 500;
}
.suggestion-market {
  color: var(--text-muted);
  font-size: 0.85rem;
}
.suggestions.empty {
  padding: 0.75rem;
  color: var(--text-muted);
}
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
}
</style>
