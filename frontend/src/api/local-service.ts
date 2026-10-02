import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

// 骨骼标本退样规则：只有「已鉴定」的标本能退；退样把鉴定结论清空、状态退回「待鉴定」，
// 同一标本只生效一次；退样批复同步到测年送检清单，冲突时以标本室（bone）登记的那一份为准。
const BONE_KEY = 'bone'
const DATING_KEY = 'dating'
const BONE_RETURN_ACTION = '办理退样'
const BONE_IDENTIFIED_STATUS = '已鉴定'
const BONE_PENDING_STATUS = '待鉴定'
const BONE_CONCLUSION_FIELDS = ['种属', '可鉴定性别', '年龄估计', '病理现象', '鉴定状态']
const RETURN_APPROVAL_METHOD = '退样批复'

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

export function getEntry(key: string, id: number): EntryRow | null {
  moduleMeta(key)
  return listRows(key).find((row) => Number(row.id) === id) ?? null
}

function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function approvalNoFor(specimenNo: string): string {
  return `TSPL-${specimenNo}`
}

function isReturnApprovalFor(row: EntryRow, specimenNo: string): boolean {
  return (
    String(row['送检编号'] ?? '') === approvalNoFor(specimenNo) ||
    (String(row['样品来源'] ?? '') === specimenNo && String(row['测年方法'] ?? '') === RETURN_APPROVAL_METHOD)
  )
}

function buildReturnApproval(specimenNo: string, date: string, id: number): EntryRow {
  return {
    id,
    status: '已作废',
    pending: false,
    abnormal: false,
    送检编号: approvalNoFor(specimenNo),
    样品来源: specimenNo,
    承接实验室: '标本室',
    测年方法: RETURN_APPROVAL_METHOD,
    送检日期: date,
    校正年代: '—',
    报告收到日: date,
    送检状态: '退样批复已确认',
  }
}

// 退样批复落到测年送检清单：同一标本只保留一份批复，已存在的按标本室登记原地改写，
// 重复冒出来的多余批复一并清掉，不新增第二条。
function syncReturnApproval(specimenNo: string, date: string): void {
  const rows = listRows(DATING_KEY)
  const hits = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => isReturnApprovalFor(row, specimenNo))
  if (hits.length === 0) {
    const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
    saveRows(DATING_KEY, [...rows, buildReturnApproval(specimenNo, date, id)])
    return
  }
  const keepIndex = hits[0].index
  const next: EntryRow[] = []
  rows.forEach((row, index) => {
    if (index === keepIndex) {
      next.push(buildReturnApproval(specimenNo, date, Number(row.id)))
    } else if (!hits.some((hit) => hit.index === index)) {
      next.push(row)
    }
  })
  saveRows(DATING_KEY, next)
}

export function listReturnableBones(): EntryRow[] {
  return listRows(BONE_KEY).filter((row) => String(row.status) === BONE_IDENTIFIED_STATUS)
}

export function returnBoneSpecimen(id: number): ActionResult {
  const rows = listRows(BONE_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的骨骼标本` }
  }
  const row = rows[index]
  const specimenNo = String(row['标本编号'] ?? '')
  const date = today()
  if (String(row.status) !== BONE_IDENTIFIED_STATUS) {
    if (row['退样批复']) {
      // 重复提交或上次写批复失败后的重试：退样已生效过，只把批复对齐标本室登记，不再动结论。
      try {
        syncReturnApproval(specimenNo, date)
      } catch {
        return { ok: false, retryable: true, message: `标本 ${specimenNo} 的退样批复同步失败，请重试；已有登记不会被覆盖` }
      }
      return { ok: true, message: `标本 ${specimenNo} 已办理过退样，退样只生效一次，批复以标本室登记为准` }
    }
    return { ok: false, message: `标本 ${specimenNo} 当前状态是「${String(row.status)}」，只有「已鉴定」的标本才能办理退样` }
  }
  const updated: EntryRow = {
    ...row,
    status: BONE_PENDING_STATUS,
    pending: true,
    abnormal: false,
    退样批复: approvalNoFor(specimenNo),
    退样日期: date,
  }
  for (const field of BONE_CONCLUSION_FIELDS) {
    updated[field] = ''
  }
  const next = [...rows]
  next[index] = updated
  try {
    saveRows(BONE_KEY, next)
    syncReturnApproval(specimenNo, date)
  } catch {
    return { ok: false, retryable: true, message: `标本 ${specimenNo} 退样写入失败，请重试；已有登记不会被覆盖` }
  }
  return { ok: true, message: `标本 ${specimenNo} 已退样：鉴定结论已清空、状态回到「待鉴定」，批复已落入测年送检清单` }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  if (key === BONE_KEY && action === BONE_RETURN_ACTION) {
    return returnBoneSpecimen(id)
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
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
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
