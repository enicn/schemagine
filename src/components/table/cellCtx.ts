/**
 * 单元格/表头插槽内容共享上下文（docs/19 批次 F 前置拆分·F3）。
 *
 * VxeTableWrapper 把插槽模板抽为 WrapperHeaderCell / WrapperCellContent 两个
 * 子组件后，行内编辑、表头筛选等状态与动作经本 ctx 传入。reactive 对 ref 的
 * 解包让子组件模板可直接 v-model / 读值，与原先同作用域模板等价。
 * 条目集合 = 两个子组件模板用到的全部绑定；由此产出 TableCtx。
 */
import { reactive } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { Component } from 'vue'
import type { CandidateOption, FieldValueCandidateOption, FilterClause } from '@/types'
import type { WrapperColumn } from './wrapperTypes'

export function createCellCtx(entries: {
  // ---- 表头（useHeaderFilter + 排序态） ----
  headerMenuField: Ref<string | null>
  headerMenuKeyword: Ref<string>
  headerMenuOptions: Ref<FieldValueCandidateOption[]>
  headerMenuSelectedKeys: Ref<string[]>
  headerMenuLoading: Ref<boolean>
  headerFilterMode: Ref<string>
  headerFilterRange: Ref<[string, string] | null>
  isCandidateMode: ComputedRef<boolean>
  onRangePick: (val: [string, string] | null) => void
  RANGE_PRESETS: readonly { key: string }[]
  applyRangePreset: (field: string, key: string) => void
  isDatetimeCol: (col: { fieldType?: string }) => boolean
  isDateOnlyCol: (col: { fieldType?: string }) => boolean
  modeSwitchable: (col: { fieldType?: string; filterCandidates?: boolean }) => boolean
  facetValueKey: (value: unknown) => string
  getHeaderFilterClause: (field: string) => FilterClause | undefined
  handleHeaderPopoverVisibleChange: (field: string, visible: boolean) => void
  headerSelectAll: ComputedRef<boolean>
  headerSelectIndeterminate: ComputedRef<boolean>
  toggleHeaderSelectAll: (checked: boolean) => void
  loadMoreHeaderMenuOptions: () => void
  applyHeaderSort: (field: string, order: 'asc' | 'desc' | null) => void
  applyHeaderFilter: (field: string) => void
  clearHeaderFilter: (field: string) => void
  sortConfig: ComputedRef<{ field?: string; order?: 'asc' | 'desc' } | undefined>

  // ---- 单元格（useInlineEdit + useCellRendering + 渲染工具） ----
  rowKey: ComputedRef<string>
  isEditing: (rowId: unknown, field: string) => boolean
  customEditorDef: (col: WrapperColumn) => Component | undefined
  // 编辑值随字段类型变化（原实现即 ref<any>），模板 v-model 需要可写任意值
  editValue: Ref<unknown>
  confirmEdit: (row: Record<string, unknown>, col: WrapperColumn) => void
  cancelEdit: () => void
  toggleEditValue: () => void
  fkDropdownOpen: Ref<boolean>
  toggleFkDropdown: () => void
  closeFkDropdown: () => void
  getFkLabel: (value: unknown) => string
  clearFkSelection: () => void
  fkLoading: Ref<boolean>
  fkSearchText: Ref<string>
  fkFilteredOptions: Ref<CandidateOption[]>
  selectFkOption: (opt: CandidateOption) => void
  openFkQuickCreate: () => void
  /** 媒体模式（docs/17 四模式）：mediaImage 行内编辑面按此降级 */
  mediaMode: Ref<'url' | 'oss' | 'api' | 'library'>
  isLibraryMedia: ComputedRef<boolean>
  mediaUploading: Ref<boolean>
  openMediaPicker: () => void
  triggerMediaUpload: (e?: Event) => void
  onMediaFileChange: (e: Event) => void
  clearMediaSelection: () => void
  hasEnumTagStyle: (value: unknown, col: WrapperColumn) => boolean
  isEnumColumn: (col: WrapperColumn) => boolean
  getEnumCellHtml: (value: unknown, col: WrapperColumn) => string
  /** 值展示档位（docs/20）：classic 一票否决为 plain，其余字段 displayStyle > appearance.valueDisplay > 'tag' */
  valueDisplayOf: (col: WrapperColumn) => 'tag' | 'plain'
  /** 复古电子表格模式（docs/20 valueDisplay='classic'）：true 时自定义标签类（trueLabelClass 等）不渲染 */
  isClassicMode: () => boolean
  getBooleanStateClass: (value: unknown) => string
  hasFilterMatch: (col: WrapperColumn) => boolean
  getCellHighlightHtml: (value: unknown, col: WrapperColumn) => string
  openImage: (src: unknown) => void
  /** 组行单元格展示（docs/19 F6） */
  groupCellDisplay: (row: Record<string, unknown>, col: WrapperColumn) => string
}) {
  return reactive(entries)
}

/** reactive 解包后的上下文类型（子组件 props 用） */
export type TableCtx = ReturnType<typeof createCellCtx>
