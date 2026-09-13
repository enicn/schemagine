import type { SortParam, FilterClause } from './service'
import type { CellEditPayload, DraftRecord } from './record'

export interface CellEditEvent extends CellEditPayload {
  rowId: string
  field: string
  value: unknown
  oldValue: unknown
  mode: 'cell' | 'row' | 'batch'
  source: 'user' | 'formula' | 'lock-fill' | 'quick-create'
}

export interface SortChangeEvent {
  field: string
  order: 'asc' | 'desc'
}

export interface QueryChangeEvent {
  filters: FilterClause[]
  sort: SortParam | null
  pagination: {
    page: number
    pageSize: number
  }
}

export interface PageChangeEvent {
  page: number
  pageSize: number
}

export interface ViewModeChangeEvent {
  mode: 'list' | 'card' | 'create'
  source: 'user' | 'auto' | 'engine'
}

export interface QuickCreateEvent {
  field: string
  targetModuleId: string
  prefillData?: Record<string, unknown>
}

export interface DialogResult {
  action: 'confirm' | 'cancel' | 'close'
  payload?: Record<string, unknown>
}

export interface RequestOpenDialogEvent {
  dialogType: DialogType
  payload: Record<string, unknown>
}

export type DialogType =
  | 'quick-create'
  | 'column-settings'
  | 'formula-detail'
  | 'dynamic-max-confirm'
  | 'version-conflict'
  | 'confirm'
  | 'alert'

export interface DraftChangeEvent {
  drafts: DraftRecord[]
  changedIndex?: number
}

export interface LockColumnEvent {
  field: string
  direction: 'left' | 'right' | 'none'
}
