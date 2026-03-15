<template>
  <div class="app" :class="{ h5: isH5 }">
    <header class="header">
      <div class="header-inner">
        <div class="header-brand">
          <div class="brand-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 17L7 13L11 15L15 9L21 7"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M15 7H21V13"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <div>
            <h1 class="title">StockPilot</h1>
            <p class="subtitle">{{ isH5 ? "移动行情" : "智能交易助手" }}</p>
          </div>
        </div>
        <div class="header-status">
          <span class="status-dot" :class="{ active: realtimeMode }"></span>
          <span class="status-text">{{
            realtimeMode ? "实时更新中" : "已暂停"
          }}</span>
        </div>
        <div class="quick-links">
          <a
            href="https://data.eastmoney.com/hsgt/index.html"
            target="_blank"
            rel="noopener"
          >
            <span class="link-icon">↗</span>
            北向资金
          </a>
          <a
            href="https://data.eastmoney.com/zjlx/detail.html"
            target="_blank"
            rel="noopener"
          >
            <span class="link-icon">↗</span>
            主力资金
          </a>
        </div>
        <el-dropdown class="user-dropdown" trigger="click" @command="handleUserCommand">
          <div class="user-avatar-btn">
            <el-icon size="16"><UserFilled /></el-icon>
            <span v-if="!isH5" class="user-name">{{ currentUser?.nickname || currentUser?.username || '' }}</span>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>
                <span style="color: var(--el-text-color-secondary)">{{ currentUser?.username }}</span>
              </el-dropdown-item>
              <el-dropdown-item v-if="isAdmin" divided command="admin">
                <span style="color: #f59e0b">用户管理</span>
              </el-dropdown-item>
              <el-dropdown-item :divided="!isAdmin" command="changePwd">修改密码</el-dropdown-item>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
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
              <div v-if="marketIndices.length" class="indices-bar">
                <div
                  v-for="idx in marketIndices"
                  :key="idx.code"
                  class="index-card"
                  :class="indexColorClass(idx)"
                >
                  <span class="index-name">{{ idx.name }}</span>
                  <span class="index-price">{{ idx.price }}</span>
                  <span class="index-change">{{
                    formatIndexPercent(idx)
                  }}</span>
                </div>
              </div>
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
                        ? 'up'
                        : portfolioSummary.totalEarnings < 0
                          ? 'down'
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
                        ? 'up'
                        : portfolioSummary.todayEarnings < 0
                          ? 'down'
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
            <el-button plain @click="openStreakScan"> 连涨跌扫描 </el-button>
            <el-dropdown trigger="click" @command="handleAiCommand">
              <el-button type="primary" plain>
                AI 工具
                <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="sector">市场总览</el-dropdown-item>
                  <el-dropdown-item command="screen">条件选股</el-dropdown-item>
                  <el-dropdown-item command="journal"
                    >复盘笔记</el-dropdown-item
                  >
                  <el-dropdown-item divided command="trades">交易记录</el-dropdown-item>
                  <el-dropdown-item command="savedJournals">我的笔记</el-dropdown-item>
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
          :compact="isH5"
          @remove="removeCode"
          @set-holding="openHoldingModal"
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
    <!-- 连涨跌扫描 -->
    <el-dialog
      v-model="streakScanModal"
      title="全 A 股连涨跌扫描"
      width="720px"
      destroy-on-close
      class="ai-dialog"
    >
      <div class="streak-scan-controls">
        <el-radio-group v-model="streakScanDirection" size="small">
          <el-radio-button value="down">连跌</el-radio-button>
          <el-radio-button value="up">连涨</el-radio-button>
        </el-radio-group>
        <div class="streak-scan-days">
          <span class="muted">≥</span>
          <el-input-number
            v-model="streakScanDays"
            :min="2"
            :max="30"
            size="small"
            controls-position="right"
            style="width: 90px"
          />
          <span class="muted">天</span>
        </div>
        <el-button
          type="primary"
          size="small"
          :loading="streakScanLoading"
          @click="runStreakScan"
        >
          {{ streakScanLoading ? "扫描中…" : "开始扫描" }}
        </el-button>
        <span v-if="streakScanTotal" class="muted" style="font-size: 0.8rem">
          {{ streakScanCached ? "(缓存)" : "" }} 扫描 {{ streakScanTotal }} 只 ·
          命中 {{ streakScanResults.length }} 只
        </span>
      </div>
      <el-skeleton
        v-if="streakScanLoading && !streakScanResults.length"
        :rows="8"
        animated
      />
      <template v-else>
        <el-empty
          v-if="!streakScanResults.length"
          :description="
            streakScanTotal ? '无符合条件的股票' : '点击「开始扫描」搜索全 A 股'
          "
        />
        <el-table
          v-else
          :data="streakScanResults"
          size="small"
          stripe
          max-height="480"
          class="streak-scan-table"
        >
          <el-table-column label="名称" min-width="100" show-overflow-tooltip>
            <template #default="{ row }">
              <span>{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column label="代码" width="100">
            <template #default="{ row }">{{ row.code }}</template>
          </el-table-column>
          <el-table-column label="最新价" width="85" align="right">
            <template #default="{ row }">{{ row.price }}</template>
          </el-table-column>
          <el-table-column label="今日涨跌" width="90" align="right">
            <template #default="{ row }">
              <span
                :class="row.percent > 0 ? 'up' : row.percent < 0 ? 'down' : ''"
              >
                {{ row.percent > 0 ? "+" : "" }}{{ row.percent?.toFixed(2) }}%
              </span>
            </template>
          </el-table-column>
          <el-table-column
            label="连续天数"
            width="100"
            align="center"
            sortable
            :sort-method="
              (a: StreakScanItem, b: StreakScanItem) =>
                Math.abs(a.streak) - Math.abs(b.streak)
            "
          >
            <template #default="{ row }">
              <span class="streak-tag" :class="row.streak > 0 ? 'up' : 'down'">
                {{ row.streak > 0 ? "涨" : "跌" }} {{ Math.abs(row.streak) }} 天
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" align="center">
            <template #default="{ row }">
              <el-button
                link
                size="small"
                type="primary"
                :disabled="allCodes.includes(row.code.toLowerCase())"
                @click="addCodeFromScan(row.code)"
              >
                {{
                  allCodes.includes(row.code.toLowerCase())
                    ? "已添加"
                    : "+ 自选"
                }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
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

    <!-- 市场总览 -->
    <el-dialog
      v-model="aiSectorModal"
      title="市场总览（A股）"
      width="820px"
      destroy-on-close
      class="ai-dialog"
    >
      <div class="market-mode-tabs">
        <el-radio-group
          v-model="aiSectorMode"
          size="small"
          @change="runAiSectorNow"
        >
          <el-radio-button label="intraday">盘中实时</el-radio-button>
          <el-radio-button label="after_close">盘后复盘</el-radio-button>
        </el-radio-group>
      </div>
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
                <b>市场总览</b>
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

    <!-- 复盘笔记 -->
    <el-dialog
      v-model="aiJournalModal"
      title="复盘笔记（AI 整理）"
      width="920px"
      destroy-on-close
      class="ai-dialog"
    >
      <div style="margin-bottom: 12px">
        <el-form>
          <el-form-item label="复盘内容（随便写，越真实越好）">
            <el-input
              v-model="aiJournalNotes"
              type="textarea"
              :rows="10"
              placeholder="记录今天的交易、想法、纪律、情绪、计划…"
            />
          </el-form-item>
          <el-button
            type="primary"
            :loading="aiJournalLoading"
            @click="runAiJournal"
          >
            生成复盘
          </el-button>
        </el-form>
      </div>

      <el-skeleton v-if="aiJournalLoading" :rows="12" animated />
      <template v-else>
        <el-empty v-if="!aiJournalResult" description="暂无结果" />
        <div v-else class="ai-block">
          <div class="ai-row">
            <div class="ai-label">一句话</div>
            <div class="ai-value">{{ aiJournalResult.recap.oneSentence }}</div>
          </div>
          <div class="ai-row">
            <div class="ai-label">做得好</div>
            <div class="ai-value">
              <ul>
                <li v-for="(x, i) in aiJournalResult.recap.whatWorked" :key="i">
                  {{ x }}
                </li>
              </ul>
            </div>
          </div>
          <div class="ai-row">
            <div class="ai-label">做得差</div>
            <div class="ai-value">
              <ul>
                <li v-for="(x, i) in aiJournalResult.recap.whatDidnt" :key="i">
                  {{ x }}
                </li>
              </ul>
            </div>
          </div>
          <div class="ai-row">
            <div class="ai-label">关键教训</div>
            <div class="ai-value">
              <ul>
                <li v-for="(x, i) in aiJournalResult.recap.keyLessons" :key="i">
                  {{ x }}
                </li>
              </ul>
            </div>
          </div>
          <el-divider />
          <div class="ai-row">
            <div class="ai-label">明日计划</div>
            <div class="ai-value">
              <div>
                <b>关注：</b
                >{{ aiJournalResult.tomorrowPlan.focus?.join("；") }}
              </div>
              <div>
                <b>风控：</b
                >{{ aiJournalResult.tomorrowPlan.riskControl?.join("；") }}
              </div>
              <div>
                <b>If-Then：</b
                >{{ aiJournalResult.tomorrowPlan.ifThen?.join("；") }}
              </div>
            </div>
          </div>
          <div class="ai-row">
            <div class="ai-label">观察池</div>
            <div class="ai-value">
              <div
                v-for="(x, idx) in aiJournalResult.watchlist"
                :key="idx"
                style="margin-bottom: 8px"
              >
                <b>{{ x.name || x.code || "标的" }}</b>
                <div class="muted">原因：{{ x.whyWatch?.join("；") }}</div>
                <div class="muted">触发：{{ x.trigger?.join("；") }}</div>
                <div class="muted">无效：{{ x.invalidation }}</div>
              </div>
            </div>
          </div>
          <div class="ai-row">
            <div class="ai-label">清单</div>
            <div class="ai-value">
              <div>
                <b>开盘前：</b
                >{{ aiJournalResult.checklist.beforeOpen?.join("；") }}
              </div>
              <div>
                <b>盘中：</b
                >{{ aiJournalResult.checklist.intraday?.join("；") }}
              </div>
              <div>
                <b>收盘后：</b
                >{{ aiJournalResult.checklist.afterClose?.join("；") }}
              </div>
            </div>
          </div>
          <div class="ai-disclaimer">{{ aiJournalResult.disclaimer }}</div>
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
            :disabled="!aiJournalHistory.length"
            @click="clearAiJournalHistory"
          >
            清空
          </el-button>
        </div>
        <el-empty v-if="!aiJournalHistory.length" description="暂无历史" />
        <div v-else class="ai-history-list">
          <div
            v-for="item in aiJournalHistory"
            :key="item.id"
            class="ai-history-item"
          >
            <div class="ai-history-main">
              <div class="ai-history-title-row">
                <b>复盘笔记</b>
                <span class="muted">{{ formatDateTime(item.ts) }}</span>
              </div>
              <div class="muted">
                周期 {{ formatHorizon(item.params.horizon) }} · 风险
                {{ formatRisk(item.params.riskProfile) }}
              </div>
              <div
                v-if="item.params.notes"
                class="ai-history-query"
                style="
                  max-width: 100%;
                  overflow: hidden;
                  text-overflow: ellipsis;
                "
              >
                {{ (item.params.notes || "").slice(0, 60)
                }}{{ (item.params.notes || "").length > 60 ? "…" : "" }}
              </div>
            </div>
            <el-button size="small" @click="applyAiJournalHistory(item)">
              查看
            </el-button>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="aiJournalModal = false">关闭</el-button>
        <el-button
          v-if="aiJournalResult"
          type="success"
          :loading="saveJournalLoading"
          @click="saveAiJournalToServer"
        >
          保存到笔记
        </el-button>
      </template>
    </el-dialog>

    <!-- 修改密码 -->
    <el-dialog v-model="changePwdModal" title="修改密码" width="400px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="旧密码">
          <el-input v-model="changePwdForm.oldPassword" type="password" show-password placeholder="请输入旧密码" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="changePwdForm.newPassword" type="password" show-password placeholder="请输入新密码（至少6位）" />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="changePwdForm.confirmPassword" type="password" show-password placeholder="再次输入新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="changePwdModal = false">取消</el-button>
        <el-button type="primary" :loading="changePwdLoading" @click="handleChangePassword">确认修改</el-button>
      </template>
    </el-dialog>

    <!-- 交易记录 -->
    <el-dialog
      v-model="tradesModal"
      title="交易记录"
      width="900px"
      destroy-on-close
      class="ai-dialog"
    >
      <div class="trades-toolbar">
        <el-button type="primary" size="small" @click="openAddTrade">新增交易</el-button>
        <el-button size="small" :loading="tradesLoading" @click="loadTrades">刷新</el-button>
        <span class="muted" style="margin-left: 8px">共 {{ tradesList.length }} 条</span>
      </div>
      <el-skeleton v-if="tradesLoading && !tradesList.length" :rows="6" animated />
      <el-empty v-else-if="!tradesList.length" description="暂无交易记录" />
      <el-table v-else :data="tradesList" size="small" stripe max-height="480">
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ formatTradeTime(row.trade_time) }}</template>
        </el-table-column>
        <el-table-column label="股票" min-width="120">
          <template #default="{ row }">
            <span>{{ row.stock_name || row.stock_code }}</span>
            <span class="muted"> ({{ row.stock_code }})</span>
          </template>
        </el-table-column>
        <el-table-column label="方向" width="70" align="center">
          <template #default="{ row }">
            <span :class="row.direction === 'buy' ? 'up' : 'down'">
              {{ row.direction === 'buy' ? '买入' : '卖出' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="价格" width="90" align="right">
          <template #default="{ row }">{{ Number(row.price).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="数量" width="80" align="right" prop="quantity" />
        <el-table-column label="金额" width="110" align="right">
          <template #default="{ row }">{{ formatMoney(Number(row.amount)) }}</template>
        </el-table-column>
        <el-table-column label="备注" min-width="100" show-overflow-tooltip prop="notes" />
        <el-table-column label="操作" width="70" align="center">
          <template #default="{ row }">
            <el-button link type="danger" size="small" @click="handleDeleteTrade(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 新增交易表单 -->
      <el-dialog v-model="tradeFormModal" title="新增交易" width="480px" append-to-body destroy-on-close>
        <el-form label-position="top">
          <el-form-item label="股票代码">
            <el-select
              v-model="tradeForm.stockCode"
              filterable
              allow-create
              default-first-option
              placeholder="选择股票 / 输入代码"
              style="width: 100%"
              @change="onTradeStockChange"
            >
              <el-option
                v-for="item in alertStockOptions"
                :key="item.code"
                :label="`${item.name} (${item.code})`"
                :value="item.code"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="方向">
            <el-radio-group v-model="tradeForm.direction">
              <el-radio-button value="buy">买入</el-radio-button>
              <el-radio-button value="sell">卖出</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="价格">
            <el-input-number v-model="tradeForm.price" :min="0" :step="0.01" :precision="4" controls-position="right" style="width: 100%" />
          </el-form-item>
          <el-form-item label="数量">
            <el-input-number v-model="tradeForm.quantity" :min="1" :step="100" controls-position="right" style="width: 100%" />
          </el-form-item>
          <el-form-item label="交易时间">
            <el-date-picker v-model="tradeForm.tradeTime" type="datetime" placeholder="选择交易时间" style="width: 100%" value-format="YYYY-MM-DD HH:mm:ss" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="tradeForm.notes" placeholder="可选" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="tradeFormModal = false">取消</el-button>
          <el-button type="primary" :loading="tradeFormLoading" @click="handleAddTrade">确认</el-button>
        </template>
      </el-dialog>
    </el-dialog>

    <!-- 我的笔记 -->
    <el-dialog
      v-model="savedJournalsModal"
      title="我的笔记"
      width="800px"
      destroy-on-close
      class="ai-dialog"
    >
      <div class="trades-toolbar">
        <el-button type="primary" size="small" @click="openAddJournal">新建笔记</el-button>
        <el-button size="small" :loading="savedJournalsLoading" @click="loadSavedJournals">刷新</el-button>
      </div>
      <el-skeleton v-if="savedJournalsLoading && !savedJournalsList.length" :rows="6" animated />
      <el-empty v-else-if="!savedJournalsList.length" description="暂无笔记" />
      <div v-else class="journals-list">
        <div v-for="j in savedJournalsList" :key="j.id" class="journal-card">
          <div class="journal-card-head">
            <div>
              <b>{{ j.title || '无标题' }}</b>
              <span v-if="j.trade_date" class="muted" style="margin-left: 8px">{{ j.trade_date }}</span>
            </div>
            <div>
              <el-button link size="small" @click="openEditJournal(j)">编辑</el-button>
              <el-button link type="danger" size="small" @click="handleDeleteJournal(j.id)">删除</el-button>
            </div>
          </div>
          <div class="journal-card-tags" v-if="j.tags">
            <el-tag v-for="tag in j.tags.split(',')" :key="tag" size="small" type="info" style="margin-right: 4px">{{ tag }}</el-tag>
          </div>
          <div class="journal-card-content">{{ j.content.slice(0, 200) }}{{ j.content.length > 200 ? '…' : '' }}</div>
          <div class="journal-card-footer muted">
            创建于 {{ formatDateTime(new Date(j.created_at).getTime()) }}
          </div>
        </div>
      </div>

      <!-- 新建/编辑笔记 -->
      <el-dialog v-model="journalFormModal" :title="journalFormEditId ? '编辑笔记' : '新建笔记'" width="600px" append-to-body destroy-on-close>
        <el-form label-position="top">
          <el-form-item label="标题">
            <el-input v-model="journalForm.title" placeholder="可选标题" />
          </el-form-item>
          <el-form-item label="日期">
            <el-date-picker v-model="journalForm.tradeDate" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="标签（逗号分隔）">
            <el-input v-model="journalForm.tags" placeholder="例如：复盘,策略" />
          </el-form-item>
          <el-form-item label="内容">
            <el-input v-model="journalForm.content" type="textarea" :rows="12" placeholder="写点什么…" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="journalFormModal = false">取消</el-button>
          <el-button type="primary" :loading="journalFormLoading" @click="handleSaveJournal">保存</el-button>
        </template>
      </el-dialog>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { ArrowDown, UserFilled } from "@element-plus/icons-vue";
let searchTimer: ReturnType<typeof setTimeout> | null = null;
import StockSearch from "@/components/StockSearch.vue";
import StockTable from "@/components/StockTable.vue";
import {
  fetchStockList,
  searchStock,
  searchItemToCode,
  fetchStreakScan,
} from "@/api/stock";
import type { StreakScanItem } from "@/api/stock";
import {
  aiAnalyzeStock as aiAnalyzeStockApi,
  aiSectorNow,
  aiScreenStocks,
  aiJournal,
} from "@/api/ai";
import type {
  AiAnalyzeResult,
  AiSectorNowResult,
  AiScreenResult,
  AiJournalResult,
} from "@/api/ai";
import type {
  StockItem,
  SearchItem,
  StockPriceItem,
  SortType,
} from "@/types/stock";
import { SORT_LABELS } from "@/types/stock";
import { changePassword as changePasswordApi } from "@/api/authApi";
import {
  fetchWatchlist,
  addToWatchlist,
  removeFromWatchlistByCode,
} from "@/api/watchlistApi";
import {
  fetchTrades as fetchTradesApi,
  addTrade as addTradeApi,
  deleteTrade as deleteTradeApi,
  type Trade,
} from "@/api/tradesApi";
import {
  fetchJournals,
  createJournal,
  updateJournal,
  deleteJournal,
  type Journal,
} from "@/api/journalsApi";
import {
  currentUser,
  isAdmin,
  doLogout,
} from "@/stores/auth";

const router = useRouter();

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

function uKey(base: string): string {
  const uid = currentUser.value?.id;
  return uid ? `${base}-u${uid}` : base;
}
const STORAGE_KEY_BASE = "vue-stock-viewer-codes";
const STORAGE_GROUP_BASE = "vue-stock-viewer-groups";
const STORAGE_PRICE_BASE = "vue-stock-viewer-stockPrice";
const STORAGE_ALERT_BASE = "vue-stock-viewer-alerts";
const STORAGE_HIDE_VALUE_BASE = "vue-stock-viewer-hideMarketValue";
const STORAGE_HOLDING_FILTER_BASE = "vue-stock-viewer-holdingFilter";
const STORAGE_AI_ANALYZE_HISTORY_BASE = "vue-stock-viewer-aiAnalyzeHistory";
const STORAGE_AI_SECTOR_HISTORY_BASE = "vue-stock-viewer-aiSectorHistory";
const STORAGE_AI_SCREEN_HISTORY_BASE = "vue-stock-viewer-aiScreenHistory";
const STORAGE_AI_JOURNAL_HISTORY_BASE = "vue-stock-viewer-aiJournalHistory";
const ALL_GROUP_ID = "__all__";
const MARKET_INDEX_CODES = ["sh000001", "sz399001", "sz399006"];
const ALERT_COOLDOWN = 3 * 60 * 1000;
const AI_HISTORY_LIMIT = 20;

// Change password
const changePwdModal = ref(false);
const changePwdLoading = ref(false);
const changePwdForm = ref({ oldPassword: "", newPassword: "", confirmPassword: "" });

// Trades
const tradesModal = ref(false);
const tradesLoading = ref(false);
const tradesList = ref<Trade[]>([]);
const tradeFormModal = ref(false);
const tradeFormLoading = ref(false);
const tradeForm = ref({
  stockCode: "",
  stockName: "",
  direction: "buy" as "buy" | "sell",
  price: 0,
  quantity: 100,
  tradeTime: "",
  notes: "",
});

// Saved journals
const savedJournalsModal = ref(false);
const savedJournalsLoading = ref(false);
const savedJournalsList = ref<Journal[]>([]);
const journalFormModal = ref(false);
const journalFormLoading = ref(false);
const journalFormEditId = ref<number | null>(null);
const journalForm = ref({ title: "", content: "", tradeDate: "", tags: "" });
const saveJournalLoading = ref(false);

const searchKeyword = ref("");
const marketIndices = ref<StockItem[]>([]);
const searchLoading = ref(false);
const searchSuggestions = ref<SearchItem[]>([]);
const stockList = ref<StockItem[]>([]);
const groups = ref<StockGroup[]>([]);
const currentGroupId = ref<string>(ALL_GROUP_ID);
const loading = ref(false);
const sortType = ref<SortType>(0);
const stockPrice = ref<Record<string, StockPriceItem>>({});
const alerts = ref<AlertRule[]>([]);
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
const toolsTab = ref<"overview" | "alerts">("overview");
const toolsCollapsed = ref(false);
const isH5 = ref(false);
function checkH5() {
  const h5 = window.innerWidth <= 768;
  if (h5 && !isH5.value) toolsCollapsed.value = true;
  isH5.value = h5;
  document.body.classList.toggle("h5", h5);
}
const holdingFilter = ref<"all" | "holding" | "not_holding">("all");

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
// 连涨跌扫描
const streakScanModal = ref(false);
const streakScanLoading = ref(false);
const streakScanDirection = ref<"down" | "up">("down");
const streakScanDays = ref(3);
const streakScanResults = ref<StreakScanItem[]>([]);
const streakScanTotal = ref(0);
const streakScanCached = ref(false);

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

const aiPickHorizon = ref("swing_1_5_days");
const aiPickRisk = ref("medium");

// AI · 市场总览（原板块最强，合并盘中/盘后）
const aiSectorModal = ref(false);
const aiSectorLoading = ref(false);
const aiSectorMode = ref<"intraday" | "after_close">("intraday");
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

// AI · 复盘笔记
const aiJournalModal = ref(false);
const aiJournalLoading = ref(false);
const aiJournalNotes = ref("");
const aiJournalResult = ref<AiJournalResult | null>(null);
const aiJournalHistory = ref<
  AiHistoryItem<
    AiJournalResult,
    { notes: string; horizon: string; riskProfile: string }
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
    const raw = localStorage.getItem(uKey(STORAGE_GROUP_BASE));
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
    const legacyRaw = localStorage.getItem(STORAGE_KEY_BASE);
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
    const raw = localStorage.getItem(uKey(STORAGE_PRICE_BASE));
    stockPrice.value = raw ? JSON.parse(raw) : {};
  } catch {
    stockPrice.value = {};
  }
}

function loadAlerts() {
  try {
    const raw = localStorage.getItem(uKey(STORAGE_ALERT_BASE));
    alerts.value = raw ? JSON.parse(raw) : [];
  } catch {
    alerts.value = [];
  }
}

function loadViewSettings() {
  try {
    const raw = localStorage.getItem(uKey(STORAGE_HIDE_VALUE_BASE));
    hideMarketValue.value = raw ? JSON.parse(raw) : false;
  } catch {
    hideMarketValue.value = false;
  }
  try {
    const raw = localStorage.getItem(uKey(STORAGE_HOLDING_FILTER_BASE));
    holdingFilter.value = raw ? JSON.parse(raw) : "all";
  } catch {
    holdingFilter.value = "all";
  }
}

function saveViewSettings() {
  localStorage.setItem(
    uKey(STORAGE_HIDE_VALUE_BASE),
    JSON.stringify(!!hideMarketValue.value),
  );
  localStorage.setItem(
    uKey(STORAGE_HOLDING_FILTER_BASE),
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
    uKey(STORAGE_AI_ANALYZE_HISTORY_BASE),
    JSON.stringify(aiAnalyzeHistory.value),
  );
  localStorage.setItem(
    uKey(STORAGE_AI_SECTOR_HISTORY_BASE),
    JSON.stringify(aiSectorHistory.value),
  );
  localStorage.setItem(
    uKey(STORAGE_AI_SCREEN_HISTORY_BASE),
    JSON.stringify(aiScreenHistory.value),
  );
  localStorage.setItem(
    uKey(STORAGE_AI_JOURNAL_HISTORY_BASE),
    JSON.stringify(aiJournalHistory.value),
  );
}

function loadAiHistory() {
  aiAnalyzeHistory.value = readHistory(uKey(STORAGE_AI_ANALYZE_HISTORY_BASE));
  aiSectorHistory.value = readHistory(uKey(STORAGE_AI_SECTOR_HISTORY_BASE));
  aiScreenHistory.value = readHistory(uKey(STORAGE_AI_SCREEN_HISTORY_BASE));
  aiJournalHistory.value = readHistory(uKey(STORAGE_AI_JOURNAL_HISTORY_BASE));
}

function saveGroups() {
  localStorage.setItem(uKey(STORAGE_GROUP_BASE), JSON.stringify(groups.value));
}

function saveStockPrice() {
  localStorage.setItem(uKey(STORAGE_PRICE_BASE), JSON.stringify(stockPrice.value));
}

function saveAlerts() {
  localStorage.setItem(uKey(STORAGE_ALERT_BASE), JSON.stringify(alerts.value));
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

function indexColorClass(idx: StockItem) {
  const ud = parseFloat(String(idx.updown ?? "0"));
  if (ud > 0) return "up";
  if (ud < 0) return "down";
  return "";
}

function formatIndexPercent(idx: StockItem) {
  const raw = String(idx.percent ?? "").replace(/[%+\-]/g, "");
  const pct = parseFloat(raw) || 0;
  const ud = parseFloat(String(idx.updown ?? "0"));
  const sign = ud > 0 ? "+" : ud < 0 ? "-" : "";
  return `${sign}${pct.toFixed(2)}%`;
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

async function loadMarketIndices() {
  try {
    marketIndices.value = await fetchStockList(MARKET_INDEX_CODES);
  } catch {
    /* silent */
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
      loadMarketIndices();
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

function openStreakScan() {
  streakScanModal.value = true;
  if (!streakScanResults.value.length) runStreakScan();
}

async function runStreakScan() {
  streakScanLoading.value = true;
  try {
    const resp = await fetchStreakScan(
      streakScanDirection.value,
      streakScanDays.value,
    );
    if ((resp as any).scanning) {
      ElMessage.info("扫描进行中，请稍后再试");
      return;
    }
    streakScanResults.value = resp.results || [];
    streakScanTotal.value = resp.total || 0;
    streakScanCached.value = resp.cached ?? false;
  } catch {
    ElMessage.error("连涨跌扫描失败，请稍后重试");
  } finally {
    streakScanLoading.value = false;
  }
}

function addCodeFromScan(code: string) {
  const c = code.toLowerCase();
  if (allCodes.value.some((x) => x.toLowerCase() === c)) return;
  addCode(c);
  ElMessage.success(`已加入自选: ${c}`);
}

function handleAiCommand(command: string) {
  if (command === "sector") openAiSectorModal();
  else if (command === "screen") openAiScreenModal();
  else if (command === "journal") openAiJournalModal();
  else if (command === "trades") openTradesModal();
  else if (command === "savedJournals") openSavedJournalsModal();
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
    const isAfterClose = aiSectorMode.value === "after_close";
    const params = {
      mode: aiSectorMode.value,
      topSectorN: isAfterClose ? 15 : 10,
      topStockN: isAfterClose ? 60 : 40,
      horizon: aiPickHorizon.value,
      riskProfile: aiPickRisk.value,
    };
    const result = await aiSectorNow(params);
    aiSectorResult.value = result;
    addAiSectorHistory(params, result);
  } catch (e) {
    console.error(e);
    ElMessage.error("市场总览加载失败：请检查后端服务");
  } finally {
    aiSectorLoading.value = false;
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

function openAiJournalModal() {
  aiJournalModal.value = true;
  aiJournalLoading.value = false;
  aiJournalResult.value = null;
  if (!aiJournalNotes.value) {
    aiJournalNotes.value = `
【今天做了什么】

【做得好的】

【做得差的/情绪】

【明天计划】

【观察池】
`;
  }
}

async function runAiJournal() {
  const notes = aiJournalNotes.value.trim();
  if (!notes) {
    ElMessage.warning("先写点复盘内容");
    return;
  }
  aiJournalLoading.value = true;
  aiJournalResult.value = null;
  try {
    const result = await aiJournal({
      notes,
      horizon: aiPickHorizon.value,
      riskProfile: aiPickRisk.value,
      context: {
        holdings: displayList.value
          .filter((x) => Number((x as any).holdAmount || 0) > 0)
          .map((x) => ({
            code: x.code,
            name: x.name,
            holdAmount: (x as any).holdAmount,
            holdUnitPrice: (x as any).holdUnitPrice,
            todayHoldUnitPrice: (x as any).todayHoldUnitPrice,
            percent: x.percent,
            price: x.price,
          })),
      },
    });
    aiJournalResult.value = result;
    addAiJournalHistory(
      {
        notes: aiJournalNotes.value,
        horizon: aiPickHorizon.value,
        riskProfile: aiPickRisk.value,
      },
      result,
    );
  } catch (e) {
    console.error(e);
    ElMessage.error("复盘笔记失败：请检查后端服务/AI KEY");
  } finally {
    aiJournalLoading.value = false;
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

function addAiJournalHistory(
  params: { notes: string; horizon: string; riskProfile: string },
  result: AiJournalResult,
) {
  const item: AiHistoryItem<
    AiJournalResult,
    { notes: string; horizon: string; riskProfile: string }
  > = {
    id: createHistoryId(),
    ts: Date.now(),
    params,
    result,
  };
  aiJournalHistory.value = [item, ...aiJournalHistory.value].slice(
    0,
    AI_HISTORY_LIMIT,
  );
  saveAiHistory();
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

function applyAiJournalHistory(
  item: AiHistoryItem<
    AiJournalResult,
    { notes: string; horizon: string; riskProfile: string }
  >,
) {
  aiJournalNotes.value = item.params.notes;
  aiPickHorizon.value = item.params.horizon;
  aiPickRisk.value = item.params.riskProfile;
  aiJournalResult.value = item.result;
  aiJournalModal.value = true;
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

function clearAiSectorHistory() {
  aiSectorHistory.value = [];
  saveAiHistory();
}

function clearAiScreenHistory() {
  aiScreenHistory.value = [];
  saveAiHistory();
}

function clearAiJournalHistory() {
  aiJournalHistory.value = [];
  saveAiHistory();
}

async function removeCode(code: string) {
  const lower = code.toLowerCase();
  try {
    await removeFromWatchlistByCode(lower);
  } catch (e) {
    console.error("[watchlist] remove from API failed", e);
  }
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
  aiAnalyzeHistory.value = aiAnalyzeHistory.value.filter(
    (item) => (item.params.stock?.code || "").toLowerCase() !== lower,
  );
  saveAiHistory();
  loadStockList();
}

async function addCode(code: string) {
  const lower = code.toLowerCase();
  if (allCodes.value.some((c) => c.toLowerCase() === lower)) return;
  try {
    const name = stockList.value.find((s) => s.code.toLowerCase() === lower)?.name;
    await addToWatchlist({ stockCode: lower, stockName: name });
  } catch (e) {
    console.error("[watchlist] add to API failed", e);
  }
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
function handleUserCommand(command: string) {
  if (command === "admin") {
    router.push("/admin");
  } else if (command === "changePwd") {
    changePwdForm.value = { oldPassword: "", newPassword: "", confirmPassword: "" };
    changePwdModal.value = true;
  } else if (command === "logout") {
    doLogout();
    router.push("/login");
  }
}

async function handleChangePassword() {
  const { oldPassword, newPassword, confirmPassword } = changePwdForm.value;
  if (!oldPassword || !newPassword) {
    ElMessage.warning("请填写所有字段");
    return;
  }
  if (newPassword.length < 6) {
    ElMessage.warning("新密码至少6位");
    return;
  }
  if (newPassword !== confirmPassword) {
    ElMessage.warning("两次输入的新密码不一致");
    return;
  }
  changePwdLoading.value = true;
  try {
    await changePasswordApi(oldPassword, newPassword);
    ElMessage.success("密码修改成功");
    changePwdModal.value = false;
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || "修改失败");
  } finally {
    changePwdLoading.value = false;
  }
}

// Trades management
function openTradesModal() {
  tradesModal.value = true;
  loadTrades();
}

async function loadTrades() {
  tradesLoading.value = true;
  try {
    tradesList.value = await fetchTradesApi({ limit: 200 });
  } catch (e) {
    console.error("[trades] load failed", e);
  } finally {
    tradesLoading.value = false;
  }
}

function openAddTrade() {
  tradeForm.value = {
    stockCode: "",
    stockName: "",
    direction: "buy",
    price: 0,
    quantity: 100,
    tradeTime: new Date().toISOString().slice(0, 19).replace("T", " "),
    notes: "",
  };
  tradeFormModal.value = true;
}

function onTradeStockChange(code: string) {
  const item = stockList.value.find((s) => s.code === code);
  if (item) {
    tradeForm.value.stockName = item.name;
    tradeForm.value.price = parseFloat(item.price || "0") || 0;
  }
}

async function handleAddTrade() {
  const f = tradeForm.value;
  if (!f.stockCode || !f.price || !f.quantity || !f.tradeTime) {
    ElMessage.warning("请填写必要字段");
    return;
  }
  tradeFormLoading.value = true;
  try {
    await addTradeApi({
      stockCode: f.stockCode,
      stockName: f.stockName,
      direction: f.direction,
      price: f.price,
      quantity: f.quantity,
      tradeTime: f.tradeTime,
      notes: f.notes,
    });
    ElMessage.success("交易记录已添加");
    tradeFormModal.value = false;
    loadTrades();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || "添加失败");
  } finally {
    tradeFormLoading.value = false;
  }
}

async function handleDeleteTrade(id: number) {
  try {
    await ElMessageBox.confirm("确认删除此交易记录？", "提示", { type: "warning" });
  } catch {
    return;
  }
  try {
    await deleteTradeApi(id);
    ElMessage.success("已删除");
    loadTrades();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || "删除失败");
  }
}

function formatTradeTime(t: string) {
  if (!t) return "—";
  const d = new Date(t);
  if (isNaN(d.getTime())) return t;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Saved journals management
function openSavedJournalsModal() {
  savedJournalsModal.value = true;
  loadSavedJournals();
}

async function loadSavedJournals() {
  savedJournalsLoading.value = true;
  try {
    savedJournalsList.value = await fetchJournals({ limit: 100 });
  } catch (e) {
    console.error("[journals] load failed", e);
  } finally {
    savedJournalsLoading.value = false;
  }
}

function openAddJournal() {
  journalFormEditId.value = null;
  journalForm.value = { title: "", content: "", tradeDate: "", tags: "" };
  journalFormModal.value = true;
}

function openEditJournal(j: Journal) {
  journalFormEditId.value = j.id;
  journalForm.value = {
    title: j.title,
    content: j.content,
    tradeDate: j.trade_date || "",
    tags: j.tags || "",
  };
  journalFormModal.value = true;
}

async function handleSaveJournal() {
  if (!journalForm.value.content.trim()) {
    ElMessage.warning("内容不能为空");
    return;
  }
  journalFormLoading.value = true;
  const payload = {
    title: journalForm.value.title,
    content: journalForm.value.content,
    tradeDate: journalForm.value.tradeDate || undefined,
    tags: journalForm.value.tags ? journalForm.value.tags.split(",").map((t) => t.trim()) : undefined,
  };
  try {
    if (journalFormEditId.value) {
      await updateJournal(journalFormEditId.value, payload);
      ElMessage.success("笔记已更新");
    } else {
      await createJournal(payload);
      ElMessage.success("笔记已创建");
    }
    journalFormModal.value = false;
    loadSavedJournals();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || "保存失败");
  } finally {
    journalFormLoading.value = false;
  }
}

async function handleDeleteJournal(id: number) {
  try {
    await ElMessageBox.confirm("确认删除此笔记？", "提示", { type: "warning" });
  } catch {
    return;
  }
  try {
    await deleteJournal(id);
    ElMessage.success("已删除");
    loadSavedJournals();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || "删除失败");
  }
}

async function saveAiJournalToServer() {
  if (!aiJournalResult.value) return;
  saveJournalLoading.value = true;
  try {
    const recap = aiJournalResult.value.recap;
    const plan = aiJournalResult.value.tomorrowPlan;
    const content = [
      `一句话：${recap.oneSentence}`,
      "",
      "做得好：",
      ...(recap.whatWorked || []).map((x) => `- ${x}`),
      "",
      "做得差：",
      ...(recap.whatDidnt || []).map((x) => `- ${x}`),
      "",
      "关键教训：",
      ...(recap.keyLessons || []).map((x) => `- ${x}`),
      "",
      "明日计划：",
      `关注：${(plan.focus || []).join("；")}`,
      `风控：${(plan.riskControl || []).join("；")}`,
      `If-Then：${(plan.ifThen || []).join("；")}`,
      "",
      `--- 原始笔记 ---`,
      aiJournalNotes.value,
    ].join("\n");
    const today = new Date().toISOString().slice(0, 10);
    await createJournal({
      title: `复盘 ${today}`,
      content,
      tradeDate: today,
      tags: ["AI复盘"],
    });
    ElMessage.success("已保存到笔记");
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || "保存失败");
  } finally {
    saveJournalLoading.value = false;
  }
}

async function syncWatchlistFromApi() {
  try {
    const apiItems = await fetchWatchlist();
    const apiCodes = apiItems.map((item) => item.stock_code.toLowerCase());
    if (!apiCodes.length && !allCodes.value.length) return;

    const groupCodes = new Set<string>();
    groups.value.forEach((g) => g.codes.forEach((c) => groupCodes.add(c.toLowerCase())));

    const orphans = apiCodes.filter((c) => !groupCodes.has(c));
    if (orphans.length) {
      ensureDefaultGroup();
      groups.value[0].codes.push(...orphans);
    }

    const apiCodeSet = new Set(apiCodes);
    groups.value = groups.value.map((g) => ({
      ...g,
      codes: g.codes.filter((c) => apiCodeSet.has(c.toLowerCase())),
    }));
    saveGroups();
  } catch (e) {
    console.error("[watchlist] sync from API failed", e);
  }
}

function handleAuthExpired() {
  doLogout();
  router.push("/login");
  ElMessage.warning("登录已过期，请重新登录");
}

onMounted(async () => {
  checkH5();
  window.addEventListener("resize", checkH5);
  window.addEventListener("auth:expired", handleAuthExpired);
  loadGroups();
  await syncWatchlistFromApi();
  loadStockPrice();
  loadAlerts();
  loadViewSettings();
  loadAiHistory();
  updateGroupDrafts();
  loadStockList();
  loadMarketIndices();
});
onUnmounted(() => {
  window.removeEventListener("resize", checkH5);
  window.removeEventListener("auth:expired", handleAuthExpired);
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
.app.h5 .header {
  margin-bottom: 1rem;
  padding: 0.85rem 1rem;
}
.app.h5 .header-inner {
  gap: 0.4rem 0.75rem;
}
.app.h5 .brand-icon {
  display: none;
}
.app.h5 .title {
  font-size: 1.1rem;
}
.app.h5 .subtitle {
  display: none;
}
.app.h5 .header-status {
  order: 2;
  margin-left: auto;
}
.app.h5 .quick-links {
  display: none;
}
.app.h5 .section-head {
  flex-wrap: wrap;
  gap: 0.4rem;
}
.app.h5 .actions {
  flex-wrap: wrap;
  gap: 0.35rem;
  width: 100%;
}
.app.h5 .watchlist-section,
.app.h5 .tools-section {
  padding: 0.85rem;
  border-radius: var(--radius-sm);
}
.app.h5 .tools-section {
  margin-bottom: 0.75rem;
}
.app.h5 .group-select {
  min-width: 80px;
}
.app.h5 .indices-bar {
  gap: 0.5rem;
}
.app.h5 .index-card {
  min-width: 0;
  padding: 0.45rem 0.65rem;
  font-size: 0.85rem;
}
.app.h5 .index-card .index-name {
  font-size: 0.7rem;
}
.app.h5 .index-card .index-price {
  font-size: 0.85rem;
}
.app.h5 .summary-grid {
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}
.app.h5 .summary-card {
  padding: 0.65rem 0.75rem;
}
.app.h5 .summary-label {
  font-size: 0.7rem;
}
.app.h5 .summary-value {
  font-size: 1rem;
}
.app.h5 .section-title-row h2 {
  font-size: 0.95rem;
}
.app.h5 .tools-tabs :deep(.el-tabs__header) {
  margin-bottom: 0.5rem;
}

/* ===== Header ===== */
.header {
  margin-bottom: 1.75rem;
  padding: 1.25rem 1.5rem;
  border-radius: var(--radius-lg);
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.08) 0%,
    rgba(59, 130, 246, 0.05) 50%,
    rgba(56, 189, 248, 0.03) 100%
  );
  border: 1px solid rgba(99, 102, 241, 0.12);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.header-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.5rem;
}
.header-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.brand-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: linear-gradient(
    135deg,
    var(--accent) 0%,
    var(--accent-secondary) 100%
  );
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 2px 12px rgba(99, 102, 241, 0.3);
}
.title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, var(--text) 0%, var(--accent-light) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.subtitle {
  color: var(--text-muted);
  font-size: 0.8rem;
  margin: 0;
}
.header-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.75rem;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: background var(--transition-base);
}
.status-dot.active {
  background: var(--up);
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
.status-text {
  font-size: 0.75rem;
  color: var(--text-muted);
}
.quick-links {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}
.quick-links a {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 0.8125rem;
  padding: 0.35rem 0.75rem;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  transition: all var(--transition-fast);
}
.quick-links a:hover {
  color: var(--accent-light);
  background: var(--accent-glow);
  border-color: rgba(99, 102, 241, 0.2);
  transform: translateY(-1px);
}
.link-icon {
  font-size: 0.75rem;
  opacity: 0.6;
}

/* ===== Main Layout ===== */
.main {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* ===== Section Cards ===== */
.watchlist-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.25rem 1.5rem;
  box-shadow: var(--shadow-md);
  transition:
    box-shadow var(--transition-base),
    border-color var(--transition-base);
}
.watchlist-section:hover {
  box-shadow: var(--shadow-lg), var(--shadow-glow);
  border-color: var(--border-light);
}
.tools-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.25rem 1.5rem;
  box-shadow: var(--shadow-md);
  transition:
    box-shadow var(--transition-base),
    border-color var(--transition-base);
}
.tools-section:hover {
  box-shadow: var(--shadow-lg), var(--shadow-glow);
  border-color: var(--border-light);
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

/* ===== Section Head ===== */
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
  font-size: 0.7rem;
  color: var(--text-muted);
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
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
  flex-wrap: wrap;
}

/* ===== Summary Cards ===== */
.indices-bar {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.index-card {
  flex: 1;
  min-width: 140px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  font-variant-numeric: tabular-nums;
  transition: border-color 0.2s;
}
.index-card:hover {
  border-color: var(--accent);
}
.index-card .index-name {
  font-size: 0.8rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.index-card .index-price {
  font-weight: 600;
  font-size: 0.95rem;
}
.index-card .index-change {
  font-size: 0.8rem;
  font-weight: 600;
  margin-left: auto;
}
.index-card.up .index-price,
.index-card.up .index-change {
  color: var(--up);
}
.index-card.down .index-price,
.index-card.down .index-change {
  color: var(--down);
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.summary-card {
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem 1rem;
  transition: all var(--transition-base);
}
.summary-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--accent), var(--accent-secondary));
  opacity: 0;
  transition: opacity var(--transition-base);
}
.summary-card:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--border-light);
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}
.summary-card:hover::before {
  opacity: 1;
}
.summary-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 0.4rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.summary-value {
  font-size: 1.1rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.summary-value.masked {
  letter-spacing: 0.12em;
  color: var(--text-muted);
}
.summary-sub {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
  font-variant-numeric: tabular-nums;
}

/* ===== Alerts ===== */
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

/* ===== Groups ===== */
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

/* ===== Utility ===== */
.muted {
  color: var(--text-muted);
}
.up {
  color: var(--up);
}
.down {
  color: var(--down);
}

/* ===== AI Dialog ===== */
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
  padding: 0.6rem 0.85rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
  transition: all var(--transition-fast);
}
.ai-history-item:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--border-light);
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
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}
.ai-row:last-child {
  border-bottom: none;
}

/* ===== K-line ===== */
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
  border-radius: var(--radius);
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
  border-radius: var(--radius);
  padding: 0.85rem;
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
  font-weight: 500;
}
.ai-value {
  color: var(--text);
}
.ai-disclaimer {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--border);
  color: var(--text-muted);
  font-size: 0.8rem;
  font-style: italic;
}
.ai-pick-item {
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}
.ai-pick-item:last-child {
  border-bottom: none;
}
.ai-pick-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.35rem;
}
.market-mode-tabs {
  margin-bottom: 1rem;
}
.streak-scan-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.streak-scan-days {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.streak-tag {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  line-height: 1.5;
}
.streak-tag.up {
  color: var(--up);
  background: rgba(239, 68, 68, 0.12);
}
.streak-tag.down {
  color: var(--down);
  background: rgba(34, 197, 94, 0.12);
}
.streak-scan-table .up {
  color: var(--up);
  font-weight: 600;
}
.streak-scan-table .down {
  color: var(--down);
  font-weight: 600;
}

/* User dropdown */
.user-dropdown {
  margin-left: 0.5rem;
}
.user-avatar-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
  cursor: pointer;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.2);
  color: #c7d2fe;
  font-size: 0.85rem;
  transition: all 0.15s;
}
.user-avatar-btn:hover {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.4);
}
.user-name {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Trades */
.trades-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

/* Journals list */
.journals-list {
  max-height: 500px;
  overflow-y: auto;
}
.journal-card {
  padding: 1rem;
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.04);
  border: 1px solid rgba(99, 102, 241, 0.1);
  margin-bottom: 0.75rem;
}
.journal-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}
.journal-card-tags {
  margin-bottom: 0.4rem;
}
.journal-card-content {
  font-size: 0.875rem;
  color: #94a3b8;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.journal-card-footer {
  margin-top: 0.5rem;
  font-size: 0.75rem;
}
</style>
