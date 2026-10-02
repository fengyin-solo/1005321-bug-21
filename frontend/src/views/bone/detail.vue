<template>
  <section class="page" data-module="bone-detail">
    <header class="page-head">
      <div>
        <h2>骨骼标本详情</h2>
        <p class="page-desc">与列表页读取同一条登记，标本编号以标本室登记为准。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/bone">返回骨骼标本列表</RouterLink>
      </div>
    </header>

    <table v-if="row" class="detail-grid">
      <tbody>
        <tr>
          <th>标本编号</th>
          <td>{{ row['标本编号'] ?? '—' }}</td>
        </tr>
        <tr v-for="field in detailFields" :key="field">
          <th>{{ field }}</th>
          <td>{{ row[field] === '' || row[field] == null ? '—' : row[field] }}</td>
        </tr>
        <tr>
          <th>当前状态</th>
          <td>{{ row.status }}</td>
        </tr>
        <tr v-if="row['退样批复']">
          <th>退样批复</th>
          <td>{{ row['退样批复'] }}（{{ row['退样日期'] ?? '—' }}），批复已落入测年送检清单</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty-state">没有找到这份骨骼标本，可能编号有误，请回列表页核对标本编号。</p>

    <footer class="page-foot">
      <span v-if="row">标本编号：{{ row['标本编号'] ?? '—' }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { getEntry } from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const detailFields = ["出土单位", "种属", "骨骼部位", "可鉴定性别", "年龄估计", "病理现象", "鉴定状态"]

const route = useRoute()
const row = ref<EntryRow | null>(null)
const errorMessage = ref('')

function load() {
  errorMessage.value = ''
  const id = Number(route.params.id)
  if (!Number.isFinite(id)) {
    row.value = null
    errorMessage.value = '详情链接里的编号无效'
    return
  }
  try {
    row.value = getEntry('bone', id)
  } catch (error) {
    row.value = null
    errorMessage.value = error instanceof Error ? error.message : '骨骼标本详情读取失败'
  }
}

onMounted(load)
watch(() => route.params.id, load)
</script>
