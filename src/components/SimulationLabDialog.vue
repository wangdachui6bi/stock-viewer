<template>
  <el-dialog
    v-model="visible"
    title="模拟盘指挥台"
    width="1180px"
    destroy-on-close
    class="simulation-dialog"
    @open="handleOpen"
  >
    <div class="simulation-shell" v-loading="loading">
      <section class="simulation-hero">
        <div>
          <p class="simulation-eyebrow">Top Trader Playbook</p>
          <h3>尾盘只做极端超跌，次日先保本，盈利交给跟踪止盈</h3>
          <p class="simulation-copy">
            默认策略会在 14:40 之后扫描连续下跌个股，只做一笔高确定性博弈；第二天优先看成本线保护，拉升后回落则用移动止盈退出。
          </p>
        </div>
        <div class="simulation-hero-actions">
          <el-button @click="refreshAll">刷新</el-button>
          <el-button @click="handleResetAccount">重置资金</el-button>
          <el-button type="primary" :loading="runNowLoading" @click="handleRunNow">
            立即执行一次
          </el-button>
        </div>
      </section>

      <section class="account-grid">
        <article class="account-card">
          <span class="account-label">初始资金</span>
          <strong>{{ formatMoney(account?.initialCash ?? 0) }}</strong>
        </article>
        <article class="account-card">
          <span class="account-label">可用现金</span>
          <strong>{{ formatMoney(account?.availableCash ?? 0) }}</strong>
        </article>
        <article class="account-card">
          <span class="account-label">总权益</span>
          <strong>{{ formatMoney(account?.totalEquity ?? 0) }}</strong>
        </article>
        <article class="account-card">
          <span class="account-label">浮动盈亏</span>
          <strong :class="valueClass(account?.floatingPnl ?? 0)">
            {{ formatSignedMoney(account?.floatingPnl ?? 0) }}
          </strong>
        </article>
        <article class="account-card">
          <span class="account-label">持仓数量</span>
          <strong>{{ account?.positionCount ?? 0 }} 只</strong>
        </article>
      </section>

      <el-tabs v-model="activeTab" class="simulation-tabs">
        <el-tab-pane label="策略中心" name="strategies">
          <div class="strategy-layout">
            <aside class="strategy-list">
              <div class="strategy-list-head">
                <div>
                  <h4>自动策略</h4>
                  <p>服务器每分钟跑一次，盘中按条件自动买卖。</p>
                </div>
                <el-button type="primary" plain @click="createNewStrategy">
                  新建策略
                </el-button>
              </div>
              <el-empty
                v-if="!strategies.length"
                description="先创建一套策略，系统就会开始自动巡航。"
              />
              <button
                v-for="item in strategies"
                :key="item.id"
                type="button"
                class="strategy-card"
                :class="{ active: strategyForm.id === item.id }"
                @click="selectStrategy(item)"
              >
                <div class="strategy-card-top">
                  <div>
                    <strong>{{ item.name }}</strong>
                    <p>{{ presetLabel(item.presetKey) }}</p>
                  </div>
                  <el-tag :type="item.enabled ? 'success' : 'info'" effect="light">
                    {{ item.enabled ? "运行中" : "已暂停" }}
                  </el-tag>
                </div>
                <div class="strategy-card-meta">
                  <span>扫描 {{ item.buyConfig.scanTime }}</span>
                  <span>连跌 {{ item.buyConfig.minDownDays }} 天</span>
                  <span>单笔 {{ formatMoney(item.buyConfig.capitalPerTrade) }}</span>
                </div>
                <div class="strategy-card-actions">
                  <span>最近执行：{{ formatDateTime(item.lastRunAt) }}</span>
                  <el-button
                    link
                    type="danger"
                    @click.stop="handleDeleteStrategy(item)"
                  >
                    删除
                  </el-button>
                </div>
              </button>
            </aside>

            <section class="strategy-editor">
              <div class="editor-head">
                <div>
                  <h4>{{ strategyForm.id ? "编辑策略" : "新建策略" }}</h4>
                  <p>把规则调成你自己的风格，保存后服务器会自动执行。</p>
                </div>
                <el-switch
                  v-model="strategyForm.enabled"
                  inline-prompt
                  active-text="启用"
                  inactive-text="停用"
                />
              </div>

              <el-form label-position="top" class="strategy-form">
                <div class="form-grid form-grid--single">
                  <el-form-item label="策略名称">
                    <el-input
                      v-model="strategyForm.name"
                      placeholder="例如：尾盘超跌反包 1 号"
                    />
                  </el-form-item>
                  <el-form-item label="策略模板">
                    <el-select v-model="strategyForm.presetKey">
                      <el-option
                        v-for="item in presetOptions"
                        :key="item.value"
                        :label="item.label"
                        :value="item.value"
                      />
                    </el-select>
                  </el-form-item>
                </div>

                <section class="config-panel">
                  <div class="config-panel-head">
                    <h5>买入逻辑</h5>
                    <span>专注极端弱势后的尾盘博弈机会</span>
                  </div>
                  <div class="form-grid">
                    <el-form-item label="开始扫描时间">
                      <el-time-select
                        v-model="strategyForm.buyConfig.scanTime"
                        start="14:00"
                        step="00:05"
                        end="14:55"
                      />
                    </el-form-item>
                    <el-form-item label="至少连续下跌天数">
                      <el-input-number
                        v-model="strategyForm.buyConfig.minDownDays"
                        :min="2"
                        :max="20"
                        controls-position="right"
                      />
                    </el-form-item>
                    <el-form-item label="候选排名">
                      <el-input-number
                        v-model="strategyForm.buyConfig.pickRank"
                        :min="1"
                        :max="20"
                        controls-position="right"
                      />
                    </el-form-item>
                    <el-form-item label="单笔资金">
                      <el-input-number
                        v-model="strategyForm.buyConfig.capitalPerTrade"
                        :min="1000"
                        :step="1000"
                        controls-position="right"
                      />
                    </el-form-item>
                    <el-form-item label="最小交易手数">
                      <el-input-number
                        v-model="strategyForm.buyConfig.boardLot"
                        :min="100"
                        :step="100"
                        controls-position="right"
                      />
                    </el-form-item>
                  </div>
                </section>

                <section class="config-panel">
                  <div class="config-panel-head">
                    <h5>卖出逻辑</h5>
                    <span>先守住成本，再把利润交给趋势</span>
                  </div>
                  <div class="switch-grid">
                    <label class="switch-card">
                      <div>
                        <strong>早盘触成本线卖出</strong>
                        <p>开盘后达到成本线附近就走，先把亏损交易淘汰掉。</p>
                      </div>
                      <el-switch v-model="strategyForm.sellConfig.morningBreakEvenEnabled" />
                    </label>
                    <label class="switch-card">
                      <div>
                        <strong>移动止盈</strong>
                        <p>股价拉升后回撤到阈值，立刻保护利润。</p>
                      </div>
                      <el-switch v-model="strategyForm.sellConfig.trailingStopEnabled" />
                    </label>
                  </div>
                  <div class="form-grid">
                    <el-form-item label="成本线保护截止时间">
                      <el-time-select
                        v-model="strategyForm.sellConfig.morningBreakEvenEnd"
                        start="09:35"
                        step="00:05"
                        end="11:30"
                      />
                    </el-form-item>
                    <el-form-item label="成本线容忍度(%)">
                      <el-input-number
                        v-model="strategyForm.sellConfig.breakEvenBufferPct"
                        :min="0"
                        :max="5"
                        :step="0.1"
                        :precision="1"
                        controls-position="right"
                      />
                    </el-form-item>
                    <el-form-item label="启动移动止盈所需利润(%)">
                      <el-input-number
                        v-model="strategyForm.sellConfig.minProfitForTrailPct"
                        :min="0.1"
                        :max="20"
                        :step="0.1"
                        :precision="1"
                        controls-position="right"
                      />
                    </el-form-item>
                    <el-form-item label="移动止盈回撤阈值(%)">
                      <el-input-number
                        v-model="strategyForm.sellConfig.trailingPullbackPct"
                        :min="0.1"
                        :max="10"
                        :step="0.1"
                        :precision="1"
                        controls-position="right"
                      />
                    </el-form-item>
                    <el-form-item label="硬止损(%)">
                      <el-input-number
                        v-model="strategyForm.sellConfig.stopLossPct"
                        :min="0.1"
                        :max="20"
                        :step="0.1"
                        :precision="1"
                        controls-position="right"
                      />
                    </el-form-item>
                  </div>
                </section>

                <section class="config-panel">
                  <div class="config-panel-head">
                    <h5>仓位与风控</h5>
                    <span>控制回撤，把模型关在你的风险框架里</span>
                  </div>
                  <div class="form-grid">
                    <el-form-item label="最大同时持仓">
                      <el-input-number
                        v-model="strategyForm.riskConfig.maxOpenPositions"
                        :min="1"
                        :max="20"
                        controls-position="right"
                      />
                    </el-form-item>
                    <el-form-item label="允许当日再次买入">
                      <el-switch v-model="strategyForm.riskConfig.allowSameDayReentry" />
                    </el-form-item>
                  </div>
                </section>
              </el-form>

              <div class="editor-actions">
                <el-button @click="createNewStrategy">重置表单</el-button>
                <el-button type="primary" :loading="saveLoading" @click="handleSaveStrategy">
                  {{ strategyForm.id ? "保存修改" : "创建策略" }}
                </el-button>
              </div>
            </section>
          </div>
        </el-tab-pane>

        <el-tab-pane :label="`持仓 (${positions.length})`" name="positions">
          <el-empty v-if="!positions.length" description="当前没有模拟持仓" />
          <el-table v-else :data="positions" stripe size="small" max-height="520">
            <el-table-column label="标的" min-width="150">
              <template #default="{ row }">
                <div class="stock-cell">
                  <strong>{{ row.stock_name }}</strong>
                  <span>{{ row.stock_code }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.status === 'open' ? 'success' : 'info'" effect="light">
                  {{ row.status === "open" ? "持仓中" : "已平仓" }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="数量" width="90" prop="quantity" />
            <el-table-column label="成本价" width="100" align="right">
              <template #default="{ row }">{{ formatPrice(row.avg_cost) }}</template>
            </el-table-column>
            <el-table-column label="现价" width="100" align="right">
              <template #default="{ row }">{{ formatPrice(row.last_price) }}</template>
            </el-table-column>
            <el-table-column label="最高价" width="100" align="right">
              <template #default="{ row }">{{ formatPrice(row.highest_price) }}</template>
            </el-table-column>
            <el-table-column label="盈亏" width="120" align="right">
              <template #default="{ row }">
                <span :class="valueClass(row.pnl)">{{ formatSignedMoney(row.pnl) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="原因" min-width="160" prop="close_reason" />
            <el-table-column label="建仓时间" width="170">
              <template #default="{ row }">{{ formatDateTime(row.opened_at) }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane :label="`订单 (${orders.length})`" name="orders">
          <el-empty v-if="!orders.length" description="还没有模拟成交记录" />
          <el-table v-else :data="orders" stripe size="small" max-height="520">
            <el-table-column label="时间" width="170">
              <template #default="{ row }">{{ formatDateTime(row.executed_at) }}</template>
            </el-table-column>
            <el-table-column label="标的" min-width="150">
              <template #default="{ row }">
                <div class="stock-cell">
                  <strong>{{ row.stock_name }}</strong>
                  <span>{{ row.stock_code }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="方向" width="90">
              <template #default="{ row }">
                <el-tag :type="row.side === 'buy' ? 'danger' : 'success'" effect="light">
                  {{ row.side === "buy" ? "买入" : "卖出" }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="orderStatusType(row.status)" effect="light">
                  {{ orderStatusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="成交价" width="100" align="right">
              <template #default="{ row }">{{ formatPrice(row.price) }}</template>
            </el-table-column>
            <el-table-column label="数量" width="90" prop="quantity" />
            <el-table-column label="金额" width="120" align="right">
              <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="触发原因" min-width="220" prop="trigger_reason" />
          </el-table>
        </el-tab-pane>

        <el-tab-pane :label="`日志 (${logs.length})`" name="logs">
          <el-empty v-if="!logs.length" description="策略日志会显示在这里" />
          <div v-else class="log-list">
            <article v-for="item in logs" :key="item.id" class="log-item">
              <div class="log-item-top">
                <div class="log-item-meta">
                  <el-tag :type="logLevelType(item.level)" effect="light">
                    {{ logLevelLabel(item.level) }}
                  </el-tag>
                  <span>{{ formatDateTime(item.created_at) }}</span>
                </div>
                <span class="log-item-strategy">
                  {{ findStrategyName(item.strategy_id) }}
                </span>
              </div>
              <strong>{{ item.message }}</strong>
              <pre v-if="item.detail" class="log-detail">{{ formatDetail(item.detail) }}</pre>
            </article>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  createSimulationStrategy,
  deleteSimulationStrategy,
  fetchSimulationAccount,
  fetchSimulationLogs,
  fetchSimulationOrders,
  fetchSimulationPositions,
  fetchSimulationStrategies,
  resetSimulationAccount,
  runSimulationNow,
  updateSimulationStrategy,
  type SimulationAccount,
  type SimulationLog,
  type SimulationOrder,
  type SimulationPosition,
  type SimulationStrategy,
  type StrategyBuyConfig,
  type StrategyRiskConfig,
  type StrategySellConfig,
} from "@/api/simulationApi";

type StrategyFormModel = {
  id: number | null;
  name: string;
  enabled: boolean;
  presetKey: string;
  buyConfig: StrategyBuyConfig;
  sellConfig: StrategySellConfig;
  riskConfig: StrategyRiskConfig;
};

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

const presetOptions = [
  { value: "five_day_down_rebound", label: "尾盘超跌反击" },
];

const activeTab = ref<"strategies" | "positions" | "orders" | "logs">("strategies");
const loading = ref(false);
const saveLoading = ref(false);
const runNowLoading = ref(false);
const account = ref<SimulationAccount | null>(null);
const strategies = ref<SimulationStrategy[]>([]);
const positions = ref<SimulationPosition[]>([]);
const orders = ref<SimulationOrder[]>([]);
const logs = ref<SimulationLog[]>([]);
const strategyForm = ref<StrategyFormModel>(createDefaultStrategyForm());

function createDefaultBuyConfig(): StrategyBuyConfig {
  return {
    scanTime: "14:40",
    minDownDays: 5,
    pickRank: 1,
    capitalPerTrade: 50000,
    boardLot: 100,
  };
}

function createDefaultSellConfig(): StrategySellConfig {
  return {
    morningBreakEvenEnabled: true,
    morningBreakEvenEnd: "11:30",
    breakEvenBufferPct: 0,
    trailingStopEnabled: true,
    minProfitForTrailPct: 1.2,
    trailingPullbackPct: 0.8,
    stopLossPct: 3,
  };
}

function createDefaultRiskConfig(): StrategyRiskConfig {
  return {
    maxOpenPositions: 1,
    allowSameDayReentry: false,
  };
}

function createDefaultStrategyForm(): StrategyFormModel {
  return {
    id: null,
    name: "尾盘超跌反击",
    enabled: true,
    presetKey: "five_day_down_rebound",
    buyConfig: createDefaultBuyConfig(),
    sellConfig: createDefaultSellConfig(),
    riskConfig: createDefaultRiskConfig(),
  };
}

function cloneFormFromStrategy(item: SimulationStrategy): StrategyFormModel {
  return {
    id: item.id,
    name: item.name,
    enabled: item.enabled,
    presetKey: item.presetKey,
    buyConfig: { ...item.buyConfig },
    sellConfig: { ...item.sellConfig },
    riskConfig: { ...item.riskConfig },
  };
}

function createNewStrategy() {
  strategyForm.value = createDefaultStrategyForm();
}

function selectStrategy(item: SimulationStrategy) {
  strategyForm.value = cloneFormFromStrategy(item);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatSignedMoney(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatMoney(value)}`;
}

function formatPrice(value: number) {
  return Number(value || 0).toFixed(2);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "未执行";
  return String(value).replace("T", " ").slice(0, 16);
}

function valueClass(value: number) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "";
}

function presetLabel(presetKey: string) {
  return presetOptions.find((item) => item.value === presetKey)?.label || presetKey;
}

function orderStatusLabel(status: SimulationOrder["status"]) {
  if (status === "filled") return "已成交";
  if (status === "rejected") return "已拒绝";
  return "已取消";
}

function orderStatusType(status: SimulationOrder["status"]) {
  if (status === "filled") return "success";
  if (status === "rejected") return "warning";
  return "info";
}

function logLevelLabel(level: SimulationLog["level"]) {
  if (level === "trade") return "交易";
  if (level === "warn") return "警告";
  if (level === "error") return "错误";
  return "信息";
}

function logLevelType(level: SimulationLog["level"]) {
  if (level === "trade") return "success";
  if (level === "warn") return "warning";
  if (level === "error") return "danger";
  return "info";
}

function findStrategyName(strategyId: number | null) {
  if (strategyId == null) return "系统任务";
  return strategies.value.find((item) => item.id === strategyId)?.name || `策略 #${strategyId}`;
}

function formatDetail(detail: Record<string, unknown>) {
  return JSON.stringify(detail, null, 2);
}

function extractErrorMessage(error: unknown) {
  const responseError = error as { response?: { data?: { error?: string } } };
  return responseError?.response?.data?.error || (error instanceof Error ? error.message : "请求失败");
}

function isDialogCancel(error: unknown) {
  return error === "cancel" || error === "close";
}

function syncStrategySelection(list: SimulationStrategy[], preferredId: number | null) {
  if (!list.length) {
    strategyForm.value = createDefaultStrategyForm();
    return;
  }
  const match = list.find((item) => item.id === preferredId) || list[0];
  strategyForm.value = cloneFormFromStrategy(match);
}

async function refreshAll(preferredId: number | null = strategyForm.value.id) {
  loading.value = true;
  try {
    const [accountData, strategiesData, positionsData, ordersData, logsData] = await Promise.all([
      fetchSimulationAccount(),
      fetchSimulationStrategies(),
      fetchSimulationPositions(),
      fetchSimulationOrders(),
      fetchSimulationLogs(),
    ]);

    account.value = accountData;
    strategies.value = strategiesData;
    positions.value = positionsData;
    orders.value = ordersData;
    logs.value = logsData;
    syncStrategySelection(strategiesData, preferredId);
  } catch (error) {
    ElMessage.error(extractErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

async function handleOpen() {
  await refreshAll();
}

async function handleSaveStrategy() {
  const payload = {
    name: strategyForm.value.name.trim(),
    enabled: strategyForm.value.enabled,
    presetKey: strategyForm.value.presetKey,
    buyConfig: { ...strategyForm.value.buyConfig },
    sellConfig: { ...strategyForm.value.sellConfig },
    riskConfig: { ...strategyForm.value.riskConfig },
  };

  if (!payload.name) {
    ElMessage.warning("策略名称不能为空");
    return;
  }

  saveLoading.value = true;
  try {
    if (strategyForm.value.id) {
      await updateSimulationStrategy(strategyForm.value.id, payload);
      ElMessage.success("策略已更新");
    } else {
      await createSimulationStrategy(payload);
      ElMessage.success("策略已创建");
    }
    await refreshAll(strategyForm.value.id);
  } catch (error) {
    ElMessage.error(extractErrorMessage(error));
  } finally {
    saveLoading.value = false;
  }
}

async function handleDeleteStrategy(item: SimulationStrategy) {
  try {
    await ElMessageBox.confirm(`删除后将停止自动执行「${item.name}」，继续吗？`, "删除策略", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
    await deleteSimulationStrategy(item.id);
    ElMessage.success("策略已删除");
    await refreshAll(strategyForm.value.id === item.id ? null : strategyForm.value.id);
  } catch (error) {
    if (!isDialogCancel(error)) {
      ElMessage.error(extractErrorMessage(error));
    }
  }
}

async function handleRunNow() {
  runNowLoading.value = true;
  try {
    const results = await runSimulationNow();
    const buyCount = results.reduce((sum, item) => sum + Number(item.bought || 0), 0);
    const sellCount = results.reduce((sum, item) => sum + Number(item.sold || 0), 0);
    const skippedCount = results.reduce((sum, item) => sum + Number(item.skipped ? 1 : 0), 0);
    const skippedText = skippedCount ? `，跳过 ${skippedCount} 套运行中的策略` : "";
    ElMessage.success(`执行完成：买入 ${buyCount} 笔，卖出 ${sellCount} 笔${skippedText}`);
    await refreshAll();
  } catch (error) {
    ElMessage.error(extractErrorMessage(error));
  } finally {
    runNowLoading.value = false;
  }
}

async function handleResetAccount() {
  try {
    const { value } = await ElMessageBox.prompt(
      "输入新的初始资金。重置后会清空模拟持仓、订单、日志和策略。",
      "重置模拟盘",
      {
        inputValue: String(account.value?.initialCash || 1000000),
        inputPattern: /^\d+(\.\d+)?$/,
        inputErrorMessage: "请输入正确金额",
        confirmButtonText: "确认重置",
        cancelButtonText: "取消",
        type: "warning",
      },
    );
    await resetSimulationAccount(Number(value));
    ElMessage.success("模拟盘已重置");
    createNewStrategy();
    await refreshAll(null);
  } catch (error) {
    if (!isDialogCancel(error)) {
      ElMessage.error(extractErrorMessage(error));
    }
  }
}
</script>

<style scoped>
.simulation-shell {
  --sim-text: #102033;
  --sim-muted: #5f6f82;
  --sim-soft-muted: #7d8ca0;
  --sim-line: rgba(15, 23, 42, 0.1);
  --sim-surface: #f4f7fb;
  --sim-surface-strong: #ffffff;
  --sim-hero-text: #f8fafc;
  --sim-hero-muted: rgba(241, 245, 249, 0.82);
  --sim-accent: #c2410c;
  --sim-accent-soft: rgba(194, 65, 12, 0.12);
  --sim-workspace: #0f1724;
  --sim-workspace-2: #131d2b;
  --sim-workspace-3: #182334;
  --sim-workspace-line: rgba(148, 163, 184, 0.14);
  --sim-workspace-text: #e8eef7;
  --sim-workspace-muted: #9aa9bc;
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: var(--sim-text);
}

.simulation-hero {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 22px;
  border-radius: 20px;
  background:
    radial-gradient(circle at top left, rgba(251, 146, 60, 0.18), transparent 32%),
    linear-gradient(135deg, #152238, #1c2d46 52%, #283a53);
  color: var(--sim-hero-text);
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.16);
}

.simulation-eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.7);
}

.simulation-hero h3 {
  margin: 0;
  font-size: 22px;
  line-height: 1.35;
  letter-spacing: 0.01em;
}

.simulation-copy {
  margin: 10px 0 0;
  max-width: 720px;
  line-height: 1.6;
  color: var(--sim-hero-muted);
}

.simulation-hero-actions {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.account-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}

.account-card {
  padding: 16px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 247, 251, 0.98));
  border: 1px solid var(--sim-line);
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.05);
}

.account-card strong {
  display: block;
  margin-top: 10px;
  font-size: 22px;
  color: var(--sim-text);
}

.account-label {
  color: var(--sim-muted);
  font-size: 13px;
}

.simulation-tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
}

.simulation-tabs :deep(.el-tabs__item) {
  color: var(--sim-muted);
  font-weight: 600;
}

.simulation-tabs :deep(.el-tabs__item.is-active) {
  color: var(--sim-text);
}

.simulation-tabs :deep(.el-tabs__active-bar) {
  background: var(--sim-accent);
}

.strategy-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 18px;
  padding: 14px;
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(15, 23, 36, 0.98), rgba(20, 30, 44, 0.98)),
    var(--sim-workspace);
  border: 1px solid rgba(30, 41, 59, 0.8);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.strategy-list,
.strategy-editor {
  min-height: 560px;
  padding: 18px;
  border-radius: 20px;
  border: 1px solid var(--sim-workspace-line);
  background:
    linear-gradient(180deg, rgba(19, 29, 43, 0.96), rgba(15, 23, 36, 0.98)),
    var(--sim-workspace-2);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 18px 36px rgba(2, 6, 23, 0.18);
}

.strategy-list-head,
.editor-head,
.config-panel-head,
.strategy-card-top,
.strategy-card-actions,
.log-item-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.strategy-list-head {
  margin-bottom: 14px;
}

.strategy-list-head h4,
.editor-head h4,
.config-panel-head h5 {
  margin: 0;
  color: var(--sim-workspace-text);
}

.strategy-list-head p,
.editor-head p,
.config-panel-head span {
  margin: 6px 0 0;
  color: var(--sim-workspace-muted);
  line-height: 1.5;
  font-size: 13px;
}

.strategy-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.strategy-card {
  width: 100%;
  padding: 14px;
  text-align: left;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background:
    linear-gradient(180deg, rgba(23, 34, 49, 0.96), rgba(16, 24, 37, 0.98)),
    var(--sim-workspace-3);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.strategy-card:hover,
.strategy-card.active {
  transform: translateY(-2px);
  border-color: rgba(194, 65, 12, 0.32);
  box-shadow: 0 14px 28px rgba(2, 6, 23, 0.28);
}

.strategy-card.active {
  background:
    linear-gradient(180deg, rgba(52, 32, 16, 0.92), rgba(23, 34, 49, 0.98)),
    var(--sim-workspace-3);
  box-shadow:
    inset 0 0 0 1px rgba(251, 146, 60, 0.22),
    0 16px 32px rgba(2, 6, 23, 0.34);
}

.strategy-card strong {
  color: var(--sim-workspace-text);
}

.strategy-card p,
.strategy-card span {
  color: var(--sim-workspace-muted);
  font-size: 12px;
}

.strategy-card-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.strategy-card-meta span {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.08);
  color: #c2cedd;
}

.strategy-card-actions {
  margin-top: 12px;
  align-items: center;
}

.strategy-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 18px;
}

.config-panel {
  padding: 16px;
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(24, 35, 52, 0.94), rgba(17, 25, 38, 0.98)),
    var(--sim-workspace-3);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.form-grid--single {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.switch-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 14px 0;
}

.switch-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(15, 23, 36, 0.64);
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.switch-card strong {
  display: block;
  color: var(--sim-workspace-text);
}

.switch-card p {
  margin: 6px 0 0;
  color: var(--sim-workspace-muted);
  font-size: 12px;
  line-height: 1.5;
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.stock-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stock-cell span {
  color: var(--sim-muted);
  font-size: 12px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 520px;
  overflow: auto;
  padding-right: 4px;
}

.log-item {
  padding: 14px 16px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid rgba(203, 213, 225, 0.78);
}

.log-item-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--sim-muted);
  font-size: 12px;
}

.log-item strong {
  display: block;
  margin-top: 10px;
  color: var(--sim-text);
}

.log-item-strategy {
  color: var(--sim-soft-muted);
  font-size: 12px;
}

.log-detail {
  margin: 10px 0 0;
  padding: 12px;
  border-radius: 12px;
  background: #132033;
  color: #dbe7f5;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.simulation-dialog :deep(.el-dialog) {
  border-radius: 24px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(250, 252, 255, 0.98), rgba(244, 247, 251, 0.98));
}

.simulation-dialog :deep(.el-dialog__header) {
  margin: 0;
  padding: 20px 24px 8px;
}

.simulation-dialog :deep(.el-dialog__title) {
  color: var(--sim-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.simulation-dialog :deep(.el-dialog__body) {
  padding: 16px 24px 24px;
}

.simulation-dialog :deep(.el-dialog__headerbtn .el-dialog__close) {
  color: var(--sim-muted);
}

.simulation-dialog :deep(.el-form-item__label) {
  color: var(--sim-workspace-text);
  font-weight: 600;
}

.strategy-editor :deep(.el-input__wrapper),
.strategy-editor :deep(.el-textarea__inner),
.strategy-editor :deep(.el-select__wrapper),
.strategy-editor :deep(.el-input-number),
.strategy-editor :deep(.el-time-select .el-input__wrapper),
.strategy-list :deep(.el-input__wrapper),
.strategy-list :deep(.el-select__wrapper) {
  background: rgba(10, 16, 27, 0.88);
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.14) inset;
}

.strategy-editor :deep(.el-input__inner),
.strategy-editor :deep(.el-textarea__inner),
.strategy-editor :deep(.el-select__selected-item),
.strategy-editor :deep(.el-input-number__decrease),
.strategy-editor :deep(.el-input-number__increase),
.strategy-list :deep(.el-input__inner),
.strategy-list :deep(.el-select__selected-item) {
  color: var(--sim-workspace-text);
}

.strategy-editor :deep(.el-input__inner::placeholder),
.strategy-editor :deep(.el-textarea__inner::placeholder),
.strategy-list :deep(.el-input__inner::placeholder) {
  color: #7f90a6;
}

.strategy-editor :deep(.el-switch__label),
.strategy-list :deep(.el-switch__label) {
  color: var(--sim-workspace-muted);
}

.strategy-editor :deep(.el-input-number__decrease),
.strategy-editor :deep(.el-input-number__increase) {
  background: rgba(255, 255, 255, 0.04);
}

.strategy-editor :deep(.el-select__placeholder),
.strategy-editor :deep(.el-input__prefix),
.strategy-editor :deep(.el-input__suffix),
.strategy-list :deep(.el-select__placeholder) {
  color: #8191a7;
}

.strategy-layout :deep(.el-tag.el-tag--info) {
  --el-tag-bg-color: rgba(148, 163, 184, 0.12);
  --el-tag-border-color: rgba(148, 163, 184, 0.18);
  --el-tag-text-color: #d1d9e6;
}

.strategy-layout :deep(.el-tag.el-tag--success) {
  --el-tag-bg-color: rgba(34, 197, 94, 0.14);
  --el-tag-border-color: rgba(34, 197, 94, 0.22);
  --el-tag-text-color: #b8efc8;
}

.strategy-layout :deep(.el-switch.is-checked .el-switch__core) {
  background: var(--sim-accent);
  border-color: var(--sim-accent);
}

.strategy-layout :deep(.el-button:not(.el-button--primary)) {
  --el-button-text-color: #d7e0eb;
  --el-button-bg-color: rgba(255, 255, 255, 0.04);
  --el-button-border-color: rgba(148, 163, 184, 0.18);
  --el-button-hover-text-color: #ffffff;
  --el-button-hover-bg-color: rgba(255, 255, 255, 0.08);
  --el-button-hover-border-color: rgba(148, 163, 184, 0.24);
}

.simulation-dialog :deep(.el-table) {
  --el-table-text-color: var(--sim-text);
  --el-table-header-text-color: #334155;
  --el-table-row-hover-bg-color: rgba(194, 65, 12, 0.05);
  --el-table-border-color: rgba(203, 213, 225, 0.72);
  --el-table-header-bg-color: rgba(241, 245, 249, 0.92);
  background: transparent;
}

.simulation-dialog :deep(.el-table th.el-table__cell) {
  font-weight: 700;
}

.simulation-dialog :deep(.el-empty__description p) {
  color: var(--sim-muted);
}

.simulation-dialog :deep(.el-tag) {
  font-weight: 600;
}

.simulation-dialog :deep(.el-button--primary) {
  --el-button-bg-color: var(--sim-accent);
  --el-button-border-color: var(--sim-accent);
  --el-button-hover-bg-color: #b45309;
  --el-button-hover-border-color: #b45309;
}

.simulation-dialog :deep(.el-button.is-plain) {
  --el-button-hover-text-color: var(--sim-accent);
}

.up {
  color: #dc2626;
}

.down {
  color: #2563eb;
}

@media (max-width: 1100px) {
  .account-grid,
  .strategy-layout,
  .form-grid,
  .form-grid--single,
  .switch-grid {
    grid-template-columns: 1fr;
  }

  .simulation-hero {
    flex-direction: column;
  }

  .simulation-hero-actions {
    justify-content: flex-start;
  }
}
</style>
