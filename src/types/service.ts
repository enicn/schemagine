
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

export interface ApiResponse<T = unknown> {
  success: boolean
  data: T
  message?: string
  errorCode?: string
  details?: unknown[]
}

export interface ListQueryParams {
  moduleId: string
  filters?: FilterClause[]
  sort?: SortParam
  page: number
  pageSize: number
  cursor?: string
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
  filters: FilterClause[]
  sort: SortParam | null
  pagination: PaginationState
}

export interface PaginationState {
  page: number
  pageSize: number
  total: number
  cursor?: string
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
  filters?: FilterClause[]
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
