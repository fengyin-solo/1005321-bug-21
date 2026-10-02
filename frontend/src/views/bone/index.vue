<template>
  <section class="page" data-module="bone">
    <header class="page-head">
      <div>
        <h2>骨骼标本管理</h2>
        <p class="page-desc">维护骨骼标本，围绕标本编号、出土单位、种属、骨骼部位做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记骨骼标本</button>
        <button class="btn" type="button" @click="exportRows">导出骨骼标本清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <section class="return-panel">
      <h3 class="return-title">退样办理</h3>
      <p class="return-desc">
        只有「已鉴定」的标本可以办理退样；退样后鉴定结论清空、状态回到「待鉴定」，批复会落入测年送检清单，同一标本只生效一次。
      </p>
      <table v-if="returnable.length" class="data-table">
        <thead>
          <tr>
            <th>标本编号</th>
            <th>出土单位</th>
            <th>种属</th>
            <th>年龄估计</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in returnable" :key="String(row.id)">
            <td>{{ row['标本编号'] ?? '—' }}</td>
            <td>{{ row['出土单位'] ?? '—' }}</td>
            <td>{{ row['种属'] ?? '—' }}</td>
            <td>{{ row['年龄估计'] ?? '—' }}</td>
            <td class="row-actions">
              <button class="link" type="button" @click="submitReturn(Number(row.id))">办理退样</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-state">当前没有可退样的标本：清单里没有「已鉴定」的标本，鉴定出具结论后才会出现在这里。</p>
      <p v-if="returnMessage" class="return-message" :class="{ 'error-text': returnFailed }">
        {{ returnMessage }}
        <button v-if="returnRetryId !== null" class="link" type="button" @click="submitReturn(returnRetryId)">重试</button>
      </p>
    </section>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <RouterLink class="link" :to="`/bone/${row.id}`">详情</RouterLink>
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无骨骼标本数据，可先登记骨骼标本</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条骨骼标本记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  listReturnableBones,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('bone')
const columns = ["标本编号", "出土单位", "种属", "骨骼部位", "可鉴定性别", "年龄估计", "病理现象", "鉴定状态"]
const actions = ["提交鉴定", "出具结论", "办理退样"]
const statuses = ["待鉴定", "鉴定中", "已鉴定", "已退样"]
const stats = [{"label": "待鉴定标本", "value": 0}, {"label": "鉴定中标本", "value": 0}, {"label": "已鉴定标本", "value": 0}]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const returnable = ref<EntryRow[]>([])
const returnMessage = ref('')
const returnFailed = ref(false)
const returnRetryId = ref<number | null>(null)
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '骨骼标本登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function submitReturn(id: number) {
  returnMessage.value = ''
  returnFailed.value = false
  returnRetryId.value = null
  const result = applyAction(meta.key, id, '办理退样')
  returnMessage.value = result.message
  if (!result.ok) {
    returnFailed.value = true
    // 写入失败可以原样重试；重试走同一条幂等流程，不会顶掉已有登记
    returnRetryId.value = result.retryable ? id : null
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    returnable.value = listReturnableBones()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '骨骼标本列表读取失败'
  }
}

onMounted(reload)
</script>
