import { MODULE_BY_KEY } from '@/data/modules'
import {
  allRows,
  boneArchiveStorageKey,
  boneReturnStorageKey,
  listCollection,
  listRows,
  resetRows,
  saveCollection,
  saveRows,
} from '@/data/local-store'
import type {
  ActionResult,
  BoneConclusionArchive,
  BoneConclusionInput,
  BoneReturnNotice,
  EntryRow,
  ModuleMeta,
  OverviewResult,
  PageResult,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

const BONE_KEY = 'bone'
const BONE_PENDING = '待鉴定'
const BONE_DOING = '鉴定中'
const BONE_DONE = '已鉴定'
const BONE_RETURNED = '已退样'

// 鉴定结论字段：退样时这些字段要随标本室登记那一份一并清空，回到未出具结论的口径。
const BONE_CONCLUSION_FIELDS: (keyof BoneConclusionInput)[] = [
  '种属',
  '可鉴定性别',
  '年龄估计',
  '病理现象',
]
const BONE_STATUS_FIELD = '鉴定状态'

// 骨骼标本允许的状态流转：不在表里的跨态操作一律拒绝，避免重复退样、倒着流转把清单写花。
// 退样后结论已清空回待鉴定，允许再次提交鉴定，但已退样不能再退一次。
const BONE_FLOW: Record<string, string> = {
  提交鉴定: `${BONE_PENDING}->${BONE_DOING},${BONE_RETURNED}->${BONE_DOING}`,
  出具结论: `${BONE_DOING}->${BONE_DONE}`,
  办理退样: `${BONE_DOING}->${BONE_RETURNED},${BONE_DONE}->${BONE_RETURNED}`,
}

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

// 通用动作：骨骼标本走专用状态机，其余模块沿用原来的目标态流转。
export function runAction(key: string, id: number, action: string): ActionResult {
  if (key === BONE_KEY) {
    return runBoneAction(id, action)
  }
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

function boneCanFlow(current: string, action: string): boolean {
  const rule = BONE_FLOW[action]
  if (!rule) {
    return false
  }
  // 每条规则形如 "来源态->目标态"，当前状态命中任一来源态即允许。
  return rule.split(',').some((pair) => pair.split('->')[0] === current)
}

function runBoneAction(id: number, action: string): ActionResult {
  const rows = listRows(BONE_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的骨骼标本` }
  }
  const current = String(rows[index].status)
  if (action === '办理退样') {
    return returnBone(rows[index].id as number)
  }
  if (!boneCanFlow(current, action)) {
    return {
      ok: false,
      message: `标本${rows[index]['标本编号']}当前是「${current}」，不能${action}`,
    }
  }
  if (action === '出具结论') {
    return { ok: false, message: `标本${rows[index]['标本编号']}请通过鉴定表单出具结论并留档` }
  }
  const target = BONE_DOING
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    [BONE_STATUS_FIELD]: target,
    pending: true,
    abnormal: false,
  }
  const next = [...rows]
  next[index] = updated
  // 退样后重新送鉴定：旧批复留档但标失效，新一轮退样会再下一份批复，当前批复始终唯一。
  const code = String(updated['标本编号'])
  const notices = listCollection<BoneReturnNotice>(boneReturnStorageKey).map((notice) =>
    notice.标本编号 === code && notice.是否有效 ? { ...notice, 是否有效: false } : notice,
  )
  saveRows(BONE_KEY, next)
  saveCollection(boneReturnStorageKey, notices)
  return { ok: true, message: `标本${code}已提交鉴定，当前状态「${target}」` }
}

// 列表、详情、送检清单统一从这一份存储行取编号，保证两处读到的标本编号一致。
export function getBone(id: number): EntryRow | null {
  const row = listRows(BONE_KEY).find((item) => Number(item.id) === id)
  return row ? { ...row } : null
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// 出具鉴定结论：结论写进标本室登记的存储行，并按当时口径在历史档案留一批；重复出具只新增批次，不改旧档。
export function issueBoneConclusion(id: number, input: BoneConclusionInput): ActionResult {
  const missing = BONE_CONCLUSION_FIELDS.filter((field) => String(input[field] ?? '').trim() === '')
  if (missing.length > 0) {
    return { ok: false, message: `请补全${missing.join('、')}后再出具结论` }
  }
  const rows = listRows(BONE_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的骨骼标本` }
  }
  const current = String(rows[index].status)
  if (current === BONE_RETURNED) {
    return { ok: false, message: `标本${rows[index]['标本编号']}已退样，不能再出具鉴定结论` }
  }

  const archives = listCollection<BoneConclusionArchive>(boneArchiveStorageKey)
  const code = String(rows[index]['标本编号'])
  const batch = archives.filter((item) => item.标本编号 === code).length + 1
  const archive: BoneConclusionArchive = {
    id: archives.length + 1,
    标本编号: code,
    种属: input.种属.trim(),
    可鉴定性别: input.可鉴定性别.trim(),
    年龄估计: input.年龄估计.trim(),
    病理现象: input.病理现象.trim(),
    出具日期: today(),
    留档批次: batch,
  }
  const updated: EntryRow = {
    ...rows[index],
    ...{
      种属: archive.种属,
      可鉴定性别: archive.可鉴定性别,
      年龄估计: archive.年龄估计,
      病理现象: archive.病理现象,
    },
    status: BONE_DONE,
    [BONE_STATUS_FIELD]: BONE_DONE,
    pending: false,
    abnormal: false,
  }
  const nextRows = [...rows]
  nextRows[index] = updated
  // 结论与档案一次落库：以标本室登记行为准绳，清单不再持有另一份会打架的值。
  persistBone(nextRows, [...archives, archive])
  return { ok: true, message: `标本${code}鉴定结论已出具并留档（第 ${batch} 批）` }
}

function persistBone(rows: EntryRow[], archives: BoneConclusionArchive[]): void {
  saveRows(BONE_KEY, rows)
  saveCollection(boneArchiveStorageKey, archives)
}

function buildReturnNotice(row: EntryRow, seq: number, round: number): BoneReturnNotice {
  return {
    id: seq,
    标本编号: String(row['标本编号']),
    出土单位: String(row['出土单位'] ?? ''),
    批复编号: `RTN-${String(seq).padStart(4, '0')}`,
    批复日期: today(),
    批复结论: '标本已退样，鉴定结论作废清空，回待鉴定',
    接收去向: '送检单位',
    退样轮次: round,
    是否有效: true,
  }
}

// 退样只生效一次：已退样直接判重并复用当前有效批复，不新增记录、不重复写结论。
// 只有鉴定中、已鉴定可退；退样把标本室登记行的结论字段清空、鉴定状态回待鉴定，并补一份退样批复到送检清单。
export function returnBone(id: number): ActionResult {
  const rows = listRows(BONE_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的骨骼标本` }
  }
  const row = rows[index]
  const code = String(row['标本编号'])
  const notices = listCollection<BoneReturnNotice>(boneReturnStorageKey)
  const activeNotice = notices.find((notice) => notice.标本编号 === code && notice.是否有效)
  if (String(row.status) === BONE_RETURNED) {
    return {
      ok: false,
      message: activeNotice
        ? `标本${code}已退样，批复${activeNotice.批复编号}已下达，无需重复办理`
        : `标本${code}已退样，无需重复办理`,
    }
  }
  if (![BONE_DOING, BONE_DONE].includes(String(row.status))) {
    return { ok: false, message: `标本${code}当前是「${row.status}」，还没送鉴定，没有可退的样` }
  }

  const cleared: EntryRow = { ...row }
  for (const field of BONE_CONCLUSION_FIELDS) {
    cleared[field] = ''
  }
  cleared.status = BONE_RETURNED
  cleared[BONE_STATUS_FIELD] = BONE_PENDING
  cleared.pending = false
  cleared.abnormal = false

  const nextRows = [...rows]
  nextRows[index] = cleared
  const round = notices.filter((notice) => notice.标本编号 === code).length + 1
  const notice = buildReturnNotice(row, notices.length + 1, round)
  const nextNotices = [...notices, notice]
  saveRows(BONE_KEY, nextRows)
  saveCollection(boneReturnStorageKey, nextNotices)
  return { ok: true, message: `标本${code}已退样，批复${notice.批复编号}已下达送检清单` }
}

// 批量退样：逐条返回结果。失败的保留在原处、不顶掉已成功的，可对失败项单独重试；已退样的幂等判重不产生第二条批复。
export function returnBoneBatch(ids: number[]): { id: number; ok: boolean; message: string }[] {
  return ids.map((id) => {
    const result = returnBone(id)
    return { id, ok: result.ok, message: result.message }
  })
}

// 可退样的标本：鉴定中、已鉴定，且确实没有退样批复。
export function returnableBones(filters: Record<string, string> = {}): EntryRow[] {
  return filterRows(listRows(BONE_KEY), filters).filter((row) =>
    [BONE_DOING, BONE_DONE].includes(String(row.status)),
  )
}

export function listBoneArchive(): BoneConclusionArchive[] {
  return listCollection<BoneConclusionArchive>(boneArchiveStorageKey)
}

export function listBoneReturns(): BoneReturnNotice[] {
  return listCollection<BoneReturnNotice>(boneReturnStorageKey)
}

// 送检那边清单：已送进鉴定流程（鉴定中及之后）的标本，编号一律取标本室登记行，
// 退样批复一旦下达就在这张清单体现。
export type SentBoneRow = {
  id: number
  标本编号: string
  出土单位: string
  标本状态: string
  批复编号: string
  退样轮次: string
  批复结论: string
  [field: string]: string | number
}

export function listSentBones(): SentBoneRow[] {
  const rows = listRows(BONE_KEY)
  const notices = listCollection<BoneReturnNotice>(boneReturnStorageKey)
  // 送检清单只认当前有效的退样批复；重新送鉴定后旧批复已标失效，不再显示。
  const noticeByCode = new Map(
    notices
      .filter((notice) => notice.是否有效)
      .map((notice) => [notice.标本编号, notice]),
  )
  return rows
    .filter((row) => ![BONE_PENDING].includes(String(row.status)))
    .map((row) => {
      const notice = noticeByCode.get(String(row['标本编号']))
      return {
        id: Number(row.id),
        标本编号: String(row['标本编号']),
        出土单位: String(row['出土单位'] ?? ''),
        标本状态: String(row.status),
        批复编号: notice ? notice.批复编号 : '—',
        退样轮次: notice ? `第 ${notice.退样轮次} 轮` : '—',
        批复结论: notice ? notice.批复结论 : '鉴定进行中，暂无退样批复',
      }
    })
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `﻿${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
