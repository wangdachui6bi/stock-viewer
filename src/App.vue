<template>
  <div class="app" :class="{ h5: isH5 }">
    <header class="header">
      <div class="header-inner">
        <h1 class="title">股票行情</h1>
        <p class="subtitle">{{ isH5 ? "H5 行情" : "PC 端交易助手" }}</p>
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
      <section
        class="tools-section"
        :class="{ 'tools-section--collapsed': toolsCollapsed }"
      >
        <div class="section-head tools-section-head">
          <div class="section-title-row">
            <h2>交易工具</h2>
            <span class="last-update"
              >持仓 {{ portfolioSummary.holdingCount }} 只</span
            >
          </div>
          <div class="actions">
            <el-button
              link
              size="small"
              type="primary"
              @click="toolsCollapsed = !toolsCollapsed"
            >
              {{ toolsCollapsed ? "展开" : "收起" }}
            </el-button>
            <template v-if="!toolsCollapsed">
              <el-button
                v-if="!isH5"
                size="small"
                @click="requestNotificationPermission"
              >
                通知权限
              </el-button>
              <div class="realtime-wrap">
                <span class="realtime-label">隐藏市值</span>
                <el-switch
                  v-model="hideMarketValue"
                  size="default"
                  inline-prompt
                  active-text="开"
                  inactive-text="关"
                />
              </div>
            </template>
          </div>
        </div>
        <div v-show="!toolsCollapsed" class="tools-section-body">
          <el-tabs v-model="toolsTab" class="tools-tabs">
            <el-tab-pane label="概览" name="overview">
              <div class="summary-grid">
                <div class="summary-card">
                  <div class="summary-label">持仓市值</div>
                  <div
                    class="summary-value"
                    :class="{ masked: hideMarketValue }"
                  >
                    {{
                      hideMarketValue
                        ? "****"
                        : formatMoney(portfolioSummary.currentValue)
                    }}
                  </div>
                </div>
                <div class="summary-card">
                  <div class="summary-label">持仓成本</div>
                  <div
                    class="summary-value"
                    :class="{ masked: hideMarketValue }"
                  >
                    {{
                      hideMarketValue
                        ? "****"
                        : formatMoney(portfolioSummary.totalCost)
                    }}
                  </div>
                </div>
                <div class="summary-card">
                  <div class="summary-label">总盈亏</div>
                  <div
                    class="summary-value"
                    :class="
                      portfolioSummary.totalEarnings > 0
                        ? 'down'
                        : portfolioSummary.totalEarnings < 0
                          ? 'up'
                          : ''
                    "
                  >
                    {{
                      hideMarketValue
                        ? "****"
                        : formatSigned(portfolioSummary.totalEarnings)
                    }}
                  </div>
                  <div class="summary-sub">
                    {{
                      hideMarketValue
                        ? "****"
                        : formatSigned(portfolioSummary.totalPct, "%")
                    }}
                  </div>
                </div>
                <div class="summary-card">
                  <div class="summary-label">今日盈亏</div>
                  <div
                    class="summary-value"
                    :class="
                      portfolioSummary.todayEarnings > 0
                        ? 'down'
                        : portfolioSummary.todayEarnings < 0
                          ? 'up'
                          : ''
                    "
                  >
                    {{ formatSigned(portfolioSummary.todayEarnings) }}
                  </div>
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane v-if="!isH5" label="提醒" name="alerts">
              <div class="alerts-panel">
                <div class="alerts-form">
                  <el-select
                    v-model="alertForm.code"
                    filterable
                    allow-create
                    default-first-option
                    placeholder="选择股票 / 输入代码"
                    class="alert-select"
                  >
                    <el-option
                      v-for="item in alertStockOptions"
                      :key="item.code"
                      :label="`${item.name} (${item.code})`"
                      :value="item.code"
                    />
                  </el-select>
                  <el-select v-model="alertForm.type" class="alert-type">
                    <el-option label="价格" value="price" />
                    <el-option label="涨跌幅" value="percent" />
                  </el-select>
                  <el-select v-model="alertForm.operator" class="alert-op">
                    <el-option label="≥" value=">=" />
                    <el-option label="≤" value="<=" />
                  </el-select>
                  <el-input-number
                    v-model="alertForm.value"
                    :step="0.01"
                    :precision="2"
                    class="alert-value"
                  />
                  <el-button type="primary" @click="addAlert"
                    >添加提醒</el-button
                  >
                </div>
                <div class="alerts-list">
                  <el-empty
                    v-if="!alerts.length"
                    description="暂无提醒，添加后价格触达会通知"
                  />
                  <el-table v-else :data="alerts" size="small" stripe>
                    <el-table-column label="股票" min-width="140">
                      <template #default="{ row }">
                        <div class="alert-name">
                          <span>{{ row.name || row.code }}</span>
                          <span class="muted">({{ row.code }})</span>
                        </div>
                      </template>
                    </el-table-column>
                    <el-table-column label="条件" min-width="150">
                      <template #default="{ row }">
                        {{ formatAlertCondition(row) }}
                      </template>
                    </el-table-column>
                    <el-table-column label="上次触发" width="110">
                      <template #default="{ row }">
                        {{ formatAlertLastTime(row.lastTriggered) }}
                      </template>
                    </el-table-column>
                    <el-table-column label="状态" width="90">
                      <template #default="{ row }">
                        <el-switch
                          v-model="row.enabled"
                          @change="toggleAlert(row, $event)"
                        />
                      </template>
                    </el-table-column>
                    <el-table-column label="操作" width="80">
                      <template #default="{ row }">
                        <el-button
                          link
                          type="danger"
                          size="small"
                          @click="removeAlert(row.id)"
                        >
                          删除
                        </el-button>
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane label="资讯" name="news">
              <div class="news-panel-inner">
                <div class="section-head">
                  <div class="section-title-row">
                    <span class="last-update" v-if="newsLastUpdate">
                      更新于 {{ formatTime(newsLastUpdate) }}
                    </span>
                  </div>
                  <el-button
                    size="small"
                    :loading="newsLoading"
                    @click="loadNews"
                  >
                    刷新
                  </el-button>
                </div>
                <div class="news-list">
                  <el-empty
                    v-if="!newsLoading && !newsList.length"
                    description="暂无资讯"
                  />
                  <ul v-else class="news-items">
                    <li v-for="item in newsList" :key="item.link || item.title">
                      <a :href="item.link" target="_blank" rel="noopener">
                        {{ item.title }}
                      </a>
                      <span class="muted">{{
                        formatNewsTime(item.pubDate)
                      }}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </el-tab-pane>

            <el-tab-pane label="量化" name="quant">
              <QuantPanel :candidates="displayList" />
            </el-tab-pane>
          </el-tabs>
        </div>
      </section>
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
            <el-dropdown trigger="click" @command="handleAiCommand">
              <el-button type="primary" plain>
                AI / 选股
                <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="pick">AI 选股</el-dropdown-item>
                  <el-dropdown-item command="sector">板块最强</el-dropdown-item>
                  <el-dropdown-item command="afterClose"
                    >收盘复盘</el-dropdown-item
                  >
                  <el-dropdown-item command="screen">条件选股</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-select
              v-model="currentGroupId"
              size="small"
              class="group-select"
            >
              <el-option :value="ALL_GROUP_ID" label="全部分组" />
              <el-option
                v-for="group in groups"
                :key="group.id"
                :label="group.name"
                :value="group.id"
              />
            </el-select>
            <el-button size="small" @click="groupManageModal = true">
              管理分组
            </el-button>
            <el-tooltip
              :content="`开启后每 ${realtimeInterval} 秒自动刷新行情`"
              placement="bottom"
            >
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
            <el-select
              v-model="holdingFilter"
              size="small"
              class="group-select"
            >
              <el-option value="all" label="全部标的" />
              <el-option value="holding" label="仅持仓" />
              <el-option value="not_holding" label="未持仓" />
            </el-select>
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
          @set-group="openGroupAssign"
          @ai-analyze="openAiAnalyze"
          @kline="openKline"
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
    <el-dialog v-model="groupManageModal" title="分组管理" width="420px">
      <div class="group-manage">
        <div class="group-create">
          <el-input v-model="newGroupName" placeholder="输入分组名称" />
          <el-button type="primary" @click="addGroup">新增</el-button>
        </div>
        <div class="group-list">
          <div v-for="group in groups" :key="group.id" class="group-item">
            <el-input v-model="groupDrafts[group.id]" />
            <div class="group-actions">
              <el-button size="small" @click="renameGroup(group.id)"
                >保存</el-button
              >
              <el-button
                size="small"
                type="danger"
                :disabled="groups.length <= 1"
                @click="removeGroup(group.id)"
              >
                删除
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </el-dialog>
    <el-dialog
      v-model="groupAssignModal"
      :title="`调整分组 · ${groupAssignStock?.name ?? ''} (${groupAssignStock?.code ?? ''})`"
      width="380px"
      @close="closeGroupAssign"
    >
      <el-form label-position="top">
        <el-form-item label="选择分组">
          <el-select v-model="groupAssignId" style="width: 100%">
            <el-option
              v-for="group in groups"
              :key="group.id"
              :label="group.name"
              :value="group.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeGroupAssign">取消</el-button>
        <el-button type="primary" @click="applyGroupAssign">保存</el-button>
      </template>
    </el-dialog>

    <!-- AI 分析 -->
    <el-dialog
      v-model="aiAnalyzeModal"
      :title="`AI 分析 · ${aiAnalyzeTarget?.name ?? ''} (${aiAnalyzeTarget?.code ?? ''})`"
      width="720px"
      destroy-on-close
      class="ai-dialog"
    >
      <el-skeleton v-if="aiAnalyzeLoading" :rows="8" animated />
      <template v-else>
        <el-empty v-if="!aiAnalyzeResult" description="暂无结果" />
        <div v-else class="ai-block">
          <div class="ai-row">
            <div class="ai-label">结论</div>
            <div class="ai-value">{{ aiAnalyzeResult.summary }}</div>
          </div>
          <div class="ai-row">
            <div class="ai-label">方向</div>
            <div class="ai-value">{{ aiAnalyzeResult.bias }}</div>
          </div>
          <div class="ai-row">
            <div class="ai-label">要点</div>
            <div class="ai-value">
              <ul>
                <li v-for="(x, i) in aiAnalyzeResult.keyObservations" :key="i">
                  {{ x }}
                </li>
              </ul>
            </div>
          </div>
          <div class="ai-row">
            <div class="ai-label">关键位</div>
            <div class="ai-value">
              <div>
                <b>支撑：</b>{{ aiAnalyzeResult.levels.support.join("，") }}
              </div>
              <div>
                <b>压力：</b>{{ aiAnalyzeResult.levels.resistance.join("，") }}
              </div>
            </div>
          </div>
          <div class="ai-row">
            <div class="ai-label">计划</div>
            <div class="ai-value">
              <div><b>入场：</b>{{ aiAnalyzeResult.plan.entry }}</div>
              <div>
                <b>止损/无效：</b>{{ aiAnalyzeResult.plan.invalidation }}
              </div>
              <div><b>止盈：</b>{{ aiAnalyzeResult.plan.takeProfit }}</div>
              <div><b>仓位：</b>{{ aiAnalyzeResult.plan.positionSizing }}</div>
            </div>
          </div>
          <div class="ai-row">
            <div class="ai-label">风险</div>
            <div class="ai-value">
              <ul>
                <li v-for="(x, i) in aiAnalyzeResult.risks" :key="i">
                  {{ x }}
                </li>
              </ul>
            </div>
          </div>
          <div class="ai-disclaimer">{{ aiAnalyzeResult.disclaimer }}</div>
        </div>
        <el-divider />
        <div class="ai-history">
          <div class="ai-history-head">
            <div class="ai-history-title">历史记录（仅当前股票）</div>
            <el-button
              link
              type="danger"
              size="small"
              :disabled="!aiAnalyzeHistoryForCurrentStock.length"
              @click="clearAiAnalyzeHistory"
            >
              清空
            </el-button>
          </div>
          <el-empty
            v-if="!aiAnalyzeHistoryForCurrentStock.length"
            description="暂无该股票的历史"
          />
          <div v-else class="ai-history-list">
            <div
              v-for="item in aiAnalyzeHistoryForCurrentStock"
              :key="item.id"
              class="ai-history-item"
            >
              <div class="ai-history-main">
                <div class="ai-history-title-row">
                  <b
                    >{{ item.params.stock.name }} ({{
                      item.params.stock.code
                    }})</b
                  >
                  <span class="muted">{{ formatDateTime(item.ts) }}</span>
                </div>
                <div class="muted">
                  周期 {{ formatHorizon(item.params.horizon) }} · 风险
                  {{ formatRisk(item.params.riskProfile) }}
                </div>
              </div>
              <el-button size="small" @click="applyAiAnalyzeHistory(item)">
                查看
              </el-button>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <el-button @click="aiAnalyzeModal = false">关闭</el-button>
        <el-button
          type="primary"
          :loading="aiAnalyzeLoading"
          :disabled="!aiAnalyzeTarget"
          @click="runAiAnalyze"
        >
          开始分析
        </el-button>
      </template>
    </el-dialog>

    <!-- K线图 -->
    <el-dialog
      v-model="klineModal"
      :title="`K线图 · ${klineStock?.name ?? ''} (${klineStock?.code ?? ''})`"
      width="860px"
      destroy-on-close
    >
      <div class="kline-controls">
        <el-radio-group v-model="klinePeriod" size="small">
          <el-radio-button label="min">分时</el-radio-button>
          <el-radio-button label="daily">日K</el-radio-button>
          <el-radio-button label="weekly">周K</el-radio-button>
          <el-radio-button label="monthly">月K</el-radio-button>
        </el-radio-group>
        <el-button size="small" @click="refreshKline">刷新</el-button>
      </div>
      <div class="kline-wrap">
        <el-image
          v-if="klineUrl"
          :src="klineUrl"
          fit="contain"
          class="kline-image"
        >
          <template #error>
            <div class="muted">K线加载失败</div>
          </template>
        </el-image>
        <el-empty v-else description="暂无数据" />
      </div>
      <div class="trade-tools">
        <div class="trade-block">
          <div class="trade-title">交易提示</div>
          <el-empty v-if="!klineSignals.length" description="暂无明显信号" />
          <ul v-else>
            <li v-for="(s, i) in klineSignals" :key="i">{{ s }}</li>
          </ul>
        </div>
        <div class="trade-block">
          <div class="trade-title">一键下单辅助</div>
          <div class="trade-controls">
            <div class="trade-control">
              <span class="muted">止损%</span>
              <el-input-number
                v-model="tradeRiskPct"
                :min="0"
                :max="20"
                :step="0.5"
              />
            </div>
            <div class="trade-control">
              <span class="muted">止盈%</span>
              <el-input-number
                v-model="tradeTakePct"
                :min="0"
                :max="50"
                :step="1"
              />
            </div>
          </div>
          <div class="trade-rows" v-if="tradePlan">
            <div><b>基准价：</b>{{ formatMoney(tradePlan.basePrice) }}</div>
            <div><b>止损价：</b>{{ formatMoney(tradePlan.stopPrice) }}</div>
            <div><b>止盈价：</b>{{ formatMoney(tradePlan.takePrice) }}</div>
            <div class="muted">
              预估盈亏（每股）：{{ tradePlan.perShareLoss }}/{{
                tradePlan.perShareGain
              }}
            </div>
            <div v-if="tradePlan.totalLoss != null" class="muted">
              预估盈亏（持仓）：{{ tradePlan.totalLoss }}/{{
                tradePlan.totalGain
              }}
            </div>
          </div>
          <el-empty v-else description="暂无基准价" />
        </div>
      </div>
    </el-dialog>

    <!-- AI 选股 -->
    <el-dialog
      v-model="aiPickModal"
      title="AI 选股（基于当前自选列表）"
      width="780px"
      destroy-on-close
      class="ai-dialog"
    >
      <div class="ai-pick-controls">
        <el-form inline>
          <el-form-item label="TopN">
            <el-input-number v-model="aiPickTopN" :min="1" :max="10" />
          </el-form-item>
          <el-form-item label="周期">
            <el-select v-model="aiPickHorizon" style="width: 180px">
              <el-option label="短线 1-5 天" value="swing_1_5_days" />
              <el-option label="波段 1-4 周" value="swing_1_4_weeks" />
            </el-select>
          </el-form-item>
          <el-form-item label="风险">
            <el-select v-model="aiPickRisk" style="width: 140px">
              <el-option label="低" value="low" />
              <el-option label="中" value="medium" />
              <el-option label="高" value="high" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              :loading="aiPickLoading"
              @click="runAiPick"
            >
              开始计算
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <el-skeleton v-if="aiPickLoading" :rows="10" animated />
      <template v-else>
        <el-empty v-if="!aiPickResult" description="暂无结果" />
        <div v-else class="ai-block">
          <div
            v-for="p in aiPickResult.picks"
            :key="p.code"
            class="ai-pick-item"
          >
            <div class="ai-pick-head">
              <b>#{{ p.rank }} {{ p.name }} ({{ p.code }})</b>
              <span class="muted">{{ p.bias }}</span>
            </div>
            <ul>
              <li v-for="(r, i) in p.reason" :key="i">{{ r }}</li>
            </ul>
            <div class="ai-value">
              <div><b>入场：</b>{{ p.plan.entry }}</div>
              <div><b>止损/无效：</b>{{ p.plan.invalidation }}</div>
              <div><b>止盈：</b>{{ p.plan.takeProfit }}</div>
            </div>
            <div class="ai-value">
              <div><b>风险：</b>{{ p.riskNotes?.join("；") || "—" }}</div>
            </div>
            <el-divider />
          </div>
          <div class="ai-disclaimer">{{ aiPickResult.disclaimer }}</div>
        </div>
      </template>
      <el-divider />
      <div class="ai-history">
        <div class="ai-history-head">
          <div class="ai-history-title">历史记录</div>
          <el-button
            link
            type="danger"
            size="small"
            :disabled="!aiPickHistory.length"
            @click="clearAiPickHistory"
          >
            清空
          </el-button>
        </div>
        <el-empty v-if="!aiPickHistory.length" description="暂无历史" />
        <div v-else class="ai-history-list">
          <div
            v-for="item in aiPickHistory"
            :key="item.id"
            class="ai-history-item"
          >
            <div class="ai-history-main">
              <div class="ai-history-title-row">
                <b>AI 选股</b>
                <span class="muted">{{ formatDateTime(item.ts) }}</span>
              </div>
              <div class="muted">
                Top{{ item.params.topN }} · 周期
                {{ formatHorizon(item.params.horizon) }} · 风险
                {{ formatRisk(item.params.riskProfile) }} · 候选
                {{ item.params.candidates }}
              </div>
            </div>
            <el-button size="small" @click="applyAiPickHistory(item)">
              查看
            </el-button>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 板块最强（盘中） -->
    <el-dialog
      v-model="aiSectorModal"
      title="板块最强（A股）"
      width="820px"
      destroy-on-close
      class="ai-dialog"
    >
      <el-skeleton v-if="aiSectorLoading" :rows="12" animated />
      <template v-else>
        <el-empty v-if="!aiSectorResult" description="暂无结果" />
        <div v-else class="ai-block">
          <div
            class="ai-row"
            v-for="s in aiSectorResult.bestSectors"
            :key="s.code"
          >
            <div class="ai-label">#{{ s.rank }} {{ s.name }}</div>
            <div class="ai-value">
              <div class="muted">{{ s.kind }} · {{ s.code }}</div>
              <ul>
                <li v-for="(x, i) in s.whyHot" :key="i">{{ x }}</li>
              </ul>
              <div class="muted">风险：{{ s.riskNotes?.join("；") }}</div>
            </div>
          </div>

          <el-divider />
          <div v-if="aiSectorResult.openCandidates?.length" class="ai-block">
            <div class="ai-label">建议关注/开仓候选</div>
            <div
              v-for="p in aiSectorResult.openCandidates"
              :key="p.code"
              class="ai-pick-item"
            >
              <div class="ai-pick-head">
                <b>#{{ p.rank }} {{ p.name }} ({{ p.code }})</b>
              </div>
              <ul>
                <li v-for="(r, i) in p.reason" :key="i">{{ r }}</li>
              </ul>
              <div class="ai-value">
                <div><b>入场：</b>{{ p.plan.entry }}</div>
                <div><b>止损/无效：</b>{{ p.plan.invalidation }}</div>
                <div><b>止盈：</b>{{ p.plan.takeProfit }}</div>
              </div>
              <div class="ai-value">
                <b>风险：</b>{{ p.riskNotes?.join("；") || "—" }}
              </div>
              <el-divider />
            </div>
          </div>

          <div class="ai-disclaimer">{{ aiSectorResult.disclaimer }}</div>
        </div>
      </template>
      <el-divider />
      <div class="ai-history">
        <div class="ai-history-head">
          <div class="ai-history-title">历史记录</div>
          <el-button
            link
            type="danger"
            size="small"
            :disabled="!aiSectorHistory.length"
            @click="clearAiSectorHistory"
          >
            清空
          </el-button>
        </div>
        <el-empty v-if="!aiSectorHistory.length" description="暂无历史" />
        <div v-else class="ai-history-list">
          <div
            v-for="item in aiSectorHistory"
            :key="item.id"
            class="ai-history-item"
          >
            <div class="ai-history-main">
              <div class="ai-history-title-row">
                <b>板块最强</b>
                <span class="muted">{{ formatDateTime(item.ts) }}</span>
              </div>
              <div class="muted">
                Top板块 {{ item.params.topSectorN }} · Top个股
                {{ item.params.topStockN }} · 周期
                {{ formatHorizon(item.params.horizon) }} · 风险
                {{ formatRisk(item.params.riskProfile) }}
              </div>
            </div>
            <el-button size="small" @click="applyAiSectorHistory(item)">
              查看
            </el-button>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="aiSectorModal = false">关闭</el-button>
        <el-button
          type="primary"
          :loading="aiSectorLoading"
          @click="runAiSectorNow"
        >
          刷新
        </el-button>
      </template>
    </el-dialog>

    <!-- 收盘复盘 -->
    <el-dialog
      v-model="aiAfterCloseModal"
      title="收盘复盘（A股）"
      width="820px"
      destroy-on-close
      class="ai-dialog"
    >
      <el-skeleton v-if="aiAfterCloseLoading" :rows="12" animated />
      <template v-else>
        <el-empty v-if="!aiAfterCloseResult" description="暂无结果" />
        <div v-else class="ai-block">
          <div
            class="ai-row"
            v-for="s in aiAfterCloseResult.hotSectors"
            :key="s.code"
          >
            <div class="ai-label">#{{ s.rank }} {{ s.name }}</div>
            <div class="ai-value">
              <div class="muted">{{ s.kind }} · {{ s.code }}</div>
              <ul>
                <li v-for="(x, i) in s.whyHot" :key="i">{{ x }}</li>
              </ul>
              <div class="muted">风险：{{ s.riskNotes?.join("；") }}</div>
            </div>
          </div>
          <el-divider />
          <div
            v-if="aiAfterCloseResult.openCandidates?.length"
            class="ai-block"
          >
            <div class="ai-label">建议关注/开仓候选</div>
            <div
              v-for="p in aiAfterCloseResult.openCandidates"
              :key="p.code"
              class="ai-pick-item"
            >
              <div class="ai-pick-head">
                <b>#{{ p.rank }} {{ p.name }} ({{ p.code }})</b>
              </div>
              <ul>
                <li v-for="(r, i) in p.reason" :key="i">{{ r }}</li>
              </ul>
              <div class="ai-value">
                <div><b>入场：</b>{{ p.plan.entry }}</div>
                <div><b>止损/无效：</b>{{ p.plan.invalidation }}</div>
                <div><b>止盈：</b>{{ p.plan.takeProfit }}</div>
              </div>
              <div class="ai-value">
                <b>风险：</b>{{ p.riskNotes?.join("；") || "—" }}
              </div>
              <el-divider />
            </div>
          </div>
          <div class="ai-disclaimer">{{ aiAfterCloseResult.disclaimer }}</div>
        </div>
      </template>
      <el-divider />
      <div class="ai-history">
        <div class="ai-history-head">
          <div class="ai-history-title">历史记录</div>
          <el-button
            link
            type="danger"
            size="small"
            :disabled="!aiAfterCloseHistory.length"
            @click="clearAiAfterCloseHistory"
          >
            清空
          </el-button>
        </div>
        <el-empty v-if="!aiAfterCloseHistory.length" description="暂无历史" />
        <div v-else class="ai-history-list">
          <div
            v-for="item in aiAfterCloseHistory"
            :key="item.id"
            class="ai-history-item"
          >
            <div class="ai-history-main">
              <div class="ai-history-title-row">
                <b>收盘复盘</b>
                <span class="muted">{{ formatDateTime(item.ts) }}</span>
              </div>
              <div class="muted">
                Top板块 {{ item.params.topSectorN }} · Top个股
                {{ item.params.topStockN }} · 周期
                {{ formatHorizon(item.params.horizon) }} · 风险
                {{ formatRisk(item.params.riskProfile) }}
              </div>
            </div>
            <el-button size="small" @click="applyAiAfterCloseHistory(item)">
              查看
            </el-button>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="aiAfterCloseModal = false">关闭</el-button>
        <el-button
          type="primary"
          :loading="aiAfterCloseLoading"
          @click="runAiAfterClose"
        >
          刷新
        </el-button>
      </template>
    </el-dialog>

    <!-- 条件选股 -->
    <el-dialog
      v-model="aiScreenModal"
      title="条件选股（A股）"
      width="860px"
      destroy-on-close
      class="ai-dialog"
    >
      <div style="margin-bottom: 12px">
        <el-form inline>
          <el-form-item label="候选范围">
            <el-input-number v-model="aiScreenLimit" :min="50" :max="500" />
          </el-form-item>
          <el-form-item label="条件">
            <el-input
              v-model="aiScreenQuery"
              placeholder="例如：近3天强势，成交额放大，今日回踩不破，适合短线"
              style="width: 520px"
              clearable
            />
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              :loading="aiScreenLoading"
              @click="runAiScreen"
            >
              开始选股
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <el-skeleton v-if="aiScreenLoading" :rows="10" animated />
      <template v-else>
        <el-empty v-if="!aiScreenResult" description="暂无结果" />
        <div v-else class="ai-block">
          <div class="ai-row" v-if="aiScreenResult.interpretation">
            <div class="ai-label">理解</div>
            <div class="ai-value">
              <div>
                <b>必须：</b
                >{{ aiScreenResult.interpretation.must?.join("；") }}
              </div>
              <div>
                <b>偏好：</b
                >{{ aiScreenResult.interpretation.prefer?.join("；") }}
              </div>
              <div>
                <b>避免：</b
                >{{ aiScreenResult.interpretation.avoid?.join("；") }}
              </div>
            </div>
          </div>

          <div
            v-for="p in aiScreenResult.picks"
            :key="p.code"
            class="ai-pick-item"
          >
            <div class="ai-pick-head">
              <b>#{{ p.rank }} {{ p.name }} ({{ p.code }})</b>
            </div>
            <ul>
              <li v-for="(r, i) in p.reason" :key="i">{{ r }}</li>
            </ul>
            <div class="ai-value">
              <div><b>入场：</b>{{ p.plan.entry }}</div>
              <div><b>止损/无效：</b>{{ p.plan.invalidation }}</div>
              <div><b>止盈：</b>{{ p.plan.takeProfit }}</div>
            </div>
            <div class="ai-value">
              <b>风险：</b>{{ p.riskNotes?.join("；") || "—" }}
            </div>
            <el-divider />
          </div>

          <div class="ai-disclaimer">{{ aiScreenResult.disclaimer }}</div>
        </div>
      </template>
      <el-divider />
      <div class="ai-history">
        <div class="ai-history-head">
          <div class="ai-history-title">历史记录</div>
          <el-button
            link
            type="danger"
            size="small"
            :disabled="!aiScreenHistory.length"
            @click="clearAiScreenHistory"
          >
            清空
          </el-button>
        </div>
        <el-empty v-if="!aiScreenHistory.length" description="暂无历史" />
        <div v-else class="ai-history-list">
          <div
            v-for="item in aiScreenHistory"
            :key="item.id"
            class="ai-history-item"
          >
            <div class="ai-history-main">
              <div class="ai-history-title-row">
                <b>条件选股</b>
                <span class="muted">{{ formatDateTime(item.ts) }}</span>
              </div>
              <div class="muted">候选范围 {{ item.params.limit }}</div>
              <div class="ai-history-query">{{ item.params.query }}</div>
            </div>
            <el-button size="small" @click="applyAiScreenHistory(item)">
              查看
            </el-button>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from "vue";
import { ElMessage } from "element-plus";
import { ArrowDown } from "@element-plus/icons-vue";
let searchTimer: ReturnType<typeof setTimeout> | null = null;
import StockSearch from "./components/StockSearch.vue";
import StockTable from "./components/StockTable.vue";
import QuantPanel from "./components/QuantPanel.vue";
import {
  fetchStockList,
  fetchNews,
  searchStock,
  searchItemToCode,
} from "./api/stock";
import {
  aiAnalyzeStock as aiAnalyzeStockApi,
  aiPickStocks,
  aiSectorNow,
  aiAfterClose,
  aiScreenStocks,
} from "./api/ai";
import type {
  AiAnalyzeResult,
  AiPickResult,
  AiSectorNowResult,
  AiAfterCloseResult,
  AiScreenResult,
} from "./api/ai";
import type {
  StockItem,
  SearchItem,
  StockPriceItem,
  SortType,
  NewsItem,
} from "./types/stock";
import { SORT_LABELS } from "./types/stock";

type StockGroup = {
  id: string;
  name: string;
  codes: string[];
};

type AlertRule = {
  id: string;
  code: string;
  name?: string;
  type: "price" | "percent";
  operator: ">=" | "<=";
  value: number;
  enabled: boolean;
  lastTriggered?: number;
};

type AiHistoryItem<T, P = Record<string, any>> = {
  id: string;
  ts: number;
  params: P;
  result: T;
};

const STORAGE_KEY = "vue-stock-viewer-codes";
const STORAGE_GROUP_KEY = "vue-stock-viewer-groups";
const STORAGE_PRICE_KEY = "vue-stock-viewer-stockPrice";
const STORAGE_ALERT_KEY = "vue-stock-viewer-alerts";
const STORAGE_HIDE_VALUE_KEY = "vue-stock-viewer-hideMarketValue";
const STORAGE_HOLDING_FILTER_KEY = "vue-stock-viewer-holdingFilter";
const STORAGE_AI_ANALYZE_HISTORY_KEY = "vue-stock-viewer-aiAnalyzeHistory";
const STORAGE_AI_PICK_HISTORY_KEY = "vue-stock-viewer-aiPickHistory";
const STORAGE_AI_SECTOR_HISTORY_KEY = "vue-stock-viewer-aiSectorHistory";
const STORAGE_AI_AFTER_CLOSE_HISTORY_KEY =
  "vue-stock-viewer-aiAfterCloseHistory";
const STORAGE_AI_SCREEN_HISTORY_KEY = "vue-stock-viewer-aiScreenHistory";
const ALL_GROUP_ID = "__all__";
const ALERT_COOLDOWN = 3 * 60 * 1000;
const AI_HISTORY_LIMIT = 20;

const searchKeyword = ref("");
const searchLoading = ref(false);
const searchSuggestions = ref<SearchItem[]>([]);
const stockList = ref<StockItem[]>([]);
const groups = ref<StockGroup[]>([]);
const currentGroupId = ref<string>(ALL_GROUP_ID);
const loading = ref(false);
const sortType = ref<SortType>(0);
const stockPrice = ref<Record<string, StockPriceItem>>({});
const alerts = ref<AlertRule[]>([]);
const newsList = ref<NewsItem[]>([]);
const newsLoading = ref(false);
const newsLastUpdate = ref<number | null>(null);
const alertForm = ref({
  code: "",
  type: "price" as AlertRule["type"],
  operator: ">=" as AlertRule["operator"],
  value: 0,
});
const groupManageModal = ref(false);
const newGroupName = ref("");
const groupDrafts = ref<Record<string, string>>({});
const hideMarketValue = ref(false);
const toolsTab = ref<"overview" | "alerts" | "news" | "quant">("overview");
const toolsCollapsed = ref(false);
const isH5 = ref(false);
function checkH5() {
  const h5 = window.innerWidth <= 768;
  if (h5 && !isH5.value) toolsCollapsed.value = true;
  isH5.value = h5;
  document.body.classList.toggle("h5", h5);
}
const holdingFilter = ref<"all" | "holding" | "not_holding">("all");
const groupAssignModal = ref(false);
const groupAssignStock = ref<StockItem | null>(null);
const groupAssignId = ref<string>("");
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

// AI
const aiAnalyzeModal = ref(false);
const aiAnalyzeLoading = ref(false);
const aiAnalyzeTarget = ref<StockItem | null>(null);
const aiAnalyzeResult = ref<AiAnalyzeResult | null>(null);
const aiAnalyzeHistory = ref<
  AiHistoryItem<
    AiAnalyzeResult,
    { stock: StockItem; horizon: string; riskProfile: string }
  >[]
>([]);

const klineModal = ref(false);
const klineStock = ref<StockItem | null>(null);
const klinePeriod = ref<"min" | "daily" | "weekly" | "monthly">("daily");
const klineRefreshKey = ref(0);
const tradeRiskPct = ref(3);
const tradeTakePct = ref(6);

const aiPickModal = ref(false);
const aiPickLoading = ref(false);
const aiPickResult = ref<AiPickResult | null>(null);
const aiPickHistory = ref<
  AiHistoryItem<
    AiPickResult,
    { topN: number; horizon: string; riskProfile: string; candidates: number }
  >[]
>([]);
const aiPickTopN = ref(3);
const aiPickHorizon = ref("swing_1_5_days");
const aiPickRisk = ref("medium");

// AI · A股板块/条件选股
const aiSectorModal = ref(false);
const aiSectorLoading = ref(false);
const aiSectorResult = ref<AiSectorNowResult | null>(null);
const aiSectorHistory = ref<
  AiHistoryItem<
    AiSectorNowResult,
    {
      topSectorN: number;
      topStockN: number;
      horizon: string;
      riskProfile: string;
    }
  >[]
>([]);

const aiAfterCloseModal = ref(false);
const aiAfterCloseLoading = ref(false);
const aiAfterCloseResult = ref<AiAfterCloseResult | null>(null);
const aiAfterCloseHistory = ref<
  AiHistoryItem<
    AiAfterCloseResult,
    {
      topSectorN: number;
      topStockN: number;
      horizon: string;
      riskProfile: string;
    }
  >[]
>([]);

const aiScreenModal = ref(false);
const aiScreenLoading = ref(false);
const aiScreenQuery = ref("");
const aiScreenResult = ref<AiScreenResult | null>(null);
const aiScreenLimit = ref(200);
const aiScreenHistory = ref<
  AiHistoryItem<
    AiScreenResult,
    { query: string; limit: number; horizon: string; riskProfile: string }
  >[]
>([]);

function createGroupId() {
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function createHistoryId() {
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function ensureDefaultGroup() {
  if (!groups.value.length) {
    groups.value = [
      {
        id: createGroupId(),
        name: "自选",
        codes: [],
      },
    ];
  }
}

function loadGroups() {
  try {
    const raw = localStorage.getItem(STORAGE_GROUP_KEY);
    if (raw) {
      groups.value = JSON.parse(raw);
      ensureDefaultGroup();
      return;
    }
  } catch {
    groups.value = [];
  }
  // 兼容旧版本 codes 存储
  try {
    const legacyRaw = localStorage.getItem(STORAGE_KEY);
    const legacyCodes = legacyRaw ? JSON.parse(legacyRaw) : [];
    groups.value = [
      {
        id: createGroupId(),
        name: "自选",
        codes: Array.isArray(legacyCodes) ? legacyCodes : [],
      },
    ];
  } catch {
    groups.value = [];
  }
  ensureDefaultGroup();
  saveGroups();
}

function loadStockPrice() {
  try {
    const raw = localStorage.getItem(STORAGE_PRICE_KEY);
    stockPrice.value = raw ? JSON.parse(raw) : {};
  } catch {
    stockPrice.value = {};
  }
}

function loadAlerts() {
  try {
    const raw = localStorage.getItem(STORAGE_ALERT_KEY);
    alerts.value = raw ? JSON.parse(raw) : [];
  } catch {
    alerts.value = [];
  }
}

function loadViewSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_HIDE_VALUE_KEY);
    hideMarketValue.value = raw ? JSON.parse(raw) : false;
  } catch {
    hideMarketValue.value = false;
  }
  try {
    const raw = localStorage.getItem(STORAGE_HOLDING_FILTER_KEY);
    holdingFilter.value = raw ? JSON.parse(raw) : "all";
  } catch {
    holdingFilter.value = "all";
  }
}

function saveViewSettings() {
  localStorage.setItem(
    STORAGE_HIDE_VALUE_KEY,
    JSON.stringify(!!hideMarketValue.value),
  );
  localStorage.setItem(
    STORAGE_HOLDING_FILTER_KEY,
    JSON.stringify(holdingFilter.value),
  );
}

function readHistory<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAiHistory() {
  localStorage.setItem(
    STORAGE_AI_ANALYZE_HISTORY_KEY,
    JSON.stringify(aiAnalyzeHistory.value),
  );
  localStorage.setItem(
    STORAGE_AI_PICK_HISTORY_KEY,
    JSON.stringify(aiPickHistory.value),
  );
  localStorage.setItem(
    STORAGE_AI_SECTOR_HISTORY_KEY,
    JSON.stringify(aiSectorHistory.value),
  );
  localStorage.setItem(
    STORAGE_AI_AFTER_CLOSE_HISTORY_KEY,
    JSON.stringify(aiAfterCloseHistory.value),
  );
  localStorage.setItem(
    STORAGE_AI_SCREEN_HISTORY_KEY,
    JSON.stringify(aiScreenHistory.value),
  );
}

function loadAiHistory() {
  aiAnalyzeHistory.value = readHistory(STORAGE_AI_ANALYZE_HISTORY_KEY);
  aiPickHistory.value = readHistory(STORAGE_AI_PICK_HISTORY_KEY);
  aiSectorHistory.value = readHistory(STORAGE_AI_SECTOR_HISTORY_KEY);
  aiAfterCloseHistory.value = readHistory(STORAGE_AI_AFTER_CLOSE_HISTORY_KEY);
  aiScreenHistory.value = readHistory(STORAGE_AI_SCREEN_HISTORY_KEY);
}

function saveGroups() {
  localStorage.setItem(STORAGE_GROUP_KEY, JSON.stringify(groups.value));
}

function saveStockPrice() {
  localStorage.setItem(STORAGE_PRICE_KEY, JSON.stringify(stockPrice.value));
}

function saveAlerts() {
  localStorage.setItem(STORAGE_ALERT_KEY, JSON.stringify(alerts.value));
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
    let todayEarnings: number | undefined;
    if (amount > 0 && unitPrice > 0 && !isSellOut) {
      const cost = amount * unitPrice;
      const current = amount * priceNum;
      earnings = current - cost;
      earningPercent = cost ? (earnings / cost) * 100 : 0;
    }
    if (amount > 0 && todayUnitPrice > 0 && !isSellOut) {
      todayEarnings = amount * (priceNum - todayUnitPrice);
    }
    return {
      ...row,
      heldAmount: amount,
      heldPrice: unitPrice,
      todayHeldPrice: todayUnitPrice,
      isSellOut,
      earnings,
      earningPercent,
      todayEarnings,
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

const allCodes = computed(() => {
  const set = new Set<string>();
  groups.value.forEach((group) => {
    group.codes.forEach((code) => set.add(code.toLowerCase()));
  });
  return [...set];
});

const currentGroupCodes = computed(() => {
  if (currentGroupId.value === ALL_GROUP_ID) return allCodes.value;
  const group = groups.value.find((item) => item.id === currentGroupId.value);
  return group ? group.codes.map((c) => c.toLowerCase()) : [];
});

const displayList = computed(() => {
  const merged = mergeHeldAndEarnings(stockList.value);
  const codeSet = new Set(currentGroupCodes.value.map((c) => c.toLowerCase()));
  const inGroup =
    currentGroupId.value === ALL_GROUP_ID
      ? merged
      : merged.filter((row) => codeSet.has(row.code.toLowerCase()));
  const filtered = inGroup.filter((row) => {
    const hasHolding = !!row.heldAmount && row.heldAmount > 0 && !row.isSellOut;
    if (holdingFilter.value === "holding") return hasHolding;
    if (holdingFilter.value === "not_holding") return !hasHolding;
    return true;
  });
  return sortList(filtered);
});

/** 当前打开 AI 分析弹框的股票对应的历史记录（按股票代码过滤） */
const aiAnalyzeHistoryForCurrentStock = computed(() => {
  const target = aiAnalyzeTarget.value;
  if (!target?.code) return [];
  const codeLower = target.code.toLowerCase();
  return aiAnalyzeHistory.value.filter(
    (item) => (item.params.stock?.code || "").toLowerCase() === codeLower,
  );
});

const klineUrl = computed(() => {
  if (!klineStock.value) return "";
  return buildKlineUrl(
    klineStock.value,
    klinePeriod.value,
    klineRefreshKey.value,
  );
});

const klineSignals = computed(() => {
  if (!klineStock.value) return [];
  const price = parseNum(klineStock.value.price);
  const high = parseNum(klineStock.value.high);
  const low = parseNum(klineStock.value.low);
  const open = parseNum(klineStock.value.open);
  const yest = parseNum(klineStock.value.yestclose);
  if (!price) return [];
  const tips: string[] = [];
  const near = (a: number, b: number, pct = 0.5) =>
    b > 0 && Math.abs(a - b) / b <= pct / 100;
  if (high && price >= high) tips.push("突破日内高点，注意追高与回撤风险");
  else if (high && near(price, high)) tips.push("接近日内高点，关注放量突破");
  if (low && price <= low) tips.push("跌破日内低点，谨防继续下行");
  else if (low && near(price, low)) tips.push("接近日内低点，观察止跌反弹");
  if (open && price > open && yest && price < yest)
    tips.push("日内转强但仍在昨收下，关注是否回补缺口");
  if (open && price < open && yest && price > yest)
    tips.push("日内走弱但仍在昨收上，关注回踩支撑");
  return tips;
});

const tradePlan = computed(() => {
  if (!klineStock.value) return null;
  const price = parseNum(klineStock.value.price);
  const heldPrice = klineStock.value.heldPrice ?? 0;
  const base = heldPrice > 0 ? heldPrice : price;
  if (!base) return null;
  const risk = Math.max(0, Number(tradeRiskPct.value) || 0);
  const take = Math.max(0, Number(tradeTakePct.value) || 0);
  const stopPrice = base * (1 - risk / 100);
  const takePrice = base * (1 + take / 100);
  const perShareLoss = formatMoney(base - stopPrice);
  const perShareGain = formatMoney(takePrice - base);
  const amount =
    klineStock.value.heldAmount && klineStock.value.heldAmount > 0
      ? klineStock.value.heldAmount
      : 0;
  const totalLoss = amount ? formatMoney((base - stopPrice) * amount) : null;
  const totalGain = amount ? formatMoney((takePrice - base) * amount) : null;
  return {
    basePrice: base,
    stopPrice,
    takePrice,
    perShareLoss,
    perShareGain,
    totalLoss,
    totalGain,
  };
});

const alertStockOptions = computed(() =>
  stockList.value.map((item) => ({
    code: item.code,
    name: item.name,
  })),
);

const portfolioSummary = computed(() => {
  const list = mergeHeldAndEarnings(stockList.value);
  let totalCost = 0;
  let currentValue = 0;
  let todayCost = 0;
  let holdingCount = 0;
  list.forEach((row) => {
    if (!row.heldAmount || row.heldAmount <= 0 || row.isSellOut) return;
    const amount = row.heldAmount;
    const price = parseFloat(row.price || "0") || 0;
    const cost = amount * (row.heldPrice || 0);
    totalCost += cost;
    currentValue += amount * price;
    holdingCount += 1;
    if (row.todayHeldPrice && row.todayHeldPrice > 0) {
      todayCost += amount * row.todayHeldPrice;
    }
  });
  const totalEarnings = currentValue - totalCost;
  const totalPct = totalCost ? (totalEarnings / totalCost) * 100 : 0;
  const todayEarnings = todayCost ? currentValue - todayCost : 0;
  return {
    totalCost,
    currentValue,
    totalEarnings,
    totalPct,
    todayEarnings,
    holdingCount,
  };
});

function cycleSort() {
  if (sortType.value === 0) sortType.value = -1;
  else if (sortType.value === -1) sortType.value = 1;
  else sortType.value = 0;
}

function formatMoney(v: number) {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v || 0);
}

function formatSigned(v: number, suffix = "") {
  if (!v) return `0${suffix}`;
  const sign = v > 0 ? "+" : "";
  return `${sign}${formatMoney(v)}${suffix}`;
}

function parseNum(v?: string | number): number {
  if (v == null || v === "") return 0;
  const n = Number.parseFloat(String(v).replace(/,/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function buildKlineUrl(
  stock: StockItem,
  period: "min" | "daily" | "weekly" | "monthly",
  refreshKey: number,
) {
  const code = (stock.code || "").toLowerCase();
  if (!code) return "";
  const normal = "https://image.sinajs.cn/newchart";
  const usstock = "https://image.sinajs.cn/newchart/v5/usstock";
  const hkstock = "https://image.sinajs.cn/newchart/hk_stock";
  const cnFuture = "https://image.sinajs.cn/newchart/v5/futures/china";
  const suffix = refreshKey ? `?v=${refreshKey}` : "";
  if (code.startsWith("hk")) {
    const symbol = code.replace(/^hk/, "");
    return `${hkstock}/${period}/${symbol}.gif${suffix}`;
  }
  if (code.startsWith("usr_")) {
    const symbol = code.replace(/^usr_/, "");
    return `${usstock}/${period}/${symbol}.gif${suffix}`;
  }
  if (code.startsWith("nf_")) {
    const symbol = code.replace(/^nf_/, "");
    return `${cnFuture}/${period}/${symbol}.gif${suffix}`;
  }
  return `${normal}/${period}/n/${code}.gif${suffix}`;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

function formatNewsTime(pubDate?: string) {
  if (!pubDate) return "—";
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return pubDate;
  return `${d.getMonth() + 1}/${d.getDate()} ${d
    .getHours()
    .toString()
    .padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function formatDateTime(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day} ${formatTime(ts)}`;
}

function formatHorizon(value: string) {
  if (value === "swing_1_5_days") return "短线 1-5 天";
  if (value === "swing_1_4_weeks") return "波段 1-4 周";
  return value || "—";
}

function formatRisk(value: string) {
  if (value === "low") return "低";
  if (value === "medium") return "中";
  if (value === "high") return "高";
  return value || "—";
}

function formatAlertCondition(alert: AlertRule) {
  const label = alert.type === "price" ? "价格" : "涨跌幅";
  const value =
    alert.type === "price" ? formatMoney(alert.value) : `${alert.value}%`;
  return `${label} ${alert.operator} ${value}`;
}

function formatAlertLastTime(ts?: number) {
  if (!ts) return "—";
  return formatTime(ts);
}

function updateGroupDrafts() {
  const next: Record<string, string> = {};
  groups.value.forEach((group) => {
    next[group.id] = group.name;
  });
  groupDrafts.value = next;
}

function addGroup() {
  const name = newGroupName.value.trim();
  if (!name) return;
  groups.value = [...groups.value, { id: createGroupId(), name, codes: [] }];
  newGroupName.value = "";
  saveGroups();
  updateGroupDrafts();
}

function renameGroup(groupId: string) {
  const name = (groupDrafts.value[groupId] || "").trim();
  if (!name) return;
  groups.value = groups.value.map((group) =>
    group.id === groupId ? { ...group, name } : group,
  );
  saveGroups();
}

function removeGroup(groupId: string) {
  if (groups.value.length <= 1) return;
  groups.value = groups.value.filter((group) => group.id !== groupId);
  if (currentGroupId.value === groupId) {
    currentGroupId.value = ALL_GROUP_ID;
  }
  saveGroups();
  updateGroupDrafts();
}

function openGroupAssign(row: StockItem) {
  groupAssignStock.value = row;
  const owned = groups.value.find((group) =>
    group.codes.some((c) => c.toLowerCase() === row.code.toLowerCase()),
  );
  groupAssignId.value = owned?.id || groups.value[0]?.id || "";
  groupAssignModal.value = true;
}

function applyGroupAssign() {
  if (!groupAssignStock.value || !groupAssignId.value) return;
  const code = groupAssignStock.value.code.toLowerCase();
  groups.value = groups.value.map((group) => {
    const without = group.codes.filter((c) => c.toLowerCase() !== code);
    if (group.id === groupAssignId.value) {
      return { ...group, codes: [...without, code] };
    }
    return { ...group, codes: without };
  });
  saveGroups();
  groupAssignModal.value = false;
  groupAssignStock.value = null;
}

function closeGroupAssign() {
  groupAssignModal.value = false;
  groupAssignStock.value = null;
}

function requestNotificationPermission() {
  if (!("Notification" in window)) {
    ElMessage.warning("浏览器不支持桌面通知");
    return;
  }
  if (Notification.permission === "granted") {
    ElMessage.success("通知权限已开启");
    return;
  }
  Notification.requestPermission().then((result) => {
    if (result === "granted") ElMessage.success("已开启通知权限");
    else ElMessage.info("通知权限未开启");
  });
}

function addAlert() {
  const code = alertForm.value.code.trim();
  if (!code) return;
  const value = Number(alertForm.value.value);
  if (!Number.isFinite(value)) return;
  const exists = alerts.value.some(
    (item) =>
      item.code.toLowerCase() === code.toLowerCase() &&
      item.type === alertForm.value.type &&
      item.operator === alertForm.value.operator &&
      item.value === value,
  );
  if (exists) return;
  const name =
    stockList.value.find(
      (item) => item.code.toLowerCase() === code.toLowerCase(),
    )?.name || "";
  alerts.value = [
    ...alerts.value,
    {
      id: `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      code,
      name,
      type: alertForm.value.type,
      operator: alertForm.value.operator,
      value,
      enabled: true,
    },
  ];
  saveAlerts();
  alertForm.value = {
    code: "",
    type: "price",
    operator: ">=",
    value: 0,
  };
}

function removeAlert(id: string) {
  alerts.value = alerts.value.filter((item) => item.id !== id);
  saveAlerts();
}

function toggleAlert(alert: AlertRule, enabled: boolean) {
  alerts.value = alerts.value.map((item) =>
    item.id === alert.id ? { ...item, enabled } : item,
  );
  saveAlerts();
}

function checkAlertCondition(alert: AlertRule, row: StockItem) {
  if (alert.type === "price") {
    const price = parseFloat(row.price || "0") || 0;
    return alert.operator === ">="
      ? price >= alert.value
      : price <= alert.value;
  }
  const pct = parsePercent(row.percent || "0");
  return alert.operator === ">=" ? pct >= alert.value : pct <= alert.value;
}

function notifyAlert(alert: AlertRule, row: StockItem) {
  const title = `${row.name || alert.name || row.code}`;
  const body = `${formatAlertCondition(alert)}，当前 ${
    alert.type === "price" ? row.price || "—" : row.percent || "—"
  }`;
  ElMessage.success(body);
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

function checkAlerts(list: StockItem[]) {
  if (!alerts.value.length) return;
  const now = Date.now();
  const map = new Map(list.map((row) => [row.code.toLowerCase(), row]));
  let touched = false;
  alerts.value = alerts.value.map((alert) => {
    if (!alert.enabled) return alert;
    const row = map.get(alert.code.toLowerCase());
    if (!row) return alert;
    const last = alert.lastTriggered || 0;
    if (last && now - last < ALERT_COOLDOWN) return alert;
    if (!checkAlertCondition(alert, row)) return alert;
    touched = true;
    notifyAlert(alert, row);
    return { ...alert, lastTriggered: now };
  });
  if (touched) saveAlerts();
}

async function loadNews() {
  newsLoading.value = true;
  try {
    newsList.value = await fetchNews(20);
    newsLastUpdate.value = Date.now();
  } catch (e) {
    console.error(e);
  } finally {
    newsLoading.value = false;
  }
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
  if (!allCodes.value.length) {
    stockList.value = [];
    return;
  }
  if (!options?.background) loading.value = true;
  try {
    stockList.value = await fetchStockList(allCodes.value);
    lastUpdateTime.value = Date.now();
    checkAlerts(stockList.value);
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

function openKline(row: StockItem) {
  klineStock.value = row;
  klinePeriod.value = "daily";
  refreshKline();
  klineModal.value = true;
}

function refreshKline() {
  klineRefreshKey.value = Date.now();
}

function openAiAnalyze(row: StockItem) {
  aiAnalyzeTarget.value = row;
  aiAnalyzeResult.value = null;
  aiAnalyzeLoading.value = false;
  aiAnalyzeModal.value = true;
}

async function runAiAnalyze() {
  if (!aiAnalyzeTarget.value) {
    ElMessage.warning("请选择要分析的标的");
    return;
  }
  aiAnalyzeLoading.value = true;
  aiAnalyzeResult.value = null;
  try {
    const result = await aiAnalyzeStockApi({
      stock: aiAnalyzeTarget.value,
      horizon: aiPickHorizon.value,
      riskProfile: aiPickRisk.value,
    });
    aiAnalyzeResult.value = result;
    addAiAnalyzeHistory(
      {
        stock: aiAnalyzeTarget.value,
        horizon: aiPickHorizon.value,
        riskProfile: aiPickRisk.value,
      },
      result,
    );
  } catch (e) {
    console.error(e);
    ElMessage.error(
      "AI 分析失败：请检查 VOLCENGINE_API_KEY/模型ID 或服务是否可用",
    );
  } finally {
    aiAnalyzeLoading.value = false;
  }
}

// (aiAnalyzeStockApi 已在 import 中 alias)

function handleAiCommand(command: string) {
  if (command === "pick") openAiPickModal();
  else if (command === "sector") openAiSectorModal();
  else if (command === "afterClose") openAiAfterCloseModal();
  else if (command === "screen") openAiScreenModal();
}

function openAiPickModal() {
  aiPickModal.value = true;
  aiPickLoading.value = false;
}

async function runAiPick() {
  if (!displayList.value.length) {
    ElMessage.warning("自选列表为空，先添加一些候选标的");
    return;
  }
  aiPickLoading.value = true;
  aiPickResult.value = null;
  try {
    const result = await aiPickStocks({
      candidates: displayList.value,
      topN: aiPickTopN.value,
      horizon: aiPickHorizon.value,
      riskProfile: aiPickRisk.value,
    });
    aiPickResult.value = result;
    addAiPickHistory(
      {
        topN: aiPickTopN.value,
        horizon: aiPickHorizon.value,
        riskProfile: aiPickRisk.value,
        candidates: displayList.value.length,
      },
      result,
    );
  } catch (e) {
    console.error(e);
    ElMessage.error(
      "AI 选股失败：请检查 VOLCENGINE_API_KEY/模型ID 或服务是否可用",
    );
  } finally {
    aiPickLoading.value = false;
  }
}

function openAiSectorModal() {
  aiSectorModal.value = true;
  aiSectorLoading.value = false;
}

async function runAiSectorNow() {
  aiSectorModal.value = true;
  aiSectorLoading.value = true;
  aiSectorResult.value = null;
  try {
    const params = {
      topSectorN: 10,
      topStockN: 40,
      horizon: aiPickHorizon.value,
      riskProfile: aiPickRisk.value,
    };
    const result = await aiSectorNow(params);
    aiSectorResult.value = result;
    addAiSectorHistory(params, result);
  } catch (e) {
    console.error(e);
    ElMessage.error("板块分析失败：请检查后端服务/开源接口是否可用");
  } finally {
    aiSectorLoading.value = false;
  }
}

function openAiAfterCloseModal() {
  aiAfterCloseModal.value = true;
  aiAfterCloseLoading.value = false;
}

async function runAiAfterClose() {
  aiAfterCloseModal.value = true;
  aiAfterCloseLoading.value = true;
  aiAfterCloseResult.value = null;
  try {
    const params = {
      topSectorN: 15,
      topStockN: 40,
      horizon: aiPickHorizon.value,
      riskProfile: aiPickRisk.value,
    };
    const result = await aiAfterClose(params);
    aiAfterCloseResult.value = result;
    addAiAfterCloseHistory(params, result);
  } catch (e) {
    console.error(e);
    ElMessage.error("收盘复盘失败：请检查后端服务/开源接口是否可用");
  } finally {
    aiAfterCloseLoading.value = false;
  }
}

function openAiScreenModal() {
  aiScreenModal.value = true;
  aiScreenResult.value = null;
}

async function runAiScreen() {
  const q = aiScreenQuery.value.trim();
  if (!q) {
    ElMessage.warning("先输入选股条件（自然语言）");
    return;
  }
  aiScreenLoading.value = true;
  aiScreenResult.value = null;
  try {
    const params = {
      query: q,
      limit: aiScreenLimit.value,
      horizon: aiPickHorizon.value,
      riskProfile: aiPickRisk.value,
    };
    const result = await aiScreenStocks(params);
    aiScreenResult.value = result;
    addAiScreenHistory(params, result);
  } catch (e) {
    console.error(e);
    ElMessage.error("条件选股失败：请检查后端服务/开源接口是否可用");
  } finally {
    aiScreenLoading.value = false;
  }
}

function addAiAnalyzeHistory(
  params: { stock: StockItem; horizon: string; riskProfile: string },
  result: AiAnalyzeResult,
) {
  const item: AiHistoryItem<
    AiAnalyzeResult,
    { stock: StockItem; horizon: string; riskProfile: string }
  > = {
    id: createHistoryId(),
    ts: Date.now(),
    params,
    result,
  };
  aiAnalyzeHistory.value = [item, ...aiAnalyzeHistory.value].slice(
    0,
    AI_HISTORY_LIMIT,
  );
  saveAiHistory();
}

function addAiPickHistory(
  params: {
    topN: number;
    horizon: string;
    riskProfile: string;
    candidates: number;
  },
  result: AiPickResult,
) {
  const item: AiHistoryItem<
    AiPickResult,
    { topN: number; horizon: string; riskProfile: string; candidates: number }
  > = {
    id: createHistoryId(),
    ts: Date.now(),
    params,
    result,
  };
  aiPickHistory.value = [item, ...aiPickHistory.value].slice(
    0,
    AI_HISTORY_LIMIT,
  );
  saveAiHistory();
}

function addAiSectorHistory(
  params: {
    topSectorN: number;
    topStockN: number;
    horizon: string;
    riskProfile: string;
  },
  result: AiSectorNowResult,
) {
  const item: AiHistoryItem<
    AiSectorNowResult,
    {
      topSectorN: number;
      topStockN: number;
      horizon: string;
      riskProfile: string;
    }
  > = {
    id: createHistoryId(),
    ts: Date.now(),
    params,
    result,
  };
  aiSectorHistory.value = [item, ...aiSectorHistory.value].slice(
    0,
    AI_HISTORY_LIMIT,
  );
  saveAiHistory();
}

function addAiAfterCloseHistory(
  params: {
    topSectorN: number;
    topStockN: number;
    horizon: string;
    riskProfile: string;
  },
  result: AiAfterCloseResult,
) {
  const item: AiHistoryItem<
    AiAfterCloseResult,
    {
      topSectorN: number;
      topStockN: number;
      horizon: string;
      riskProfile: string;
    }
  > = {
    id: createHistoryId(),
    ts: Date.now(),
    params,
    result,
  };
  aiAfterCloseHistory.value = [item, ...aiAfterCloseHistory.value].slice(
    0,
    AI_HISTORY_LIMIT,
  );
  saveAiHistory();
}

function addAiScreenHistory(
  params: {
    query: string;
    limit: number;
    horizon: string;
    riskProfile: string;
  },
  result: AiScreenResult,
) {
  const item: AiHistoryItem<
    AiScreenResult,
    { query: string; limit: number; horizon: string; riskProfile: string }
  > = {
    id: createHistoryId(),
    ts: Date.now(),
    params,
    result,
  };
  aiScreenHistory.value = [item, ...aiScreenHistory.value].slice(
    0,
    AI_HISTORY_LIMIT,
  );
  saveAiHistory();
}

function applyAiAnalyzeHistory(
  item: AiHistoryItem<
    AiAnalyzeResult,
    { stock: StockItem; horizon: string; riskProfile: string }
  >,
) {
  aiAnalyzeTarget.value = item.params.stock;
  aiAnalyzeResult.value = item.result;
  aiPickHorizon.value = item.params.horizon;
  aiPickRisk.value = item.params.riskProfile;
  aiAnalyzeModal.value = true;
}

function applyAiPickHistory(
  item: AiHistoryItem<
    AiPickResult,
    { topN: number; horizon: string; riskProfile: string; candidates: number }
  >,
) {
  aiPickTopN.value = item.params.topN;
  aiPickHorizon.value = item.params.horizon;
  aiPickRisk.value = item.params.riskProfile;
  aiPickResult.value = item.result;
  aiPickModal.value = true;
}

function applyAiSectorHistory(
  item: AiHistoryItem<
    AiSectorNowResult,
    {
      topSectorN: number;
      topStockN: number;
      horizon: string;
      riskProfile: string;
    }
  >,
) {
  aiSectorResult.value = item.result;
  aiPickHorizon.value = item.params.horizon;
  aiPickRisk.value = item.params.riskProfile;
  aiSectorModal.value = true;
}

function applyAiAfterCloseHistory(
  item: AiHistoryItem<
    AiAfterCloseResult,
    {
      topSectorN: number;
      topStockN: number;
      horizon: string;
      riskProfile: string;
    }
  >,
) {
  aiAfterCloseResult.value = item.result;
  aiPickHorizon.value = item.params.horizon;
  aiPickRisk.value = item.params.riskProfile;
  aiAfterCloseModal.value = true;
}

function applyAiScreenHistory(
  item: AiHistoryItem<
    AiScreenResult,
    { query: string; limit: number; horizon: string; riskProfile: string }
  >,
) {
  aiScreenQuery.value = item.params.query;
  aiScreenLimit.value = item.params.limit;
  aiPickHorizon.value = item.params.horizon;
  aiPickRisk.value = item.params.riskProfile;
  aiScreenResult.value = item.result;
  aiScreenModal.value = true;
}

function clearAiAnalyzeHistory() {
  const target = aiAnalyzeTarget.value;
  if (!target?.code) return;
  const codeLower = target.code.toLowerCase();
  aiAnalyzeHistory.value = aiAnalyzeHistory.value.filter(
    (item) => (item.params.stock?.code || "").toLowerCase() !== codeLower,
  );
  saveAiHistory();
}

function clearAiPickHistory() {
  aiPickHistory.value = [];
  saveAiHistory();
}

function clearAiSectorHistory() {
  aiSectorHistory.value = [];
  saveAiHistory();
}

function clearAiAfterCloseHistory() {
  aiAfterCloseHistory.value = [];
  saveAiHistory();
}

function clearAiScreenHistory() {
  aiScreenHistory.value = [];
  saveAiHistory();
}

function removeCode(code: string) {
  const lower = code.toLowerCase();
  groups.value = groups.value.map((group) => ({
    ...group,
    codes: group.codes.filter((c) => c.toLowerCase() !== lower),
  }));
  saveGroups();
  const key = code.toLowerCase();
  if (stockPrice.value[key]) {
    delete stockPrice.value[key];
    saveStockPrice();
  }
  // 移除该股票的 AI 分析历史
  aiAnalyzeHistory.value = aiAnalyzeHistory.value.filter(
    (item) => (item.params.stock?.code || "").toLowerCase() !== lower,
  );
  saveAiHistory();
  loadStockList();
}

function addCode(code: string) {
  const lower = code.toLowerCase();
  if (allCodes.value.some((c) => c.toLowerCase() === lower)) return;
  ensureDefaultGroup();
  let targetGroup = groups.value.find((g) => g.id === currentGroupId.value);
  if (!targetGroup || currentGroupId.value === ALL_GROUP_ID) {
    targetGroup = groups.value[0];
  }
  groups.value = groups.value.map((group) =>
    group.id === targetGroup?.id
      ? { ...group, codes: [...group.codes, lower] }
      : group,
  );
  saveGroups();
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

watch(allCodes, () => loadStockList(), { immediate: false });
watch([isH5, toolsTab], () => {
  if (isH5.value && toolsTab.value === "alerts") toolsTab.value = "overview";
});
watch(groupManageModal, (open) => {
  if (open) updateGroupDrafts();
});
watch([hideMarketValue, holdingFilter], () => {
  saveViewSettings();
});
watch(searchKeyword, (q) => {
  if (searchTimer) clearTimeout(searchTimer);
  if (!q.trim()) {
    searchSuggestions.value = [];
    return;
  }
  searchTimer = setTimeout(() => onSearch(), 300);
});
onMounted(() => {
  checkH5();
  window.addEventListener("resize", checkH5);
  loadGroups();
  loadStockPrice();
  loadAlerts();
  loadViewSettings();
  loadAiHistory();
  updateGroupDrafts();
  loadStockList();
  loadNews();
});
onUnmounted(() => {
  window.removeEventListener("resize", checkH5);
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
.app.h5 {
  padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
}
.app.h5 .header-inner {
  gap: 0.5rem 1rem;
}
.app.h5 .title {
  font-size: 1.25rem;
}
.app.h5 .quick-links {
  width: 100%;
  margin-left: 0;
  margin-top: 0.25rem;
}
.app.h5 .section-head {
  flex-wrap: wrap;
  gap: 0.5rem;
}
.app.h5 .actions {
  flex-wrap: wrap;
  gap: 0.4rem;
}
.app.h5 .watchlist-section,
.app.h5 .tools-section {
  padding: 1rem;
}
.app.h5 .group-select {
  min-width: 90px;
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
.tools-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.tools-section--collapsed .tools-section-head {
  margin-bottom: 0;
}
.tools-section-body {
  margin-top: 0.25rem;
}
.tools-section-head {
  margin-bottom: 0.75rem;
}
.tools-tabs :deep(.el-tabs__header) {
  margin-bottom: 1rem;
}
.tools-tabs :deep(.el-tabs__item) {
  font-size: 0.9rem;
}
.tools-tabs :deep(.el-tabs__content) {
  overflow: visible;
}
.news-panel-inner .section-head {
  margin-bottom: 0.5rem;
}
.news-panel-inner .news-list {
  margin-top: 0;
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
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.summary-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.75rem 0.9rem;
}
.summary-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 0.35rem;
}
.summary-value {
  font-size: 1.05rem;
  font-weight: 600;
}
.summary-value.masked {
  letter-spacing: 0.12em;
}
.summary-sub {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}
.alerts-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.alerts-form {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) 110px 70px 140px auto;
  gap: 0.5rem;
  align-items: center;
}
.alert-select,
.alert-type,
.alert-op,
.alert-value {
  width: 100%;
}
.alerts-list :deep(.el-table) {
  --el-table-bg-color: var(--bg-card);
  --el-table-header-bg-color: var(--bg-card);
  --el-table-row-hover-bg-color: rgba(255, 255, 255, 0.04);
  --el-table-border-color: var(--border);
  --el-table-text-color: var(--text);
}
.alert-name {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.news-panel {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px dashed var(--border);
}
.news-panel h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}
.news-list {
  margin-top: 0.5rem;
}
.news-items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.news-items li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}
.news-items a {
  color: var(--text);
  text-decoration: none;
  flex: 1;
}
.news-items a:hover {
  color: var(--accent);
  text-decoration: underline;
}
.group-select {
  min-width: 120px;
}
.group-manage {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.group-create {
  display: flex;
  gap: 0.5rem;
}
.group-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.group-item {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.group-actions {
  display: inline-flex;
  gap: 0.35rem;
}
.muted {
  color: var(--text-muted);
}
.up {
  color: var(--up);
}
.down {
  color: var(--down);
}

.ai-dialog :deep(.el-dialog__body) {
  max-height: 70vh;
  overflow: auto;
}

.ai-block {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.ai-history {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.ai-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ai-history-title {
  font-weight: 600;
}
.ai-history-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.ai-history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
}
.ai-history-main {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.ai-history-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.ai-history-query {
  font-size: 0.85rem;
  color: var(--text);
}
.ai-row {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 0.75rem;
}
.kline-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.kline-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
  padding: 0.75rem;
}
.kline-image {
  width: 100%;
  max-width: 800px;
}
.trade-tools {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.75rem;
  margin-top: 0.75rem;
}
.trade-block {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.02);
}
.trade-title {
  font-weight: 600;
  margin-bottom: 0.5rem;
}
.trade-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}
.trade-control {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.trade-rows {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.ai-label {
  color: var(--text-muted);
  font-size: 0.85rem;
}
.ai-value {
  color: var(--text);
}
.ai-disclaimer {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px dashed var(--border);
  color: var(--text-muted);
  font-size: 0.85rem;
}
.ai-pick-controls {
  margin-bottom: 0.75rem;
}
.ai-pick-item {
  padding: 0.25rem 0;
}
.ai-pick-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.35rem;
}
</style>
