/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

// 鉴定结论历史档案：按出具当时的口径留档，后续退样、重新鉴定都不改动既有档案。
export type BoneConclusionArchive = {
  id: number
  标本编号: string
  种属: string
  可鉴定性别: string
  年龄估计: string
  病理现象: string
  出具日期: string
  留档批次: number
}

// 退样批复：退样确认后落到送检那边清单的那一份回执。
export type BoneReturnNotice = {
  id: number
  标本编号: string
  出土单位: string
  批复编号: string
  批复日期: string
  批复结论: string
  接收去向: string
  退样轮次: number
  是否有效: boolean
}

// 出具鉴定结论时由页面提交、数据层落库的字段。
export type BoneConclusionInput = {
  种属: string
  可鉴定性别: string
  年龄估计: string
  病理现象: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
