<script lang="ts">
// WrapperColumn 已迁移至 wrapperTypes.ts；保留此 re-export 以兼容既有导入路径
export type { WrapperColumn } from './wrapperTypes'
</script>

<script setup lang="ts">
import { formatDateTimeCell } from '@/utils/recordRow'
import { reorderColumnsByDrag } from '@/utils/columnDrag'
import type { SpanCellParams } from '@/utils/mergeCells'
import type { VxeTableDefines } from 'vxe-table'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { VxeTable, VxeColumn, VxeColgroup } from 'vxe-table'
import { VxeLoading, getI18n } from 'vxe-pc-ui'
import 'vxe-table/lib/style.css'
import 'vxe-pc-ui/lib/style.css'
import type { VxeTableInstance } from 'vxe-table'
import MediaPickerDialog from '@/components/media/MediaPickerDialog.vue'
import QuickCreateDialog from '@/engine/dialogs/QuickCreateDialog.vue'
import type { FilterClause, RowValidationRule, EngineAppearance } from '@/types'
import { resolveScrollY } from './virtualScroll'
import { resolveDensityHeights } from './tableDensity'
import type { TableDensity } from './tableDensity'
import { useColumnBuilding } from './useColumnBuilding'
import { useFkOptions } from './useFkOptions'
import { useCellRendering } from './useCellRendering'
import { useHeaderFilter } from './useHeaderFilter'
import { useInlineEdit } from './useInlineEdit'
import { useCellDetail } from './useCellDetail'
import { createCellCtx } from './cellCtx'
import { t } from '@/locales'
import { Delete, Edit } from '@element-plus/icons-vue'
import { ElIcon } from 'element-plus'
import type { Component } from 'vue'
import { GROUP_ROW_FLAG, isGroupRow } from '@/utils/recordGroup'
import { useKeyboardNav } from './useKeyboardNav'
import WrapperHeaderCell from './WrapperHeaderCell.vue'
import WrapperCellContent from './WrapperCellContent.vue'
import type { WrapperColumn } from './wrapperTypes'

const BORDER_HEIGHT = 1

const props = withDefaults(defineProps<{
  moduleId: string
  data: Record<string, unknown>[]
  columns: WrapperColumn[]
  loading?: boolean
  height?: string | number
  maxHeight?: string | number
  virtualScroll?: boolean
  editable?: boolean
  selectedRowId?: string | null
  sortConfig?: {
    field?: string
    order?: 'asc' | 'desc'
  }
  rowKey?: string
  columnDraggable?: boolean
  fixedRowCount?: number
  filterClauses?: FilterClause[]
  /** 是否渲染行首复选框列（用于批量操作，如批量删除） */
  showSelection?: boolean
  /** 单元格插槽透传（docs/19 B2）：field → 插槽名，命中后该列单元格由宿主插槽渲染 */
  cellSlots?: Record<string, string>
  /** 表头插槽透传（docs/19 B2）：field → 插槽名，命中后该列表头由宿主插槽渲染 */
  headerSlots?: Record<string, string>
  /** 密度档位（docs/19 F1）：compact/default/large，驱动行高与表头高（token 见 styles/tokens.css §7.1） */
  density?: TableDensity
  /** 外观与格式契约（docs/20）：tableBorder 表格边框档位、valueDisplay 单元格值展示（tag/plain） */
  appearance?: EngineAppearance
  /** 树形数据（docs/19 F2）：声明后列表按树形渲染；children 为嵌套字段名（与数据对齐） */
  treeConfig?: {
    children?: string
    expandAll?: boolean
  }
  /** 行展开插槽（docs/19 F4）：声明后渲染行首 expand 列，展开区由宿主同名插槽渲染 */
  expandSlot?: string
  /** 合并单元格（docs/19 F5）：vxe span-method 透传 */
  spanMethod?: (params: SpanCellParams) => { rowspan: number; colspan: number } | undefined
  /** 按列 footer 合计（docs/19 F6）：vxe footer-method 透传，声明即显示表尾行 */
  footerMethod?: (params: { columns: Array<{ field?: string }> }) => string[][]
  /** 分组声明（docs/19 F6）：组行展示与小计列标识 */
  groupBy?: { field: string; summaryFields?: string[] }
  /** 键盘网格导航（docs/19 G2）：方向键移动焦点、Enter 进入编辑；默认开启 */
  keyboardNav?: boolean
  /** 行级校验规则（docs/19 H1）：行内编辑确认前整行求值 */
  schemaRowRules?: RowValidationRule[]
  /** 行号列（引擎 appearance.rowNumbers）：行首最左渲染 vxe 序号列（fixed left、居中）；默认关闭 */
  rowNumbers?: boolean
  /** 行号续号起点（vxe seq-config.startIndex）：分页场景传 (page-1)*pageSize，第 2 页从 pageSize+1 起；默认 0（从 1 起） */
  rowNumberStart?: number
}>(), {
  loading: false,
  virtualScroll: false,
  editable: false,
  selectedRowId: null,
  rowKey: '_recordId',
  columnDraggable: false,
  fixedRowCount: undefined,
  showSelection: false,
  density: 'default',
  keyboardNav: true,
})

const emit = defineEmits<{
  'sort-change': [payload: { field: string; order: 'asc' | 'desc' | null }]
  'filter-change': [payload: { field: string; clause: FilterClause | null }]
  'row-click': [payload: { row: Record<string, unknown>; rowIndex: number }]
  'cell-click': [payload: { row: Record<string, unknown>; column: WrapperColumn; rowIndex: number; colIndex: number }]
  'cell-dblclick': [payload: { row: Record<string, unknown>; column: WrapperColumn; rowIndex: number }]
  'edit-activated': [payload: { row: Record<string, unknown>; column: WrapperColumn; rowIndex: number }]
  'edit-closed': [payload: { row: Record<string, unknown>; column: WrapperColumn; value: unknown }]
  'column-drag-end': [payload: { columns: WrapperColumn[]; newOrder: string[] }]
  'row-action': [payload: { row: Record<string, unknown>; actionId: string }]
  'relation-click': [payload: { row: Record<string, unknown>; column: WrapperColumn }]
  'inline-edit': [payload: { row: Record<string, unknown>; field: string; value: unknown; oldValue: unknown }]
  'selection-change': [rowIds: string[]]
  /** 拖拽调宽结束(docs/20):{ field, width(px) } 上抛,由上层持久化进视图配置 */
  'column-width-change': [payload: { field: string; width: number }]
}>()

const tableRef = ref<VxeTableInstance | null>(null)
const wrapperRef = ref<HTMLDivElement | null>(null)

/** 暴露底层 vxe-table 实例与操作(docs/19 B2):宿主可调用 clearSort/scrollTo 等 vxe API */
function getTableInstance(): VxeTableInstance | null {
  return tableRef.value
}

// ---- 列构建（拆分：useColumnBuilding） ----
const {
  visibleColumns,
  relationColumns,
  opColumns,
  dataColumns,
  opColumnWidth,
  visibleOps,
  cellSlotName,
  headerSlotName,
} = useColumnBuilding(props, tableRef)

// ---- FK 候选缓存（拆分：useFkOptions，行内编辑/渲染/浮层共用） ----
const fk = useFkOptions(props)

// ---- 单元格渲染（拆分：useCellRendering） ----
const {
  hasFilterMatch,
  getCellHighlightHtml,
  getBooleanStateClass,
  isEnumColumn,
  hasEnumTagStyle,
  getEnumCellHtml,
  formatDisplay,
  relationFormatter,
  openImage,
} = useCellRendering({
  fkOptionsCache: () => fk.fkOptionsCache.value,
  resolveFkLabel: fk.resolveFkLabel,
  filterClauses: () => props.filterClauses,
  classicMode: () => props.appearance?.valueDisplay === 'classic',
})

// ---- 表头筛选（拆分：useHeaderFilter） ----
const {
  headerMenuField,
  headerMenuKeyword,
  headerMenuOptions,
  headerMenuSelectedKeys,
  headerMenuLoading,
  headerFilterMode,
  headerFilterRange,
  isCandidateMode,
  onRangePick,
  RANGE_PRESETS,
  applyRangePreset,
  isDatetimeCol,
  isDateOnlyCol,
  modeSwitchable,
  facetValueKey,
  getHeaderFilterClause,
  handleHeaderPopoverVisibleChange,
  headerSelectAll,
  headerSelectIndeterminate,
  toggleHeaderSelectAll,
  loadMoreHeaderMenuOptions,
  applyHeaderSort,
  applyHeaderFilter,
  clearHeaderFilter,
} = useHeaderFilter(props, emit)

// ---- 行内编辑（拆分：useInlineEdit） ----
const {
  editingRowId,
  editValue,
  editingCol,
  fkQuickCreateVisible,
  fkFilteredOptions,
  fkLoading,
  fkSearchText,
  fkDropdownOpen,
  openFkQuickCreate,
  handleFkQuickCreated,
  isEditing,
  customEditorDef,
  startEdit,
  confirmEdit,
  cancelEdit,
  toggleEditValue,
  getFkLabel,
  toggleFkDropdown,
  closeFkDropdown,
  selectFkOption,
  clearFkSelection,
  mediaMode,
  isLibraryMedia,
  mediaPickerVisible,
  mediaUploading,
  openMediaPicker,
  onMediaPicked,
  triggerMediaUpload,
  onMediaFileChange,
  clearMediaSelection,
} = useInlineEdit(emit, {
  rowKey: () => props.rowKey,
  visibleColumns: () => visibleColumns.value,
  wrapperRef,
  fk,
  rowValidationRules: () => props.schemaRowRules,
})

/** 单元格展示全文（与列渲染同口径：datetime 走专用格式化，fk 直读缓存避免 formatDisplay 的 HTML 转义，其余走 formatDisplay） */
function getCellDetailText(row: Record<string, unknown>, col: WrapperColumn): string {
  const value = row[col.field]
  if (value == null || value === '') return ''
  if (col.fieldType === 'datetime' || col.fieldType === 'date') {
    return formatDateTimeCell(value, col.fieldType)
  }
  if (col.fieldType === 'fk' && col.targetModule) {
    const cached = fk.fkOptionsCache.value.get(col.targetModule)
    const opt = cached?.find(o => String(o.value) === String(value))
    return opt ? opt.label : String(value)
  }
  return formatDisplay(value, col)
}

// ---- 截断内容查看浮层（拆分：useCellDetail） ----
const {
  cellDetail,
  cellDetailPanelRef,
  cellDetailPos,
  closeCellDetail,
  maybeOpenCellDetail,
  copyCellDetail,
} = useCellDetail({
  tableRef,
  rowKey: () => props.rowKey,
  isEditing,
  getCellDetailText,
})

// ---- 键盘网格导航（docs/19 G2）：方向键移动焦点、Enter 进入编辑 ----
const {
  focusedCell,
  setFocusedCell,
  handleGridKeydown,
} = useKeyboardNav({
  tableRef,
  isEditing: () => !!editingRowId.value,
  isEditableCell: col => !col.isAction && !col.isRelation && !col.readonly && col.editMode !== 'limited',
  dataColumns: () => dataColumns.value,
  data: () => props.data,
  rowKey: () => props.rowKey,
  startEdit,
})

// ---- vxe 事件转发：薄封装，组合上述各域并向宿主上抛 ----

function handleSortChange(params: VxeTableDefines.SortChangeEventParams): void {
  const { field, order } = params
  emit('sort-change', { field: field ?? '', order: order || null })
}

function onGridKeydown(e: KeyboardEvent): void {
  if (props.keyboardNav) handleGridKeydown(e)
}

function handleCellClick(params: VxeTableDefines.CellClickEventParams): void {
  if (props.keyboardNav && params?.column?.field && !params.column.type) {
    setFocusedCell(params.row, params.column.field)
  }
  emit('row-click', { row: params.row, rowIndex: params.rowIndex! })
  const col = visibleColumns.value.find(c => c.field === params.column.field)
  if (!col) return
  if (col.isRelation) {
    emit('relation-click', { row: params.row, column: col })
    return
  }
  // 截断内容查看与 cell-click 上抛互不影响（宿主监听仍照常触发）
  maybeOpenCellDetail(params, col)
  emit('cell-click', { row: params.row, column: col, rowIndex: params.rowIndex!, colIndex: visibleColumns.value.indexOf(col) })
}

/** 拖拽调宽结束(docs/20):上抛新列宽,供上层持久化与导出列宽对齐 */
function handleResizableChange(params: { column?: { field?: string; renderWidth?: number } }): void {
  const field = params.column?.field
  const width = Math.round(params.column?.renderWidth ?? 0)
  if (!field || !width) return
  emit('column-width-change', { field, width })
}

function handleOpClick(row: Record<string, unknown>, col: WrapperColumn): void {
  // 标准删除操作统一以 'delete' 作为 actionId 上抛，与字段 key 解耦；
  // danger:true 的 custom 动作（如「撤回」「复核驳回」）保持字段 key 语义，仅样式标红
  const actionId = col.rowActionType === 'delete' ? 'delete' : col.field
  emit('row-action', { row, actionId })
}

/** 行级操作按钮的匹配图标：标准删除/内置行级编辑；schema 自定义动作语义未知不带图标 */
function opIcon(col: WrapperColumn): Component | null {
  if (col.actionDanger) return Delete
  if (col.field === '__rowEdit__') return Edit
  return null
}

function handleCellDblclick(params: VxeTableDefines.CellDblclickEventParams): void {
  const col = visibleColumns.value.find(c => c.field === params.column.field)
  if (!col) return
  // 双击即切换交互语义（进编辑/关联打开），内容浮层随之收起
  closeCellDetail()
  if (col.isRelation) {
    emit('relation-click', { row: params.row, column: col })
    return
  }
  if (col.isAction) return
  // readonly（绝对只读，任何权限不豁免）与 limited（有限编辑）字段禁止行内编辑：
  // readonly 与后端 editablePatch 的更新拦截对齐；limited 仅关闭行内入口
  if (col.readonly || col.editMode === 'limited') {
    emit('cell-dblclick', { row: params.row, column: col, rowIndex: params.rowIndex })
    return
  }
  if (props.editable) {
    startEdit(params.row, col, params.rowIndex)
    return
  }
  emit('cell-dblclick', { row: params.row, column: col, rowIndex: params.rowIndex })
}

function handleColumnDragEnd(params: VxeTableDefines.ColumnDragendEventParams): void {
  // vxe column-dragend 事件参数不含完整列序(仅 old/new/dragColumn + dragPos),
  // 且事件触发时实例列序尚未完成 nextTick 重排——由旧列序+拖拽信息确定性重建(docs/19 批次 E4)
  const dragField = params?.dragColumn?.field as string | undefined
  const targetField = params?.newColumn?.field as string | undefined
  const dragPos = params?.dragPos as 'left' | 'right' | undefined
  const newOrder = reorderColumnsByDrag(
    props.columns.map(c => c.field),
    dragField,
    targetField,
    dragPos,
  )
  emit('column-drag-end', { columns: props.columns, newOrder })
}

function handleSelectionChange(): void {
  const table = tableRef.value
  if (!table) {
    emit('selection-change', [])
    return
  }
  // checkbox reserve(docs/19 批次 E6):跨页勾选 = 当前页已选 ∪ 保留区已选,按行键去重
  const current = (table.getCheckboxRecords() as Array<Record<string, unknown>>) ?? []
  const reserved = ((table.getCheckboxReserveRecords?.() as Array<Record<string, unknown>>) ?? [])
  const seen = new Set<string>()
  const ids: string[] = []
  for (const r of [...current, ...reserved]) {
    const id = r[props.rowKey] as string
    if (id && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  emit('selection-change', ids)
}

function handleRelationClick(col: WrapperColumn, row: Record<string, unknown>): void {
  emit('relation-click', { row, column: col })
}

// ---- 容器高度自适应：无 fixedRowCount 时以 ResizeObserver 观测容器实际高度 ----

const observerHeight = ref(0)
const isObserving = ref(false)

let resizeObserver: ResizeObserver | null = null

function startObserving(): void {
  if (resizeObserver || !wrapperRef.value) return
  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const h = entry.contentRect.height
      if (h > 0) {
        observerHeight.value = Math.floor(h)
        isObserving.value = true
      }
    }
  })
  resizeObserver.observe(wrapperRef.value)
}

function stopObserving(): void {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
}

onMounted(() => {
  if (!props.fixedRowCount) {
    startObserving()
  }
  fk.preloadFkOptions()
})

onUnmounted(() => {
  stopObserving()
})

watch(() => props.data, () => {
  // 数据刷新会整体重渲染行，浮层锚元素随时失效，先行收起
  closeCellDetail()
  fk.preloadFkOptions()
})

/**
 * 密度（docs/19 F1）：行高/表头高数字源（vxe cell-config / fixedRowCount 测算），
 * 模板据此挂 density--* class 把 --sg-table-row-height/-header-height 切到对应档位。
 */
const densityHeights = computed(() => resolveDensityHeights(props.density))

/** 树形配置（docs/19 F2）：透传 vxe tree-config；未声明返回 undefined（普通平铺列表） */
const vxeTreeConfig = computed(() => {
  if (!props.treeConfig) return undefined
  return { childrenField: props.treeConfig.children ?? 'children', expandAll: props.treeConfig.expandAll ?? false }
})

/** 树形模式下承载展开按钮的首个数据列字段 */
const treeNodeField = computed(() => (vxeTreeConfig.value ? dataColumns.value[0]?.field ?? null : null))

/**
 * 多级表头分块（docs/19 F3）：相邻且 headerGroup 相同的数据列合并为一个
 * VxeColgroup（表头标题 = headerGroup），未分组的列保持顶层平铺。
 */
interface ColumnBlock {
  key: string
  group?: string
  columns: WrapperColumn[]
}
const columnBlocks = computed<ColumnBlock[]>(() => {
  const blocks: ColumnBlock[] = []
  for (const col of dataColumns.value) {
    const group = col.headerGroup?.trim() || undefined
    const last = blocks[blocks.length - 1]
    if (group && last && last.group === group) {
      last.columns.push(col)
    } else if (group) {
      blocks.push({ key: `group:${group}:${col.field}`, group, columns: [col] })
    } else {
      blocks.push({ key: `col:${col.field}`, columns: [col] })
    }
  }
  return blocks
})

/**
 * 列头/单元格插槽内容共享上下文（docs/19 F3）：ref 经 reactive 解包后，
 * 子组件模板可直接 v-model / 读值，与原先同作用域模板等价。
 *
 * 值展示档位（docs/20）：classic 一票否决（忽略字段 displayStyle），其余按
 * 字段 displayStyle > appearance.valueDisplay > 'tag'。
 */
const isClassicMode = computed(() => props.appearance?.valueDisplay === 'classic')

function valueDisplayOf(col: WrapperColumn): 'tag' | 'plain' {
  if (isClassicMode.value) return 'plain'
  const base = props.appearance?.valueDisplay === 'plain' ? 'plain' : 'tag'
  return col.displayStyle ?? base
}

/** 表格边框档位（docs/20）：默认 inner 保持历史观感 */
const tableBorder = computed(() => props.appearance?.tableBorder ?? 'inner')

/** 行内编辑布局档位（docs/20）：float=浮层（历史默认）/ fit-row=行内收纳（兼容布局） */
const inlineEditLayout = computed(() => props.appearance?.inlineEditLayout ?? 'float')

const cellCtx = createCellCtx({
  headerMenuField,
  headerMenuKeyword,
  headerMenuOptions,
  headerMenuSelectedKeys,
  headerMenuLoading,
  headerFilterMode,
  headerFilterRange,
  isCandidateMode,
  onRangePick,
  RANGE_PRESETS,
  applyRangePreset,
  isDatetimeCol,
  isDateOnlyCol,
  modeSwitchable,
  facetValueKey,
  getHeaderFilterClause,
  handleHeaderPopoverVisibleChange,
  headerSelectAll,
  headerSelectIndeterminate,
  toggleHeaderSelectAll,
  loadMoreHeaderMenuOptions,
  applyHeaderSort,
  applyHeaderFilter,
  clearHeaderFilter,
  sortConfig: computed(() => props.sortConfig),
  rowKey: computed(() => props.rowKey),
  isEditing,
  customEditorDef,
  editValue,
  confirmEdit,
  cancelEdit,
  toggleEditValue,
  fkDropdownOpen,
  toggleFkDropdown,
  closeFkDropdown,
  getFkLabel,
  clearFkSelection,
  fkLoading,
  fkSearchText,
  fkFilteredOptions,
  selectFkOption,
  openFkQuickCreate,
  mediaMode,
  isLibraryMedia,
  mediaUploading,
  openMediaPicker,
  triggerMediaUpload,
  onMediaFileChange,
  clearMediaSelection,
  hasEnumTagStyle,
  isEnumColumn,
  getEnumCellHtml,
  valueDisplayOf,
  isClassicMode: () => isClassicMode.value,
  getBooleanStateClass,
  hasFilterMatch,
  getCellHighlightHtml,
  openImage,
  groupCellDisplay,
})

const tableHeight = computed(() => {
  if (props.fixedRowCount) {
    return densityHeights.value.header + props.fixedRowCount * densityHeights.value.row + BORDER_HEIGHT
  }
  if (isObserving.value && observerHeight.value > 0) {
    return observerHeight.value
  }
  return props.height
})

const tableMaxHeight = computed(() => {
  if (props.fixedRowCount) return undefined
  return props.maxHeight
})

/**
 * 纵向虚拟滚动（docs/19 批次 C2）：virtualScroll 显式开启；否则数据量超阈值自动开启。
 * 判定逻辑抽在 virtualScroll.ts(可单测)。
 */
const tableScrollY = computed(() => resolveScrollY(props.virtualScroll, props.data.length))

function clearSort(): void {
  tableRef.value?.clearSort()
}

function getTableRef(): VxeTableInstance | null {
  return tableRef.value
}

function getCellClassName({ row, column }: { row: Record<string, unknown>; column: { field?: string } }): string {
  const col = visibleColumns.value.find((c: WrapperColumn) => c.field === column.field)
  const classes: string[] = []
  if (col?.isAction) classes.push('action-cell')
  if (col?.isRelation) classes.push('relation-cell')
  if (col && isEditing(row[props.rowKey], col.field)) classes.push('is-editing-cell')
  if (props.keyboardNav && col && focusedCell.value
    && String(row[props.rowKey]) === focusedCell.value.rowKeyValue
    && col.field === focusedCell.value.field) {
    classes.push('is-focused-cell')
  }
  if (col?.cellClass && column.field != null) {
    classes.push(col.cellClass({ value: row[column.field] }))
  }
  return classes.filter(Boolean).join(' ')
}

/** 组行单元格展示（docs/19 F6）：分组列显示「组值（N条）」，小计列显示「小计 X」，其余留空 */
function groupCellDisplay(row: Record<string, unknown>, col: WrapperColumn): string {
  const meta = row[GROUP_ROW_FLAG] as { value: string; count: number; summary: Record<string, number> } | undefined
  if (!meta) return ''
  if (col.field === props.groupBy?.field) {
    // 组值按列渲染口径显示（select 枚举出 label，其余 String）
    return `${formatDisplay(meta.value, col)}（${meta.count}条）`
  }
  const raw = col.field != null ? meta.summary[col.field] : undefined
  if (raw != null) return `小计 ${formatDisplay(raw, col)}`
  return ''
}

function getRowClassName({ row }: { row: Record<string, unknown> }): string {
  const classes: string[] = []
  if (isGroupRow(row)) classes.push('is-group-row')
  if (editingRowId.value && editingRowId.value === row[props.rowKey]) classes.push('is-editing-row')
  if (props.selectedRowId && props.selectedRowId === row[props.rowKey]) classes.push('is-selected-row')
  return classes.join(' ')
}

// 列拖拽提示：vxe 默认读取表头单元格 textContent，会把自定义表头里的
// 筛选/排序下拉按钮（▼）一并带入，这里显式只取列名
function columnDragTooltipMethod({ column }: { column: { title?: string | number } }): string {
  return getI18n('vxe.table.dragTip', [String(column?.title ?? '')]) as string
}

defineExpose({
  clearSort,
  getTableRef,
  getTableInstance,
})
</script>

<template>
  <div
    ref="wrapperRef"
    class="vxe-table-wrapper"
    :class="[`density--${density}`, { 'is-auto-fill': !fixedRowCount, 'is-fit-row-edit': inlineEditLayout === 'fit-row' }]"
    :tabindex="keyboardNav ? 0 : undefined"
    role="grid"
    :aria-label="t('table.gridLabel')"
    :aria-rowcount="data.length"
    @keydown="onGridKeydown"
  >
    <VxeTable
      ref="tableRef"
      :data="data"
      :height="tableHeight"
      :max-height="tableMaxHeight"
      :row-config="{ keyField: rowKey, isHover: true }"
      :cell-config="{ height: densityHeights.row }"
      :header-cell-config="{ height: densityHeights.header, padding: false }"
      :tree-config="vxeTreeConfig"
      :span-method="spanMethod"
      :show-footer="!!footerMethod"
      :footer-method="footerMethod"
      :scroll-y="tableScrollY"
      :row-class-name="getRowClassName"
      :sort-config="{ trigger: 'default', remote: true, defaultSort: sortConfig as any, showIcon: false, multiple: false }"
      :seq-config="rowNumbers ? { startIndex: rowNumberStart ?? 0 } : undefined"
      :keep-source="true"
      :column-config="{ drag: columnDraggable, resizable: true }"
      :column-drag-config="{ tooltipMethod: columnDragTooltipMethod }"
      :cell-class-name="getCellClassName"
      :align="'left'"
      :show-overflow="'title'"
      :border="tableBorder"
      :stripe="false"
      :checkbox-config="{ highlight: true, reserve: true }"
      @sort-change="handleSortChange"
      @cell-click="handleCellClick"
      @cell-dblclick="handleCellDblclick"
      @column-drag-end="handleColumnDragEnd"
      @resizable-change="handleResizableChange"
      @checkbox-change="handleSelectionChange"
      @checkbox-all="handleSelectionChange"
    >
      <template v-if="loading" #loading>
        <VxeLoading />
      </template>
      <!-- 空数据插槽透传（docs/19 B2）：宿主可自定义空状态 -->
      <template v-if="$slots.empty" #empty>
        <slot name="empty" />
      </template>
      <!-- 勾选列保持最左（常规列表页顺序：勾选 → 行号）；宽度用固定 width，不随视口/fit 均摊拉扯 -->
      <!-- 勾选列(docs/20):36px = 20px 勾选框 + 左右各 8px padding,align=center 上下居中 -->
      <VxeColumn v-if="showSelection" type="checkbox" width="36" align="center" fixed="left" />
      <!-- 行号列（appearance.rowNumbers）：勾选列之后；seq 列无 field，不参与列拖拽与合并，
           footerMethod 若只按数据列计值需自行注意与 seq 列的索引错位。
           序号经默认插槽自渲染（不依赖 vxe seq 内建计算，避免二次渲染场景下的调度缺失） -->
      <VxeColumn v-if="rowNumbers" type="seq" width="48" align="center" fixed="left" drag-disabled title="#">
        <template #default="{ rowIndex }">{{ (rowNumberStart ?? 0) + rowIndex + 1 }}</template>
      </VxeColumn>
      <!-- 行展开列（docs/19 F4）：展开区内容经宿主插槽渲染（B2 插槽透传机制） -->
      <VxeColumn v-if="expandSlot" type="expand" width="48" fixed="left">
        <template #content="{ row }">
          <slot :name="expandSlot" :row="row" />
        </template>
      </VxeColumn>
      <!-- 数据列（docs/19 F3 多级表头）：FieldSchema.group 相同的相邻字段合并为
           VxeColgroup 分组表头；列头/单元格内容抽至 WrapperHeaderCell / WrapperCellContent -->
      <template v-for="block in columnBlocks" :key="block.key">
        <VxeColgroup v-if="block.group" :title="block.group">
          <VxeColumn
            v-for="col in block.columns"
            :key="col.field"
            :field="col.field"
            :title="col.title"
            :min-width="col.width ?? col.minWidth ?? 120"
            :fixed="col.fixed"
            :sortable="col.sortable"
            :align="col.align || 'left'"
          >
            <template #header="hdrParams">
              <slot v-if="headerSlotName(col)" :name="headerSlotName(col)" :column="col" :field-schema="col.fieldSchema" />
              <WrapperHeaderCell v-else :col="col" :ctx="cellCtx" :hdr="hdrParams" />
            </template>
            <template #default="{ row }">
              <slot v-if="cellSlotName(col)" :name="cellSlotName(col)" :row="row" :value="row[col.field]" :column="col" :field-schema="col.fieldSchema" />
              <WrapperCellContent v-else :col="col" :row="row" :ctx="cellCtx" />
            </template>
          </VxeColumn>
        </VxeColgroup>
        <template v-else>
          <VxeColumn
            v-for="col in block.columns"
            :key="col.field"
            :field="col.field"
            :title="col.title"
            :min-width="col.width ?? col.minWidth ?? 120"
            :fixed="col.fixed"
            :sortable="col.sortable"
            :align="col.align || 'left'"
            :tree-node="col.field === treeNodeField"
          >
            <template #header="hdrParams">
              <slot v-if="headerSlotName(col)" :name="headerSlotName(col)" :column="col" :field-schema="col.fieldSchema" />
              <WrapperHeaderCell v-else :col="col" :ctx="cellCtx" :hdr="hdrParams" />
            </template>
            <template #default="{ row }">
              <slot v-if="cellSlotName(col)" :name="cellSlotName(col)" :row="row" :value="row[col.field]" :column="col" :field-schema="col.fieldSchema" />
              <WrapperCellContent v-else :col="col" :row="row" :ctx="cellCtx" />
            </template>
          </VxeColumn>
        </template>
      </template>

      <!-- 关联列：单击打开对话框，不可编辑 -->
      <VxeColumn
        v-for="col in relationColumns"
        :key="col.field"
        :field="col.field"
        :title="col.title"
        :width="col.width"
        :fixed="col.fixed"
        :sortable="col.sortable"
        :align="col.align || 'center'"
      >
        <template #default="{ row }">
          <span
            class="relation-click-trigger"
            @click.stop="handleRelationClick(col, row)"
          >
            {{ relationFormatter(col) }}
          </span>
        </template>
      </VxeColumn>

      <!-- 标准操作列：固定右侧，不参与排序/筛选/隐藏/拖拽（数据标准操作与普通数据列地位不同） -->
      <VxeColumn
        v-if="opColumns.length > 0"
        field="__operations__"
        :title="t('table.operationsTitle')"
        :width="opColumnWidth"
        fixed="right"
        align="center"
        class-name="op-column"
      >
        <template #default="{ row }">
          <span class="op-cell">
            <template v-if="visibleOps(row).length > 0">
              <button
                v-for="op in visibleOps(row)"
                :key="op.field"
                type="button"
                class="op-link"
                :class="{ 'op-link--danger': op.actionDanger }"
                @click.stop="handleOpClick(row, op)"
              >
                <ElIcon v-if="opIcon(op)" class="op-link__icon" :size="13">
                  <component :is="opIcon(op)" />
                </ElIcon>{{ op.title }}
              </button>
            </template>
            <span v-else class="op-empty">无操作</span>
          </span>
        </template>
      </VxeColumn>
    </VxeTable>

    <!-- mediaImage 行内编辑共用媒体选择弹窗（append-to-body，不参与表格布局） -->
    <MediaPickerDialog v-model="mediaPickerVisible" :selected-id="(editValue as string | undefined)" @select="onMediaPicked" />

    <!-- fk 行内编辑快速新建弹窗（col.quickCreate 开启时下拉底部出现入口；创建成功自动选中，确认后落库） -->
    <QuickCreateDialog
      :visible="fkQuickCreateVisible"
      :target-module-id="editingCol?.targetModule || ''"
      :prefill-data="fkSearchText ? { name: fkSearchText } : undefined"
      @created="handleFkQuickCreated"
      @cancel="fkQuickCreateVisible = false"
      @close="fkQuickCreateVisible = false"
    />

    <!-- 截断单元格内容查看浮层：单击省略单元格原地弹出完整内容（锚定单元格，不撑行高、不受列宽限制）。
         自管浮层而非 el-popover：开关只由 cellDetail 状态机决定，避免换格点击时旧弹层的外点关闭与新弹层打开竞争 -->
    <Teleport to="body">
      <div
        v-if="cellDetail.visible && cellDetail.triggerEl"
        ref="cellDetailPanelRef"
        class="schemagine-cell-detail-panel"
        :style="{ left: cellDetailPos.left + 'px', top: cellDetailPos.top + 'px' }"
      >
        <div class="cell-detail-popover__head">
          <span class="cell-detail-popover__title">{{ cellDetail.title }}</span>
          <button type="button" class="cell-detail-popover__copy" @click="copyCellDetail">复制</button>
        </div>
        <div class="cell-detail-popover__content">{{ cellDetail.content }}</div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.vxe-table-wrapper {
  width: 100%;
}
/* 密度档位（docs/19 F1）：把生效行高/表头高 token 切到对应档位。
   vxe 实际行高走 cell-config 数值（tableDensity.ts），这里供 CSS 消费方
   （如行内编辑器、单元格内容自适应）与宿主按档位覆盖 token 使用 */
.vxe-table-wrapper.density--compact {
  --sg-table-row-height: var(--sg-table-row-height-compact);
  --sg-table-header-height: var(--sg-table-header-height-compact);
}
.vxe-table-wrapper.density--default {
  --sg-table-row-height: var(--sg-table-row-height-default);
  --sg-table-header-height: var(--sg-table-header-height-default);
}
.vxe-table-wrapper.density--large {
  --sg-table-row-height: var(--sg-table-row-height-large);
  --sg-table-header-height: var(--sg-table-header-height-large);
}
/* 列宽分配兜底：vxe 的 fit 剩余宽度分配在部分挂载时序下不会被重算（首次 calc 时
   容器尚窄则 meanWidth=0 永久定格），主层表格声明 min-width:100% 交给浏览器
   fixed 布局把差额均摊到各列，表头/表体同 colgroup 天然对齐。
   数据列经 min-width 声明（参与 vxe fit 均摊），vxe 重算后 col 总和贴合容器宽，
   本兜底不再产生差额；勾选/行号列（固定 width）不受视口宽度拉扯。
   列总宽超出容器（横向滚动）时 vxe 内联 width 生效、min-width 不参与，固定列层不在选择域内不受影响 */
.vxe-table-wrapper :deep(.vxe-table--render-default .vxe-table--main-wrapper table) {
  min-width: 100%;
}
/* 键盘导航焦点单元格（docs/19 G2）：主色描边，焦点可见 */
/* 勾选列上下同轴（docs/20 居中方案）：header-cell-config.padding=false 清零了表头单元格内边距，
   表体 .vxe-cell 带 vxe 默认 8px 水平内边距。列已改 align=center + width=36（20px 勾选框 + 左右
   各 8px padding），表头补齐同一 token 的对称内边距，使表头/表体勾选框同心居中 */
.vxe-table-wrapper :deep(.vxe-table--header .vxe-header--column.col--checkbox .vxe-cell) {
  padding-left: var(--vxe-ui-table-cell-padding-default, 8px);
  padding-right: var(--vxe-ui-table-cell-padding-default, 8px);
}
.vxe-table-wrapper :deep(.vxe-body--column.is-focused-cell > .vxe-cell) {
  outline: 2px solid var(--sg-color-primary);
  outline-offset: -2px;
  border-radius: var(--sg-radius-xs);
}
/* 分组组行（docs/19 F6）：浅色底 + 加粗区分数据行 */
.vxe-table-wrapper :deep(.vxe-body--row.is-group-row .vxe-body--column) {
  background: var(--sg-fill-color-light);
  font-weight: 600;
}
.vxe-table-wrapper.is-auto-fill {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
:deep(.schema-header-cell) {
  display: inline-flex;
  align-items: center;
  gap: var(--sg-spacing-3);
  max-width: 100%;
}
:deep(.schema-header-cell__title) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.schema-header-cell__arrow) {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid transparent;
  background: transparent;
  color: var(--sg-text-color-regular);
  line-height: 16px;
  font-size: var(--sg-font-size-base);
  border-radius: var(--sg-radius-sm);
  cursor: pointer;
}
:deep(.schema-header-cell__arrow:hover) {
  background: var(--sg-fill-color-light);
  border-color: var(--sg-border-color-light);
}
:deep(.schema-header-cell__arrow.is-active) {
  color: var(--sg-color-primary);
  border-color: var(--sg-color-primary-light-7);
  background: var(--sg-color-primary-light-9);
}
:deep(.action-cell) {
  cursor: pointer;
  color: var(--sg-color-primary);
  font-weight: 500;
}
:deep(.action-cell:hover) {
  background-color: var(--sg-color-primary-light-9) !important;
}
:deep(.relation-cell) {
  cursor: pointer;
  color: var(--sg-color-primary);
}
:deep(.relation-cell:hover) {
  background-color: var(--sg-color-primary-light-9) !important;
  text-decoration: underline;
}
:deep(.vxe-body--row .vxe-body--column) {
  cursor: default;
}
:deep(.vxe-body--row .vxe-body--column:not(.relation-cell):not(.action-cell)) {
  cursor: pointer;
}
/* 编辑态放开 td 裁剪（docs/20）：cell-config.height（密度档）使 vxe 给所有数据 td 挂
   col--cs-height，vxe 内置对这类 td 施加 overflow:hidden 以保证固定行高不被高内容撑破——
   浮层编辑器（.vxe-cell--wrapper 绝对定位、高出行高）连同确认/取消按钮因此被 td 底边裁掉。
   仅对编辑中的单元格放开 td 裁剪；查看态的行高约束（单行省略号、虚拟滚动行高几何）不受影响 */
:deep(.vxe-body--column.is-editing-cell) {
  overflow: visible !important;
}
:deep(.vxe-body--column.is-editing-cell > .vxe-cell) {
  overflow: visible !important;
  align-items: flex-start;
  position: relative;
}
:deep(.vxe-body--column.is-editing-cell .vxe-cell--wrapper) {
  overflow: visible !important;
  position: absolute;
  top: 2px;
  left: 0;
  right: 0;
  width: auto;
  z-index: var(--sg-z-index-topmost);
}
:deep(.vxe-body--column.is-editing-cell.vxe-inline-flip-y .vxe-cell--wrapper) {
  top: auto;
  bottom: 2px;
}
/* fit-row 档（docs/20 appearance.inlineEditLayout='fit-row'）：行内收纳兼容布局——输入控件
   与确认/取消同排压缩进固定行高，编辑器不超出行、不遮挡相邻行；宿主容器对溢出裁剪严格时
   也可用。fk 下拉等弹层仍为浮层（z-index），经上方 td 放开规则正常显示 */
.vxe-table-wrapper.is-fit-row-edit :deep(.vxe-body--column.is-editing-cell .edit-inline) {
  flex-wrap: nowrap;
  gap: var(--sg-spacing-2);
  padding: var(--sg-spacing-1);
  box-shadow: none;
}
.vxe-table-wrapper.is-fit-row-edit :deep(.edit-inline__actions) {
  flex: 0 0 auto;
  margin-left: 0;
}
.vxe-table-wrapper.is-fit-row-edit :deep(.edit-inline__btn) {
  flex: 0 0 auto;
  width: 24px;
}
.vxe-table-wrapper.is-fit-row-edit :deep(.edit-inline__input),
.vxe-table-wrapper.is-fit-row-edit :deep(.edit-inline__select) {
  height: 26px;
}
.vxe-table-wrapper.is-fit-row-edit :deep(.toggle-switch) {
  height: 26px;
}
/* media 行内编辑在 fit-row 下横排单行：缩略图收进行高内、操作按钮不再竖排 */
.vxe-table-wrapper.is-fit-row-edit :deep(.edit-inline__editor:has(.media-edit)) {
  flex-basis: auto;
}
.vxe-table-wrapper.is-fit-row-edit :deep(.media-edit) {
  flex-direction: row;
  align-items: center;
}
.vxe-table-wrapper.is-fit-row-edit :deep(.media-edit__thumb) {
  height: 26px;
  aspect-ratio: 1;
}
:deep(.vxe-body--row.is-editing-row) {
  background-color: var(--sg-color-primary-light-9) !important;
}
:deep(.vxe-body--row.is-selected-row) {
  background-color: var(--sg-color-primary-light-9) !important;
}

.relation-click-trigger {
  cursor: pointer;
  color: var(--sg-color-primary);
  user-select: none;
}
.relation-click-trigger:hover {
  text-decoration: underline;
  color: var(--sg-color-primary-light-3);
}

/* 标准操作列 */
:deep(.op-column) {
  background: var(--sg-fill-color-lighter);
}
/* 按钮为内容宽（列宽由 opColumnWidth 按实测文本计价），单元格 gap 与 OP_LINK_GAP 保持一致 */
.op-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.op-link {
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--sg-color-primary);
  font-size: var(--sg-font-size-md);
  line-height: 22px;
  user-select: none;
  white-space: nowrap;
}
.op-link:hover {
  text-decoration: underline;
  color: var(--sg-color-primary-light-3);
}
.op-link__icon {
  margin-right: 3px;
  vertical-align: -2px;
}
.op-link--danger {
  color: var(--sg-color-danger);
}
/* 行内无可用动作时的灰色占位(docs/20):避免操作列空白令人疑惑 */
.op-empty {
  color: var(--sg-text-color-disabled);
  font-size: var(--sg-font-size-sm);
}
.op-link--danger:hover {
  color: var(--sg-color-danger-light-3);
}

:deep(.edit-inline) {
  position: relative;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: stretch;
  background-color: var(--sg-bg-color);
  gap: var(--sg-spacing-3);
  padding: var(--sg-spacing-2);
  border-radius: var(--sg-radius-md);
  box-shadow: var(--sg-shadow-sm);
  min-width: 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
:deep(.edit-inline__editor) {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--sg-color-primary);
  border-radius: var(--sg-radius-md);
  background: var(--sg-color-primary-light-9);
}
:deep(.edit-inline__actions) {
  display: flex;
  align-items: stretch;
  gap: var(--sg-spacing-2);
  padding: 0;
  background-color: transparent;
  z-index: var(--sg-z-index-sticky);
  flex: 1;
  margin-left: auto;
}
:deep(.edit-inline__input) {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 var(--sg-spacing-3);
  border: none;
  border-radius: var(--sg-radius-sm);
  outline: none;
  font-size: var(--sg-font-size-md);
  background: var(--sg-bg-color);
}
:deep(.edit-inline__textarea) {
  height: auto;
  min-height: 28px;
  padding: var(--sg-spacing-2) var(--sg-spacing-3);
  resize: vertical;
  line-height: 1.4;
  font-family: inherit;
}
:deep(.edit-inline__select) {
  flex: 1;
  min-width: 0;
  height: 28px;
  border: none;
  border-radius: var(--sg-radius-sm);
  outline: none;
  font-size: var(--sg-font-size-md);
  background: var(--sg-bg-color);
  line-height: 1;
  padding: 0 var(--sg-spacing-3);
}
:deep(.edit-inline__btn) {
  flex: 1;
  width: 28px;
  padding: 0;
  border: 1px solid;
  border-radius: var(--sg-radius-sm);
  font-size: var(--sg-font-size-base);
  line-height: 1;
  cursor: pointer;
  background: var(--sg-bg-color);
  display: flex;
  justify-content: center;
  align-items: center;
}
/* mediaImage 行内编辑：缩略图置顶 + 按钮竖排，严格约束在列宽内（右侧固定列不遮挡） */
:deep(.edit-inline__editor:has(.media-edit)) {
  flex-basis: 100%;
}
:deep(.media-edit) {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--sg-spacing-2);
  width: 100%;
  min-width: 0;
}
/* 视觉隐藏但保留渲染，保证 mediaFileInput.click() 在各类浏览器/内嵌 webview 中都能唤起系统文件框 */
:deep(.media-edit__file) {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
  pointer-events: none;
}
:deep(.media-edit__thumb) {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 56px;
  flex: none;
  border-radius: var(--sg-radius-md);
  background: var(--sg-fill-color-light);
  overflow: hidden;
}
:deep(.media-edit__thumb :deep(.media-image-cell)) {
  max-width: 100%;
  max-height: 100%;
}
:deep(.media-edit__btn) {
  width: 100%;
  height: 24px;
  padding: 0 var(--sg-spacing-3);
  color: var(--sg-color-primary);
  border-color: var(--sg-color-primary-light-7);
  flex: none;
}
:deep(.media-edit__btn:hover) {
  color: var(--sg-color-white);
  background: var(--sg-color-primary);
}
:deep(.media-edit__btn:disabled) {
  color: var(--sg-color-primary-light-5);
  border-color: var(--sg-color-primary-light-8);
  background: var(--sg-color-primary-light-9);
  cursor: not-allowed;
}
:deep(.media-edit__btn--clear) {
  color: var(--sg-text-color-secondary);
  border-color: var(--sg-border-color);
}
:deep(.media-edit__btn--clear:hover) {
  color: var(--sg-color-white);
  background: var(--sg-color-info);
}
:deep(.edit-inline__btn--confirm) {
  color: var(--sg-color-success);
  border-color: var(--sg-color-success);
}
:deep(.edit-inline__btn--confirm:hover) {
  color: var(--sg-color-white);
  background: var(--sg-color-success);
}
:deep(.edit-inline__btn--cancel) {
  color: var(--sg-color-danger);
  border-color: var(--sg-color-danger);
}
:deep(.edit-inline__btn--cancel:hover) {
  color: var(--sg-color-white);
  background: var(--sg-color-danger);
}
:deep(.toggle-switch) {
  flex: 1 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sg-spacing-2);
  height: 28px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  outline: none;
  font-size: var(--sg-font-size-base);
}
:deep(.toggle-switch:focus-visible) {
  box-shadow: var(--sg-shadow-focus-strong);
  border-radius: var(--sg-radius-md);
}
:deep(.toggle-switch__thumb) {
  flex-shrink: 0;
  position: relative;
  width: 22px;
  height: 14px;
  border-radius: var(--sg-radius-xl);
  background: var(--sg-text-color-placeholder);
  transition: background var(--sg-duration-normal) ease;
}
:deep(.toggle-switch__thumb::after) {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: var(--sg-radius-circle);
  background: var(--sg-bg-color);
  box-shadow: var(--sg-shadow-sm);
  transform: translateX(8px);
  transition: transform var(--sg-duration-normal) ease;
}
:deep(.toggle-switch--on .toggle-switch__thumb) {
  background: var(--sg-color-primary);
}
:deep(.toggle-switch--on .toggle-switch__thumb::after) {
  transform: translateX(0);
}
:deep(.toggle-switch__label) {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--sg-text-color-placeholder);
  transition: color var(--sg-duration-normal) ease, font-weight var(--sg-duration-normal) ease;
}
:deep(.toggle-switch__label.is-active) {
  color: var(--sg-text-color-primary);
  font-weight: 600;
}

:deep(.cell-value) {
  display: inline-block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.cell-image) {
  display: inline-block;
  max-width: 64px;
  max-height: 64px;
  border-radius: var(--sg-radius-lg);
  object-fit: cover;
  cursor: zoom-in;
  border: 1px solid var(--sg-border-color-lighter);
  vertical-align: middle;
  transition: box-shadow var(--sg-duration-fast) ease;
}
:deep(.cell-image:hover) {
  box-shadow: var(--sg-shadow-md);
}
:deep(.cell-tag) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  min-width: 48px;
  padding: 0 var(--sg-spacing-5);
  height: 26px;
  line-height: 26px;
  border-radius: var(--sg-radius-md);
  background: var(--sg-color-primary-light-9);
  color: var(--sg-color-primary);
  font-size: var(--sg-font-size-base);
  font-weight: 500;
  border: 1px solid var(--sg-color-primary-light-8);
}
:deep(.cell-boolean) {
  display: inline-flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  font-weight: 500;
}
:deep(.cell-boolean::before) {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: var(--sg-radius-circle);
  background: currentColor;
  flex-shrink: 0;
}
/* boolean 状态默认配色：是=绿、否=红；自定义走 trueLabelClass/falseLabelClass
   （span 经 :class 绑定带 scoped 属性，预设类可直接命中；自定义色同样以此方式覆盖 color 即可） */
:deep(.cell-boolean--yes) {
  color: var(--sg-color-success);
}
:deep(.cell-boolean--no) {
  color: var(--sg-color-danger);
}
/* 预设：否/是无关紧要的中性灰（如「支持积分支付=否」）。
   固定色值不走 --el-color-info——宿主主题会把它映射成品牌蓝，失去「中性」语义 */
:deep(.cell-boolean--neutral) {
  color: var(--sg-text-color-secondary);
}

:deep(.cell-tag--fk) {
  background: var(--sg-color-primary-light-9);
  color: var(--sg-color-primary);
  border-color: var(--sg-color-primary-light-7);
}
/* 枚举彩色标签：span 经 v-html 注入拿不到 scoped 属性，几何样式在此重述；
   背景文字描边由 getEnumCellHtml 内联样式逐值覆盖，未声明颜色的取值即默认蓝标签 */
:deep(.cell-enum) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sg-spacing-2);
  flex-wrap: wrap;
}
:deep(.cell-enum :deep(.cell-tag)) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 0 var(--sg-spacing-5);
  height: 26px;
  line-height: 26px;
  border-radius: var(--sg-radius-md);
  background: var(--sg-color-primary-light-9);
  color: var(--sg-color-primary);
  font-size: var(--sg-font-size-base);
  font-weight: 500;
  border: 1px solid var(--sg-color-primary-light-8);
}

/* FK 编辑组件 */
:deep(.fk-edit-wrapper) {
  flex: 1;
  min-width: 0;
  position: relative;
}

:deep(.fk-edit-trigger) {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  height: 28px;
  padding: 0 var(--sg-spacing-3);
  border: 1px solid var(--sg-color-primary);
  border-radius: var(--sg-radius-sm);
  background: var(--sg-bg-color);
  cursor: pointer;
  transition: border-color var(--sg-duration-normal) ease, box-shadow var(--sg-duration-normal) ease;
  user-select: none;
}

:deep(.fk-edit-trigger:hover) {
  border-color: var(--sg-color-primary-light-3);
}

:deep(.fk-edit-trigger.is-open) {
  border-color: var(--sg-color-primary);
  box-shadow: var(--sg-shadow-focus);
}

:deep(.fk-edit-tag) {
  display: inline-flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  padding: 1px var(--sg-spacing-3);
  background: var(--sg-color-primary-light-9);
  border-radius: var(--sg-radius-sm);
  font-size: var(--sg-font-size-base);
  color: var(--sg-color-primary);
  font-weight: 500;
  max-width: 100%;
  overflow: hidden;
}

:deep(.fk-edit-tag-text) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.fk-edit-tag-close) {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: var(--sg-radius-circle);
  background: transparent;
  color: var(--sg-color-primary);
  font-size: var(--sg-font-size-xs);
  cursor: pointer;
  line-height: 1;
  transition: background var(--sg-duration-fast) ease, color var(--sg-duration-fast) ease;
}

:deep(.fk-edit-tag-close:hover) {
  background: var(--sg-color-primary);
  color: var(--sg-color-white);
}

:deep(.fk-edit-placeholder) {
  flex: 1;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-placeholder);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.fk-edit-arrow) {
  flex-shrink: 0;
  color: var(--sg-text-color-secondary);
  transition: transform var(--sg-duration-normal) ease;
}

:deep(.is-open .fk-edit-arrow) {
  transform: rotate(180deg);
  color: var(--sg-color-primary);
}

:deep(.fk-edit-dropdown) {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  min-width: 160px;
  margin-top: var(--sg-spacing-1);
  background: var(--sg-bg-color);
  border: 1px solid var(--sg-border-color-light);
  border-radius: var(--sg-radius-md);
  box-shadow: var(--sg-shadow-lg);
  z-index: var(--sg-z-index-overlay);
  overflow: hidden;
}

:deep(.fk-edit-dropdown-search) {
  padding: var(--sg-spacing-3);
  border-bottom: 1px solid var(--sg-border-color-extra-light);
}

:deep(.fk-edit-search-input) {
  width: 100%;
  height: 28px;
  padding: 0 var(--sg-spacing-4);
  border: 1px solid var(--sg-border-color);
  border-radius: var(--sg-radius-sm);
  outline: none;
  font-size: var(--sg-font-size-base);
  transition: border-color var(--sg-duration-normal) ease;
  box-sizing: border-box;
}

:deep(.fk-edit-search-input:focus) {
  border-color: var(--sg-color-primary);
}

:deep(.fk-edit-search-input::placeholder) {
  color: var(--sg-text-color-placeholder);
}

:deep(.fk-edit-dropdown-list) {
  max-height: 180px;
  overflow-y: auto;
  padding: var(--sg-spacing-2) 0;
}

:deep(.fk-edit-dropdown-item) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sg-spacing-2) var(--sg-spacing-5);
  cursor: pointer;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-primary);
  transition: background-color var(--sg-duration-fast) ease;
}

:deep(.fk-edit-dropdown-item:hover) {
  background-color: var(--sg-fill-color-light);
}

:deep(.fk-edit-dropdown-item.is-selected) {
  color: var(--sg-color-primary);
  font-weight: 500;
  background-color: var(--sg-color-primary-light-9);
}

:deep(.fk-edit-dropdown-item.is-disabled) {
  color: var(--sg-text-color-placeholder);
  cursor: not-allowed;
  pointer-events: none;
}

:deep(.fk-edit-dropdown-label) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.fk-edit-dropdown-check) {
  flex-shrink: 0;
  color: var(--sg-color-primary);
  margin-left: var(--sg-spacing-3);
}

:deep(.fk-edit-dropdown-empty) {
  padding: var(--sg-spacing-6) var(--sg-spacing-5);
  text-align: center;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-placeholder);
}

/* fk 下拉底部快速新建（col.quickCreate）：与候选列表分隔的常驻入口 */
:deep(.fk-edit-quick-create) {
  display: block;
  width: 100%;
  padding: var(--sg-spacing-4) var(--sg-spacing-5);
  border: none;
  border-top: 1px solid var(--sg-border-color-lighter);
  background: var(--sg-fill-color-light);
  color: var(--sg-color-primary);
  font-size: var(--sg-font-size-base);
  font-weight: 500;
  text-align: center;
  cursor: pointer;
}
:deep(.fk-edit-quick-create:hover) {
  background: var(--sg-color-primary-light-9);
  color: var(--sg-color-primary-dark-2);
}

.cell-highlighted :deep(.filter-match-highlight) {
  display: inline;
}

:deep(.edit-inline__number-wrapper) {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  border: 1px solid var(--sg-color-primary);
  border-radius: var(--sg-radius-sm);
  background: var(--sg-bg-color);
  overflow: hidden;
}

:deep(.edit-inline__number-wrapper .edit-inline__input) {
  flex: 1;
  border: none;
  border-radius: 0;
}

:deep(.edit-inline__number-wrapper.has-suffix .edit-inline__input) {
  border-right: 1px solid var(--sg-border-color-light);
}

:deep(.edit-inline__suffix) {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-secondary);
  background: var(--sg-fill-color-light);
  user-select: none;
}
</style>

<style>
.schemagine-header-popover .header-popover {
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-5);
}
.schemagine-header-popover .header-popover__sort {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-3);
  padding-bottom: var(--sg-spacing-4);
  border-bottom: 1px solid var(--sg-border-color-lighter);
}
/* 升/降序按钮状态由引擎全权接管。弹层 teleport 到 body，宿主的全局按钮主题
   （如 !important 强制 success 实底）会穿透进来吞掉激活态对比，故三态钉死：
   默认白底彩字 → hover 浅色底 → 激活（当前列正按该方向排序）实底白字 */
.schemagine-header-popover .header-popover__sort .el-button--success:not(.is-sorted) {
  background: var(--el-color-white) !important;
  border-color: var(--el-color-success) !important;
  color: var(--el-color-success) !important;
}
.schemagine-header-popover .header-popover__sort .el-button--success:not(.is-sorted):hover,
.schemagine-header-popover .header-popover__sort .el-button--success:not(.is-sorted):focus {
  background: var(--el-color-success-light-9) !important;
}
.schemagine-header-popover .header-popover__sort .el-button--success.is-sorted,
.schemagine-header-popover .header-popover__sort .el-button--success.is-sorted:hover,
.schemagine-header-popover .header-popover__sort .el-button--success.is-sorted:focus {
  background: var(--el-color-success) !important;
  border-color: var(--el-color-success) !important;
  color: var(--el-color-white) !important;
}
.schemagine-header-popover .header-popover__sort .el-button--danger:not(.is-sorted) {
  background: var(--el-color-white) !important;
  border-color: var(--el-color-danger) !important;
  color: var(--el-color-danger) !important;
}
.schemagine-header-popover .header-popover__sort .el-button--danger:not(.is-sorted):hover,
.schemagine-header-popover .header-popover__sort .el-button--danger:not(.is-sorted):focus {
  background: var(--el-color-danger-light-9) !important;
}
.schemagine-header-popover .header-popover__sort .el-button--danger.is-sorted,
.schemagine-header-popover .header-popover__sort .el-button--danger.is-sorted:hover,
.schemagine-header-popover .header-popover__sort .el-button--danger.is-sorted:focus {
  background: var(--el-color-danger) !important;
  border-color: var(--el-color-danger) !important;
  color: var(--el-color-white) !important;
}
.schemagine-header-popover .header-popover__filter {
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-4);
}
.schemagine-header-popover .header-popover__filter-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-regular);
}
.schemagine-header-popover .header-popover__mode-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  cursor: pointer;
}
.schemagine-header-popover .header-popover__mode-label {
  color: var(--sg-text-color-secondary);
}
.schemagine-header-popover .header-popover__mode-hint {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-secondary);
}
.schemagine-header-popover .header-popover__filter-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.schemagine-header-popover .header-popover__presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sg-spacing-1) var(--sg-spacing-2);
  margin-top: var(--sg-spacing-3);
}
.schemagine-header-popover .header-popover__presets .el-button {
  margin: 0;
  padding: var(--sg-spacing-2) var(--sg-spacing-3);
}
.schemagine-header-popover .header-popover__options {
  max-height: 240px;
  overflow: auto;
  padding: var(--sg-spacing-3) var(--sg-spacing-1);
  border: 1px solid var(--sg-border-color-lighter);
  border-radius: var(--sg-radius-md);
}
.schemagine-header-popover .header-popover__options .el-checkbox {
  display: flex;
  align-items: center;
  width: 100%;
  margin-right: 0;
  padding: var(--sg-spacing-2) var(--sg-spacing-3);
  border-radius: var(--sg-radius-md);
}
.schemagine-header-popover .header-popover__options .el-checkbox:hover {
  background: var(--sg-fill-color-light);
}
.schemagine-header-popover .header-popover__options .el-checkbox__label {
  flex: 1;
  min-width: 0;
}
.schemagine-header-popover .header-popover__opt-label,
.schemagine-header-popover .header-popover__opt-count {
  transition: color var(--sg-duration-fast) ease;
}
.schemagine-header-popover .header-popover__options .el-checkbox:hover .header-popover__opt-label {
  color: var(--sg-text-color-primary);
}
.schemagine-header-popover .header-popover__options .el-checkbox:hover .header-popover__opt-count {
  color: var(--sg-text-color-regular);
}
.schemagine-header-popover .header-popover__opt-label {
  margin-right: var(--sg-spacing-3);
}
.schemagine-header-popover .header-popover__opt-count {
  color: var(--sg-text-color-secondary);
}
.schemagine-header-popover .header-popover__loading,
.schemagine-header-popover .header-popover__loading-more {
  padding: var(--sg-spacing-4);
  color: var(--sg-text-color-secondary);
  font-size: var(--sg-font-size-base);
  text-align: center;
}
.schemagine-header-popover .header-popover__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--sg-spacing-4);
}

/* 截断单元格内容查看浮层（Teleport 到 body，全局样式；自管定位 fixed，开关单一状态机）。
   宽度随内容自适应，上限 400px：长值在 400px 处折行，短值面板收缩贴内容 */
.schemagine-cell-detail-panel {
  position: fixed;
  z-index: 4000;
  box-sizing: border-box;
  width: max-content;
  max-width: 400px;
  padding: var(--sg-spacing-5) var(--sg-spacing-6);
  background: var(--sg-bg-color);
  border: 1px solid var(--sg-border-color-light);
  border-radius: var(--sg-radius-xl);
  box-shadow: var(--sg-shadow-xl);
}
.schemagine-cell-detail-panel .cell-detail-popover__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sg-spacing-6);
  margin-bottom: var(--sg-spacing-3);
}
.schemagine-cell-detail-panel .cell-detail-popover__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--sg-font-size-base);
  font-weight: 600;
  color: var(--sg-text-color-secondary);
}
.schemagine-cell-detail-panel .cell-detail-popover__copy {
  flex-shrink: 0;
  padding: var(--sg-spacing-1) var(--sg-spacing-4);
  border: none;
  border-radius: var(--sg-radius-md);
  background: transparent;
  color: var(--sg-color-primary);
  font-size: var(--sg-font-size-base);
  cursor: pointer;
}
.schemagine-cell-detail-panel .cell-detail-popover__copy:hover {
  background: var(--sg-color-primary-light-9);
}
.schemagine-cell-detail-panel .cell-detail-popover__content {
  max-height: 260px;
  overflow: auto;
  font-size: var(--sg-font-size-md);
  line-height: 1.6;
  color: var(--sg-text-color-primary);
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
}
</style>
