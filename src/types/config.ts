import type { SortParam, FilterClause } from './service'

export interface UserViewConfig {
  moduleId: string
  version: number
  columns: ColumnConfig[]
  defaultSort?: SortParam
  pageSize: number
  filterPresets?: FilterPreset[]
  viewMode?: 'list' | 'card'
  cardLayout?: CardLayoutConfig
}

export interface ColumnConfig {
  field: string
  width: number
  visible: boolean
  fixed?: 'left' | 'right'
  order: number
  sortable: boolean
}

export interface CardFieldLayout {
  field: string
  span: number
  order: number
  collapsedByDefault?: boolean
}

export interface CardLayoutConfig {
  fields: CardFieldLayout[]
  defaultSpan?: number
}

export interface FilterPreset {
  id: string
  name: string
  filters: FilterClause[]
}
