export interface RecordEntity {
  id: string
  moduleId: string
  fields: Record<string, unknown>
  version: number
  createdAt: string
  updatedAt: string
  createdBy?: string
  updatedBy?: string
}

export interface RecordListResponse {
  records: RecordEntity[]
  total: number
  page: number
  pageSize: number
  /** 当前页之后仍有数据(本地数据源与 mock 均产出;供"加载更多"式消费) */
  hasMore?: boolean
}

export interface DraftRecord {
  tempId: string
  fields: Record<string, unknown>
  originalVersion?: number
  validationErrors?: FieldError[]
  isValid: boolean
}

export interface FieldError {
  field: string
  message: string
  level: 'error' | 'warning'
  code?: string
}

export interface CellEditPayload {
  rowId: string
  field: string
  value: unknown
  oldValue: unknown
  mode: 'cell' | 'row' | 'batch'
  source: 'user' | 'formula' | 'lock-fill' | 'quick-create'
}

export interface EditContext {
  originalValue: unknown
  currentValue: unknown
  version: number
  fieldKey: string
  recordId: string
}

/** 单条字段值变更快照（docs/19 H3 history 最小原子）：undo 还原 previous*，redo 重放 newValue */
export interface FieldChangeSnapshot {
  recordId: string
  field: string
  previousValue: unknown
  newValue: unknown
  previousVersion: number
  newVersion: number
}

/** 创建记录快照：index 为入栈时该记录在实例列表中的位置（undo 移除、redo 按位加回） */
export interface HistoryCreatedRecord {
  record: RecordEntity
  index: number
}

/**
 * 引擎级历史条目（docs/19 H3）：一个用户动作一个条目，undo/redo 按动作粒度回放。
 * 回放均为本地内存操作：字段变更回填值与乐观锁版本；'create' 的撤销仅移除实例
 * 列表（引擎无 delete 服务，刷新后以服务端数据为准）。
 */
export interface HistoryEntry {
  type: 'cell-edit' | 'batch-edit' | 'create'
  /** 字段变更集：cell-edit 恒 1 条，batch-edit 为整批；type:'create' 时为空数组 */
  changes: FieldChangeSnapshot[]
  /** type:'create' 时为被创建记录快照，其余为空数组 */
  createdRecords: HistoryCreatedRecord[]
  timestamp: number
}

/** 关系表一条记录 — 一对多/多对多关联的纽带实体 */
export interface RelationEntry {
  id: string
  sourceModuleId: string
  sourceRecordId: string
  targetModuleId: string
  targetRecordId: string
  fieldKey: string
  extraFields: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
