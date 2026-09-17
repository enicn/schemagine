import type { RecordEntity } from './record'


export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'like'
  | 'notLike'
  | 'in'
  | 'notIn'
  | 'between'
  | 'notBetween'
  | 'isNull'
  | 'isNotNull'

export interface FilterClause {
  field: string
  operator: FilterOperator
  value?: unknown
  values?: unknown[]
}

/**
 * 组合过滤组（docs/19 批次 E2）：将若干条件以 and/or 组合，可嵌套。
 * type:'group' 为判别字段——JSON 契约中与 FilterClause（无 type 字段）可靠区分。
 */
export interface FilterGroup {
  type: 'group'
  logic: 'and' | 'or'
  conditions: FilterCondition[]
}

export type FilterCondition = FilterClause | FilterGroup

export interface ApiResponse<T = unknown> {
  success: boolean
  data: T
  message?: string
  errorCode?: string
  details?: unknown[]
}

export interface ListQueryParams {
  moduleId: string
  /** 过滤条件：顶层隐式 AND；组合逻辑（OR/嵌套）用 FilterGroup 表达（docs/19 批次 E2） */
  filters?: FilterCondition[]
  sort?: SortParam
  page: number
  pageSize: number
  viewMode?: 'list' | 'card'
}

export interface SortParam {
  field: string
  order: 'asc' | 'desc'
}

export interface PatchFieldParams {
  moduleId: string
  recordId: string
  field: string
  value: unknown
  expectedVersion: number
  force?: boolean
}

export interface CreateRecordParams {
  moduleId: string
  fields: Record<string, unknown>
}

export interface QueryState {
  filters: FilterCondition[]
  sort: SortParam | null
  pagination: PaginationState
}

export interface PaginationState {
  page: number
  pageSize: number
  total: number
}

export interface CandidateQueryParams {
  targetModule: string
  keyword?: string
  page: number
  pageSize: number
  filters?: Record<string, unknown>
}

export interface CandidateOption {
  value: string
  label: string
  disabled?: boolean
  data?: Record<string, unknown>
}

export interface CandidateListResponse {
  options: CandidateOption[]
  total: number
  hasMore: boolean
}

export interface FieldValueCandidateQueryParams {
  moduleId: string
  field: string
  keyword?: string
  page: number
  pageSize: number
  filters?: FilterCondition[]
}

export interface FieldValueCandidateOption {
  value: unknown
  label: string
  count: number
  disabled?: boolean
}

export interface FieldValueCandidateListResponse {
  options: FieldValueCandidateOption[]
  total: number
  hasMore: boolean
}

export type ErrorCode =
  | 'VERSION_CONFLICT'
  | 'PERMISSION_DENIED'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CIRCULAR_DEPENDENCY'
  | 'FORMULA_ERROR'
  | 'DYNAMIC_MAX_EXCEEDED'
  | 'MODULE_UNAVAILABLE'
  | 'SCHEMA_INVALID'
  | 'NETWORK_ERROR'
  | 'UNKNOWN'

export interface StandardError {
  code: ErrorCode
  message: string
  details?: unknown[]
  timestamp: string
}

/** 记录变更推送载荷（docs/19 I1 实时数据契约）：宿主经轮询/SSE/WebSocket 等传输感知变更后回调 */
export interface RecordsChangePayload {
  moduleId: string
  /** 变更行的完整记录（upsert 语义：按 id 合并，存在则整体替换，不存在则追加） */
  upserts?: RecordEntity[]
  /** 被删除的记录 id */
  deletes?: string[]
}

/** 退订函数（docs/19 I1） */
export type UnsubscribeRecords = () => void
