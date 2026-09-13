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
  hasMore?: boolean
  cursor?: string
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

export interface UndoEntry {
  type: 'cell' | 'row' | 'batch'
  recordId: string
  field?: string
  previousValue: unknown
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
