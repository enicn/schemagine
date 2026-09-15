import type { SortParam, FilterCondition } from './service'

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
  /** 未声明 = 弹性列（吃满容器剩余宽度） */
  width?: number
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
  /** 保存的过滤条件（可含 FilterGroup 组合，docs/19 批次 E2/E3） */
  filters: FilterCondition[]
  /** 保存时的排序；未保存排序 = 应用视图时不动当前排序 */
  sort?: SortParam
  /** 默认视图：进入模块时自动应用（docs/19 批次 E3） */
  isDefault?: boolean
}
