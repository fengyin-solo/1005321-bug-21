<template>
  <section class="page" data-module="bone-sent">
    <header class="page-head">
      <div>
        <h2>标本送检清单与退样批复</h2>
        <p class="page-desc">送检单位这一侧的清单：标本编号与标本室登记一致，退样确认的批复下达到这里。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/bone">返回骨骼标本</RouterLink>
        <button class="btn" type="button" @click="reload">刷新批复</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">送检中（鉴定中/已鉴定）</span>
        <strong class="stat-value">{{ activeCount }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已收到退样批复</span>
        <strong class="stat-value">{{ returnedCount }}</strong>
      </article>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">
            <RouterLink v-if="column === '标本编号'" class="link" :to="`/bone/${row.id}`">
              {{ row[column] }}
            </RouterLink>
            <template v-else>{{ row[column] }}</template>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length" class="empty-state">
            当前没有送检中的骨骼标本，也没有退样批复；标本提交鉴定后会出现在这份清单。
          </td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ rows.length }} 条送检记录</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { listSentBones } from '@/api/local-service'
import type { SentBoneRow } from '@/api/local-service'

const columns = ["标本编号", "出土单位", "标本状态", "批复编号", "退样轮次", "批复结论"]
const rows = ref<SentBoneRow[]>([])

const activeCount = computed(
  () => rows.value.filter((row) => row.标本状态 === '鉴定中' || row.标本状态 === '已鉴定').length,
)
const returnedCount = computed(
  () => rows.value.filter((row) => row.标本状态 === '已退样').length,
)

function reload() {
  rows.value = listSentBones()
}

onMounted(reload)
</script>
