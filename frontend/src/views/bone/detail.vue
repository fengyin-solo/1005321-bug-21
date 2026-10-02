<template>
  <section class="page" data-module="bone-detail">
    <header class="page-head">
      <div>
        <h2>骨骼标本详情</h2>
        <p class="page-desc">编号与字段统一取自标本室登记的存储记录，和列表页读到的是同一份，不会两处不一致。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/bone">返回列表</RouterLink>
        <RouterLink class="btn ghost" to="/bone/sent">送检清单</RouterLink>
      </div>
    </header>

    <article v-if="row" class="detail-card">
      <h3>{{ row['标本编号'] }} <span class="status-tag">{{ row.status }}</span></h3>
      <dl class="detail-grid">
        <div v-for="field in fields" :key="field">
          <dt>{{ field }}</dt>
          <dd>{{ row[field] || '—' }}</dd>
        </div>
      </dl>

      <div class="detail-actions">
        <button
          v-for="action in actions"
          :key="action"
          class="btn"
          type="button"
          :class="{ primary: action === '出具结论' }"
          :disabled="!canRun(action)"
          @click="onAction(action)"
        >
          {{ action }}
        </button>
      </div>
      <p v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</p>
    </article>

    <div v-else class="empty-state detail-card">
      未找到该骨骼标本登记记录（编号可能有误或已被重置）。
      <RouterLink class="link" to="/bone">返回列表</RouterLink>
    </div>

    <section v-if="row" class="archive-block">
      <h3>鉴定结论历史档案</h3>
      <p class="page-desc">历史标本沿用历史档案里的结论，按出具当时口径保留；退样不清空、不改写。</p>
      <table v-if="archive.length" class="data-table">
        <thead>
          <tr>
            <th>种属</th>
            <th>可鉴定性别</th>
            <th>年龄估计</th>
            <th>病理现象</th>
            <th>出具日期</th>
            <th>留档批次</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in archive" :key="String(item.id)">
            <td>{{ item.种属 }}</td>
            <td>{{ item.可鉴定性别 }}</td>
            <td>{{ item.年龄估计 }}</td>
            <td>{{ item.病理现象 }}</td>
            <td>{{ item.出具日期 }}</td>
            <td>第 {{ item.留档批次 }} 批</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-state">该标本尚未出具过鉴定结论，暂无历史档案。</p>
    </section>

    <!-- 出具结论 -->
    <div v-if="conclusionOpen" class="modal-mask" @click.self="closeConclusion">
      <div class="modal">
        <h3>出具鉴定结论 · {{ row?.['标本编号'] }}</h3>
        <div class="form-grid">
          <label>
            <span>种属</span>
            <input v-model="form.种属" placeholder="如：家猪" />
          </label>
          <label>
            <span>可鉴定性别</span>
            <input v-model="form.可鉴定性别" placeholder="如：雌性" />
          </label>
          <label>
            <span>年龄估计</span>
            <input v-model="form.年龄估计" placeholder="如：2 岁左右" />
          </label>
          <label>
            <span>病理现象</span>
            <input v-model="form.病理现象" placeholder="如：无" />
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeConclusion">取消</button>
          <button class="btn primary" type="button" @click="submitConclusion">确认出具</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  getBone,
  issueBoneConclusion,
  listBoneArchive,
  runAction as applyAction,
} from '@/api/local-service'
import type { BoneConclusionArchive, BoneConclusionInput, EntryRow } from '@/data/types'

const route = useRoute()
const fields = ["标本编号", "出土单位", "种属", "骨骼部位", "可鉴定性别", "年龄估计", "病理现象", "鉴定状态"]
const actions = ["提交鉴定", "出具结论", "办理退样"] as const

const boneId = computed(() => Number(route.params.id))
const row = ref<EntryRow | null>(getBone(boneId.value))
const message = ref('')
const messageOk = ref(false)
const archive = ref<BoneConclusionArchive[]>([])

function refresh() {
  row.value = getBone(boneId.value)
  if (row.value) {
    archive.value = listBoneArchive().filter(
      (item) => item.标本编号 === String(row.value!['标本编号']),
    )
  }
}
refresh()

function canRun(action: string): boolean {
  if (!row.value) return false
  const status = String(row.value.status)
  if (action === '提交鉴定') return status === '待鉴定' || status === '已退样'
  if (action === '出具结论') return status === '鉴定中'
  if (action === '办理退样') return status === '鉴定中' || status === '已鉴定'
  return false
}

function onAction(action: string) {
  message.value = ''
  if (action === '出具结论') {
    openConclusion()
    return
  }
  const result = applyAction('bone', boneId.value, action)
  message.value = result.message
  messageOk.value = result.ok
  refresh()
}

const conclusionOpen = ref(false)
const form = reactive<BoneConclusionInput>({ 种属: '', 可鉴定性别: '', 年龄估计: '', 病理现象: '' })

function openConclusion() {
  if (!row.value) return
  conclusionOpen.value = true
  form.种属 = String(row.value['种属'] ?? '')
  form.可鉴定性别 = String(row.value['可鉴定性别'] ?? '')
  form.年龄估计 = String(row.value['年龄估计'] ?? '')
  form.病理现象 = String(row.value['病理现象'] ?? '')
}

function closeConclusion() {
  conclusionOpen.value = false
}

function submitConclusion() {
  const result = issueBoneConclusion(boneId.value, { ...form })
  message.value = result.message
  messageOk.value = result.ok
  if (result.ok) {
    closeConclusion()
    refresh()
  }
}
</script>

<style scoped>
.detail-card { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; }
.status-tag { font-size: 13px; color: var(--brand); font-weight: normal; }
.detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 24px; margin: 12px 0; }
.detail-grid dt { font-size: 12px; color: var(--muted); }
.detail-grid dd { margin: 2px 0 0; }
.detail-actions { display: flex; gap: 8px; }
.archive-block { margin-top: 18px; }
.modal-mask { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center; justify-content: center; z-index: 20; }
.modal { background: #fff; border-radius: 10px; padding: 18px 20px; width: 460px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0; }
.form-grid span { display: block; font-size: 12px; color: var(--muted); }
.form-grid input { width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.ok-text { color: #067647; }
.btn:disabled { color: #9aa4b2; cursor: not-allowed; }
</style>
