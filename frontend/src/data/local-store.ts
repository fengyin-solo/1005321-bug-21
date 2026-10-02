import { BONE_ARCHIVE_SEED, SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：主清单放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'archaeology-field:entries'

// 附属集合（鉴定结论档案、退样批复）各自独立一个键，不和主清单抢写，避免一次动作写两份主清单。
const BONE_ARCHIVE_KEY = 'archaeology-field:bone-conclusion-archive'
const BONE_RETURN_KEY = 'archaeology-field:bone-return-notices'

const collectionSeedFallback: Record<string, unknown[]> = {
  [BONE_ARCHIVE_KEY]: BONE_ARCHIVE_SEED as unknown[],
  [BONE_RETURN_KEY]: [],
}

export const boneArchiveStorageKey = BONE_ARCHIVE_KEY
export const boneReturnStorageKey = BONE_RETURN_KEY

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}

// 附属集合按独立键读写，首次没有时用历史种子播种。
export function listCollection<T>(key: string): T[] {
  const fallback = clone((collectionSeedFallback[key] ?? []) as T[])
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    window.localStorage.setItem(key, JSON.stringify(fallback))
    return fallback
  }
  try {
    return JSON.parse(raw) as T[]
  } catch {
    window.localStorage.setItem(key, JSON.stringify(fallback))
    return fallback
  }
}

export function saveCollection<T>(key: string, items: T[]): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, JSON.stringify(items))
  }
}
