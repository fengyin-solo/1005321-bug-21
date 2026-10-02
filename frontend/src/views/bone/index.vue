<template>
  <section class="page" data-module="bone">
    <header class="page-head">
      <div>
        <h2>骨骼标本管理</h2>
        <p class="page-desc">维护骨骼标本，围绕标本编号、出土单位、种属、骨骼部位做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记骨骼标本</button>
        <button class="btn" type="button" @click="openReturnDialog">批量办理退样</button>
        <button class="btn" type="button" @click="openArchive">查看鉴定档案</button>
        <RouterLink class="btn ghost" :to="sentPath">送检清单</RouterLink>
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
          <td v-for="column in columns" :key="column">
            <RouterLink v-if="column === '标本编号'" class="link" :to="detailPath(row.id)">
              {{ row[column] ?? '—' }}
            </RouterLink>
            <template v-else>{{ row[column] || '—' }}</template>
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              :disabled="!canRun(action, row)"
              :title="actionHint(action, row)"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
            <RouterLink class="link" :to="detailPath(row.id)">详情</RouterLink>
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

    <!-- 出具鉴定结论 -->
    <div v-if="conclusionTarget" class="modal-mask" @click.self="closeConclusion">
      <div class="modal">
        <h3>出具鉴定结论 · {{ conclusionTarget['标本编号'] }}</h3>
        <p class="page-desc">结论按当前口径写入标本室登记并在鉴定档案留批；退样后档案仍按出具当时保留。</p>
        <div class="form-grid">
          <label>
            <span>种属</span>
            <input v-model="conclusionForm.种属" placeholder="如：家猪" />
          </label>
          <label>
            <span>可鉴定性别</span>
            <input v-model="conclusionForm.可鉴定性别" placeholder="如：雌性" />
          </label>
          <label>
            <span>年龄估计</span>
            <input v-model="conclusionForm.年龄估计" placeholder="如：2 岁左右" />
          </label>
          <label>
            <span>病理现象</span>
            <input v-model="conclusionForm.病理现象" placeholder="如：无" />
          </label>
        </div>
        <p v-if="conclusionError" class="error-text">{{ conclusionError }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeConclusion">取消</button>
          <button class="btn primary" type="button" @click="submitConclusion">确认出具</button>
        </div>
      </div>
    </div>

    <!-- 批量退样 -->
    <div v-if="returnDialog" class="modal-mask" @click.self="closeReturnDialog">
      <div class="modal modal-wide">
        <h3>批量办理退样</h3>
        <p class="page-desc">只列出可退样（鉴定中、已鉴定）的标本；退样会清空鉴定结论、鉴定状态回待鉴定，并向送检清单下达批复。</p>
        <p v-if="returnError" class="error-text">{{ returnError }}</p>
        <table v-if="returnCandidates.length" class="data-table">
          <thead>
            <tr>
              <th>标本编号</th>
              <th>出土单位</th>
              <th>种属</th>
              <th>年龄估计</th>
              <th>当前状态</th>
              <th>办理结果</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in returnCandidates" :key="String(item.id)">
              <td>{{ item['标本编号'] }}</td>
              <td>{{ item['出土单位'] }}</td>
              <td>{{ item['种属'] || '—' }}</td>
              <td>{{ item['年龄估计'] || '—' }}</td>
              <td>{{ item.status }}</td>
              <td>
                <template v-if="returnResults[item.id]?.ok">
                  <span class="ok-text">{{ returnResults[item.id].message }}</span>
                </template>
                <template v-else-if="returnResults[item.id]">
                  <span class="error-text">{{ returnResults[item.id].message }}</span>
                  <button class="link" type="button" @click="retryReturn(item.id)">重试</button>
                </template>
                <template v-else>
                  <button class="link" type="button" @click="retryReturn(item.id)">办理退样</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-state">当前没有可退样的标本：只有鉴定中或已鉴定、且尚未退样的标本可以办理退样。</p>
        <div class="modal-actions">
          <span class="page-desc">已成功 {{ successCount }} 条，失败 {{ failCount }} 条，待办理 {{ pendingCount }} 条。</span>
          <button class="btn primary" type="button" :disabled="!returnCandidates.length" @click="returnAll">
            全部办理
          </button>
          <button class="btn ghost" type="button" @click="closeReturnDialog">关闭</button>
        </div>
      </div>
    </div>

    <!-- 鉴定结论历史档案 -->
    <div v-if="archiveDialog" class="modal-mask" @click.self="closeArchive">
      <div class="modal modal-wide">
        <h3>鉴定结论历史档案</h3>
        <p class="page-desc">已出具的结论按出具当时口径留档；标本退样只清空当前登记，不改动这份档案。</p>
        <table v-if="archiveRows.length" class="data-table">
          <thead>
            <tr>
              <th>标本编号</th>
              <th>种属</th>
              <th>可鉴定性别</th>
              <th>年龄估计</th>
              <th>病理现象</th>
              <th>出具日期</th>
              <th>留档批次</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in archiveRows" :key="String(item.id)">
              <td>{{ item.标本编号 }}</td>
              <td>{{ item.种属 }}</td>
              <td>{{ item.可鉴定性别 }}</td>
              <td>{{ item.年龄估计 }}</td>
              <td>{{ item.病理现象 }}</td>
              <td>{{ item.出具日期 }}</td>
              <td>第 {{ item.留档批次 }} 批</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-state">暂无鉴定结论档案，出具结论后会按当时口径在此留档。</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeArchive">关闭</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  downloadEntries,
  issueBoneConclusion,
  listBoneArchive,
  listEntries,
  moduleMeta,
  returnBoneBatch,
  returnableBones,
  runAction as applyAction,
} from '@/api/local-service'
import type { BoneConclusionArchive, BoneConclusionInput, EntryRow } from '@/data/types'

const meta = moduleMeta('bone')
const columns = ["标本编号", "出土单位", "种属", "骨骼部位", "可鉴定性别", "年龄估计", "病理现象", "鉴定状态"]
const actions = ["提交鉴定", "出具结论", "办理退样"] as const
const sentPath = '/bone/sent'

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

const statusSummary = computed(() =>
  meta.statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const stats = computed(() => [
  { label: '待鉴定标本', value: rows.value.filter((row) => String(row.status) === '待鉴定').length },
  { label: '鉴定中标本', value: rows.value.filter((row) => String(row.status) === '鉴定中').length },
  { label: '已鉴定标本', value: rows.value.filter((row) => String(row.status) === '已鉴定').length },
])

function detailPath(id: number | string | boolean): string {
  return `/bone/${Number(id)}`
}

// 动作可用性由数据层状态机决定，这里只做呈现层的禁用，避免点出必然失败的操作。
function canRun(action: string, row: EntryRow): boolean {
  const status = String(row.status)
  if (action === '提交鉴定') return status === '待鉴定' || status === '已退样'
  if (action === '出具结论') return status === '鉴定中'
  if (action === '办理退样') return status === '鉴定中' || status === '已鉴定'
  return false
}

function actionHint(action: string, row: EntryRow): string {
  return canRun(action, row) ? action : `「${row.status}」状态下不能${action}`
}

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
  if (action === '出具结论') {
    openConclusion(row)
    return
  }
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
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
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '骨骼标本列表读取失败'
  }
}

// ---- 出具结论 ----
const conclusionTarget = ref<EntryRow | null>(null)
const conclusionError = ref('')
const conclusionForm = reactive<BoneConclusionInput>({
  种属: '',
  可鉴定性别: '',
  年龄估计: '',
  病理现象: '',
})

function openConclusion(row: EntryRow) {
  conclusionTarget.value = row
  conclusionError.value = ''
  conclusionForm.种属 = String(row['种属'] ?? '')
  conclusionForm.可鉴定性别 = String(row['可鉴定性别'] ?? '')
  conclusionForm.年龄估计 = String(row['年龄估计'] ?? '')
  conclusionForm.病理现象 = String(row['病理现象'] ?? '')
}

function closeConclusion() {
  conclusionTarget.value = null
}

function submitConclusion() {
  if (!conclusionTarget.value) {
    return
  }
  const result = issueBoneConclusion(Number(conclusionTarget.value.id), { ...conclusionForm })
  if (!result.ok) {
    conclusionError.value = result.message
    return
  }
  closeConclusion()
  reload()
}

// ---- 批量退样：失败保留、可重试，不顶掉已成功的 ----
const returnDialog = ref(false)
const returnError = ref('')
const returnCandidates = ref<EntryRow[]>([])
const returnResults = reactive<Record<number, { ok: boolean; message: string }>>({})

const successCount = computed(
  () => Object.values(returnResults).filter((result) => result.ok).length,
)
const failCount = computed(
  () => Object.values(returnResults).filter((result) => !result.ok).length,
)
const pendingCount = computed(
  () => returnCandidates.value.length - Object.keys(returnResults).length,
)

function openReturnDialog() {
  returnDialog.value = true
  returnError.value = ''
  // 每次打开都从存储重算可退样清单，退过的不会再出现，保证退样只生效一次。
  returnCandidates.value = returnableBones()
  for (const key of Object.keys(returnResults)) {
    delete returnResults[Number(key)]
  }
}

function closeReturnDialog() {
  returnDialog.value = false
  reload()
}

function retryReturn(id: number) {
  returnError.value = ''
  // 幂等：重复办理同一标本只会得到判重提示或成功一次，不会冒出第二条批复。
  const [result] = returnBoneBatch([id])
  returnResults[id] = { ok: result.ok, message: result.message }
  // 成功后从可退样清单移除该标本，列表即时反映已退样。
  if (result.ok) {
    returnCandidates.value = returnCandidates.value.filter((item) => Number(item.id) !== id)
  }
}

function returnAll() {
  const ids = returnCandidates.value.map((item) => Number(item.id))
  if (!ids.length) {
    return
  }
  const batch = returnBoneBatch(ids)
  const okIds = new Set<number>()
  for (const result of batch) {
    returnResults[result.id] = { ok: result.ok, message: result.message }
    if (result.ok) {
      okIds.add(result.id)
    }
  }
  // 已成功的从待办里拿掉，失败的留在原地可继续重试，不被成功项顶掉。
  returnCandidates.value = returnCandidates.value.filter((item) => !okIds.has(Number(item.id)))
}

// ---- 历史档案 ----
const archiveDialog = ref(false)
const archiveRows = ref<BoneConclusionArchive[]>([])

function openArchive() {
  archiveDialog.value = true
  archiveRows.value = listBoneArchive()
}

function closeArchive() {
  archiveDialog.value = false
}

onMounted(reload)
</script>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}
.modal {
  background: #fff;
  border-radius: 10px;
  padding: 18px 20px;
  width: 460px;
  max-height: 86vh;
  overflow: auto;
}
.modal-wide { width: 760px; }
.modal h3 { margin: 0 0 8px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0; }
.form-grid span { display: block; font-size: 12px; color: var(--muted); }
.form-grid input { width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; align-items: center; margin-top: 10px; }
.ok-text { color: #067647; }
.link:disabled { color: #9aa4b2; cursor: not-allowed; }
</style>
