<script lang="ts">
// WrapperColumn 已迁移至 wrapperTypes.ts；保留此 re-export 以兼容既有导入路径
export type { WrapperColumn } from './wrapperTypes'
</script>

<script setup lang="ts">
import { formatDateTimeCell } from '@/utils/recordRow'
import { reorderColumnsByDrag } from '@/utils/columnDrag'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { VxeTable, VxeColumn } from 'vxe-table'
import { VxeLoading, getI18n } from 'vxe-pc-ui'
import 'vxe-table/lib/style.css'
import 'vxe-pc-ui/lib/style.css'
import type { VxeTableInstance } from 'vxe-table'
import { ElPopover, ElInput, ElCheckbox, ElCheckboxGroup, ElButton, ElSwitch } from 'element-plus'
import MediaImageCell from '@/components/field/MediaImageCell.vue'
import MediaPickerDialog from '@/components/media/MediaPickerDialog.vue'
import QuickCreateDialog from '@/engine/dialogs/QuickCreateDialog.vue'
import type { FilterClause } from '@/types'
import { resolveScrollY } from './virtualScroll'
import { useColumnBuilding } from './useColumnBuilding'
import { useFkOptions } from './useFkOptions'
import { useCellRendering } from './useCellRendering'
import { useHeaderFilter } from './useHeaderFilter'
import { useInlineEdit } from './useInlineEdit'
import { useCellDetail } from './useCellDetail'
import type { WrapperColumn } from './wrapperTypes'

const ROW_HEIGHT = 44
const HEADER_HEIGHT = 49
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
}>(), {
  loading: false,
  virtualScroll: false,
  editable: false,
  selectedRowId: null,
  rowKey: '_recordId',
  columnDraggable: false,
  fixedRowCount: undefined,
  showSelection: false,
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
  onTextareaEnter,
  cancelEdit,
  toggleEditValue,
  getFkLabel,
  toggleFkDropdown,
  closeFkDropdown,
  selectFkOption,
  clearFkSelection,
  mediaPickerVisible,
  mediaUploading,
  mediaFileInput,
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

// ---- vxe 事件转发：薄封装，组合上述各域并向宿主上抛 ----

function handleSortChange(params: any): void {
  const { field, order } = params
  emit('sort-change', { field, order: order || null })
}

function handleCellClick(params: any): void {
  emit('row-click', { row: params.row, rowIndex: params.rowIndex })
  const col = visibleColumns.value.find(c => c.field === params.column.field)
  if (!col) return
  if (col.isRelation) {
    emit('relation-click', { row: params.row, column: col })
    return
  }
  // 截断内容查看与 cell-click 上抛互不影响（宿主监听仍照常触发）
  maybeOpenCellDetail(params, col)
  emit('cell-click', { row: params.row, column: col, rowIndex: params.rowIndex, colIndex: params.column.index })
}

function handleOpClick(row: Record<string, unknown>, col: WrapperColumn): void {
  // 标准删除操作统一以 'delete' 作为 actionId 上抛，与字段 key 解耦
  emit('row-action', { row, actionId: col.actionDanger ? 'delete' : col.field })
}

function handleCellDblclick(params: any): void {
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

function handleColumnDragEnd(params: any): void {
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

const tableHeight = computed(() => {
  if (props.fixedRowCount) {
    return HEADER_HEIGHT + props.fixedRowCount * ROW_HEIGHT + BORDER_HEIGHT
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

function getCellClassName({ row, column }: any): string {
  const col = visibleColumns.value.find((c: WrapperColumn) => c.field === column.field)
  const classes: string[] = []
  if (col?.isAction) classes.push('action-cell')
  if (col?.isRelation) classes.push('relation-cell')
  if (col && isEditing(row[props.rowKey], col.field)) classes.push('is-editing-cell')
  if (col?.cellClass) {
    const value = row[column.field]
    classes.push(col.cellClass({ value }))
  }
  return classes.filter(Boolean).join(' ')
}

function getRowClassName({ row }: any): string {
  const classes: string[] = []
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
    :class="{ 'is-auto-fill': !fixedRowCount }"
  >
    <VxeTable
      ref="tableRef"
      :data="data"
      :height="tableHeight"
      :max-height="tableMaxHeight"
      :row-config="{ keyField: rowKey, isHover: true }"
      :scroll-y="tableScrollY"
      :row-class-name="getRowClassName"
      :sort-config="{ trigger: 'default', remote: true, defaultSort: sortConfig as any, showIcon: false, multiple: false }"
      :keep-source="true"
      :column-config="{ drag: columnDraggable }"
      :column-drag-config="{ tooltipMethod: columnDragTooltipMethod }"
      :cell-class-name="getCellClassName"
      :align="'left'"
      :show-overflow="'title'"
      :border="'inner'"
      :stripe="false"
      :checkbox-config="{ highlight: true, reserve: true }"
      @sort-change="handleSortChange"
      @cell-click="handleCellClick"
      @cell-dblclick="handleCellDblclick"
      @column-drag-end="handleColumnDragEnd"
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
      <!-- 行首复选框列：仅在需要批量操作（如批量删除）时显示 -->
      <VxeColumn v-if="showSelection" type="checkbox" width="48" fixed="left" />
      <!-- 数据列：view 模式显示值，edit 模式显示编辑器 -->
      <VxeColumn
        v-for="col in dataColumns"
        :key="col.field"
        :field="col.field"
        :title="col.title"
        :width="col.width"
        :min-width="col.minWidth"
        :fixed="col.fixed"
        :sortable="col.sortable"
        :align="col.align || 'left'"
      >
        <template #header="hdrParams">
          <slot v-if="headerSlotName(col)" :name="headerSlotName(col)" :column="col" :field-schema="col.fieldSchema" />
          <div v-else class="schema-header-cell" @click.stop>
            <span class="schema-header-cell__title">{{ col.title }}</span>
            <!-- vxe-table 固定列会把整份表头克隆到 fixed-wrapper（isHidden 列仅 visibility:hidden 但保留布局坐标），
                 克隆份若也挂 popover，受控 visible 会两份同开，且克隆份定位偏移到表格外侧 -->
            <ElPopover
              v-if="!hdrParams?.isHidden"
              trigger="click"
              placement="bottom-start"
              :width="320"
              :teleported="true"
              popper-class="schemagine-header-popover"
              :z-index="4000"
              :visible="headerMenuField === col.field"
              @update:visible="(v: boolean) => handleHeaderPopoverVisibleChange(col.field, v)"
            >
              <template #reference>
                <button
                  type="button"
                  class="schema-header-cell__arrow"
                  :class="{ 'is-active': !!getHeaderFilterClause(col.field) || (sortConfig?.field === col.field) }"
                  aria-label="筛选与排序"
                  @click.stop
                >▼</button>
              </template>

              <div class="header-popover">
                <div class="header-popover__sort">
                  <ElButton size="small" type="success" plain @click="applyHeaderSort(col.field, 'asc')">
                    <span class="sort-icon sort-icon--asc">↑</span>
                    升序
                  </ElButton>
                  <ElButton size="small" type="danger" plain @click="applyHeaderSort(col.field, 'desc')">
                    <span class="sort-icon sort-icon--desc">↓</span>
                    降序
                  </ElButton>
                  <ElButton size="small" text type="info" @click="applyHeaderSort(col.field, null)">
                    <span class="sort-icon sort-icon--clear">×</span>
                    清除排序
                  </ElButton>
                </div>

                <div class="header-popover__filter">
                  <div class="header-popover__filter-title">
                    <span>{{ isCandidateMode ? '候选值筛选' : (isDatetimeCol(col) ? '时间段筛选' : '内容筛选') }}</span>
                    <label v-if="modeSwitchable(col)" class="header-popover__mode-switch" @click.stop>
                      <span class="header-popover__mode-label">候选值模式</span>
                      <ElSwitch v-model="isCandidateMode" size="small" />
                    </label>
                  </div>
                  <!-- 时间段筛选（range 模式，date/datetime 列专用）：起止闭区间，between 子句。
                       显式 filterCandidates 的日期列默认候选值模式，经开关切回 range 才渲染此分支 -->
                  <template v-if="headerFilterMode === 'range'">
                    <ElDatePicker
                      :model-value="headerFilterRange"
                      :type="isDateOnlyCol(col) ? 'daterange' : 'datetimerange'"
                      :format="isDateOnlyCol(col) ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss'"
                      :value-format="isDateOnlyCol(col) ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss'"
                      range-separator="至"
                      :start-placeholder="isDateOnlyCol(col) ? '开始日期' : '开始时间'"
                      :end-placeholder="isDateOnlyCol(col) ? '结束日期' : '结束时间'"
                      :default-time="isDateOnlyCol(col) ? undefined : [new Date(2000, 0, 1, 0, 0, 0), new Date(2000, 0, 1, 23, 59, 59)]"
                      size="small"
                      clearable
                      :teleported="false"
                      style="width: 280px"
                      @update:model-value="onRangePick"
                    />
                    <!-- 时间段快捷预设：一键填充起止并应用 -->
                    <div class="header-popover__presets">
                      <ElButton
                        v-for="p in RANGE_PRESETS"
                        :key="p.key"
                        size="small"
                        text
                        type="primary"
                        @click="applyRangePreset(col.field, p.key)"
                      >{{ p.label }}</ElButton>
                    </div>
                    <div class="header-popover__filter-actions">
                      <span class="header-popover__mode-hint">按起止时间筛选（含边界）</span>
                      <ElButton
                        v-if="getHeaderFilterClause(col.field)"
                        size="small"
                        text
                        type="danger"
                        @click="clearHeaderFilter(col.field)"
                      >清除筛选</ElButton>
                    </div>
                  </template>
                  <template v-else>
                  <ElInput
                    v-model="headerMenuKeyword"
                    size="small"
                    clearable
                    :placeholder="isCandidateMode ? '搜索候选值' : '输入关键词，回车筛选'"
                    :title="isCandidateMode ? undefined : '关键词对列内容做包含匹配；外键列匹配关联对象的名称'"
                    @keyup.enter="() => { if (!isCandidateMode) applyHeaderFilter(col.field) }"
                  />

                  <!-- 关键词模式（默认）：直接以输入内容作为 like 条件 -->
                  <template v-if="!isCandidateMode">
                    <div
                      v-if="getHeaderFilterClause(col.field)"
                      class="header-popover__filter-actions"
                    >
                      <span class="header-popover__mode-hint">
                        当前：包含「{{ typeof getHeaderFilterClause(col.field)!.value === 'string' ? getHeaderFilterClause(col.field)!.value : '' }}」
                      </span>
                      <ElButton
                        size="small"
                        text
                        type="danger"
                        @click="clearHeaderFilter(col.field)"
                      >清除筛选</ElButton>
                    </div>
                    <div v-else class="header-popover__filter-actions">
                      <span class="header-popover__mode-hint">外键列将按关联对象的名称匹配</span>
                    </div>
                  </template>

                  <!-- 候选值模式：勾选具体值（in 条件） -->
                  <template v-else>
                    <div
                      v-if="headerMenuOptions.length > 0 || getHeaderFilterClause(col.field)"
                      class="header-popover__filter-actions"
                    >
                      <ElCheckbox
                        v-if="headerMenuOptions.length > 0"
                        :model-value="headerSelectAll"
                        :indeterminate="headerSelectIndeterminate"
                        @update:model-value="(v: any) => toggleHeaderSelectAll(!!v)"
                      >全选</ElCheckbox>
                      <ElButton
                        v-if="getHeaderFilterClause(col.field)"
                        size="small"
                        text
                        type="danger"
                        @click="clearHeaderFilter(col.field)"
                      >清除筛选</ElButton>
                    </div>

                    <!-- 无候选值时不渲染空选项区（加载中除外） -->
                    <div
                      v-if="headerMenuLoading || headerMenuOptions.length > 0"
                      class="header-popover__options"
                      @scroll.passive="(e: Event) => { const el = e.target as HTMLElement; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 12) loadMoreHeaderMenuOptions() }"
                    >
                      <div v-if="headerMenuLoading && headerMenuOptions.length === 0" class="header-popover__loading">加载中...</div>
                      <ElCheckboxGroup v-model="headerMenuSelectedKeys">
                        <ElCheckbox
                          v-for="opt in headerMenuOptions"
                          :key="facetValueKey(opt.value)"
                          :value="facetValueKey(opt.value)"
                          :disabled="opt.disabled"
                        >
                          <span class="header-popover__opt-label">{{ opt.label }}</span>
                          <span class="header-popover__opt-count">({{ opt.count }})</span>
                        </ElCheckbox>
                      </ElCheckboxGroup>
                      <div v-if="headerMenuLoading && headerMenuOptions.length > 0" class="header-popover__loading-more">加载中...</div>
                    </div>
                  </template>
                  </template>

                  <div class="header-popover__footer">
                    <ElButton size="small" type="primary" @click="applyHeaderFilter(col.field)">确定</ElButton>
                    <ElButton size="small" @click="headerMenuField = null">取消</ElButton>
                  </div>
                </div>
              </div>
            </ElPopover>
          </div>
        </template>
        <template #default="{ row }">
          <!-- 单元格插槽透传（docs/19 B2）：宿主命中时覆盖内置渲染 -->
          <slot
            v-if="cellSlotName(col)"
            :name="cellSlotName(col)"
            :row="row"
            :value="row[col.field]"
            :column="col"
            :field-schema="col.fieldSchema"
          />
          <template v-else-if="isEditing(row[props.rowKey], col.field)">
            <div class="edit-inline" @click.stop>
              <div class="edit-inline__editor">
                <!-- 自定义字段类型（docs/19 B1）：注册了编辑器组件的自定义类型 -->
                <component
                  :is="customEditorDef(col)"
                  v-if="customEditorDef(col)"
                  :value="editValue"
                  :model-value="editValue"
                  :field-schema="col.fieldSchema"
                  @update:model-value="editValue = $event"
                  @update:value="editValue = $event"
                />
                <!-- text / email / url / phone -->
                <input
                  v-if="!customEditorDef(col) && (!col.fieldType || col.fieldType === 'text' || col.fieldType === 'email' || col.fieldType === 'url' || col.fieldType === 'phone')"
                  v-model="editValue"
                  class="edit-inline__input"
                  @keydown.enter="confirmEdit(row, col)"
                  @keydown.escape="cancelEdit"
                />
                <!-- number / currency / percent -->
                <div
                  v-else-if="col.fieldType === 'number' || col.fieldType === 'currency' || col.fieldType === 'money' || col.fieldType === 'percent'"
                  class="edit-inline__number-wrapper"
                  :class="{ 'has-suffix': col.fieldType === 'percent' }"
                >
                  <input
                    v-model.number="editValue"
                    type="number"
                    class="edit-inline__input"
                    @keydown.enter="confirmEdit(row, col)"
                    @keydown.escape="cancelEdit"
                  />
                  <span
                    v-if="col.fieldType === 'percent'"
                    class="edit-inline__suffix"
                  >%</span>
                </div>
                <!-- date -->
                <input
                  v-else-if="col.fieldType === 'date'"
                  v-model="editValue"
                  type="date"
                  class="edit-inline__input"
                  @keydown.enter="confirmEdit(row, col)"
                  @keydown.escape="cancelEdit"
                />
                <!-- datetime -->
                <input
                  v-else-if="col.fieldType === 'datetime'"
                  v-model="editValue"
                  type="datetime-local"
                  class="edit-inline__input"
                  @keydown.enter="confirmEdit(row, col)"
                  @keydown.escape="cancelEdit"
                />
                <!-- textarea -->
                <textarea
                  v-else-if="col.fieldType === 'textarea'"
                  v-model="editValue"
                  class="edit-inline__input edit-inline__textarea"
                  @keydown.enter.prevent="onTextareaEnter($event, row, col)"
                  @keydown.escape="cancelEdit"
                />
                <!-- boolean：toggle switch 切换预览，确认后才保存 -->
                <button
                  v-else-if="col.fieldType === 'boolean'"
                  type="button"
                  class="toggle-switch"
                  :class="{ 'toggle-switch--on': editValue }"
                  :aria-checked="!!editValue"
                  role="switch"
                  @click="toggleEditValue()"
                >
                  <span class="toggle-switch__label toggle-switch__label--yes" :class="{ 'is-active': editValue }">{{ col.trueLabel || '是' }}</span>
                  <span class="toggle-switch__thumb"></span>
                  <span class="toggle-switch__label toggle-switch__label--no" :class="{ 'is-active': !editValue }">{{ col.falseLabel || '否' }}</span>
                </button>
                <!-- select / status -->
                <select
                  v-else-if="(col.fieldType === 'select' || col.fieldType === 'status') && col.selectOptions"
                  v-model="editValue"
                  class="edit-inline__select"
                >
                  <option
                    v-for="o in col.selectOptions"
                    :key="String(o.value)"
                    :value="o.value"
                  >
                    {{ o.label }}
                  </option>
                </select>
                <!-- fk -->
                <div
                  v-else-if="col.fieldType === 'fk'"
                  class="fk-edit-wrapper"
                >
                  <div
                    class="fk-edit-trigger"
                    :class="{ 'is-open': fkDropdownOpen }"
                    @click="toggleFkDropdown"
                  >
                    <span v-if="getFkLabel(editValue)" class="fk-edit-tag">
                      <span class="fk-edit-tag-text">{{ getFkLabel(editValue) }}</span>
                      <button
                        class="fk-edit-tag-close"
                        @click.stop="clearFkSelection"
                        title="清除"
                        aria-label="清除选择"
                      >&#10005;</button>
                    </span>
                    <span v-else class="fk-edit-placeholder">
                      {{ fkLoading ? '加载中...' : '点击选择关联...' }}
                    </span>
                    <svg class="fk-edit-arrow" width="12" height="12" viewBox="0 0 12 12">
                      <path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                  <div v-if="fkDropdownOpen" class="fk-edit-dropdown" @click.stop>
                    <div class="fk-edit-dropdown-search">
                      <input
                        v-model="fkSearchText"
                        class="fk-edit-search-input"
                        type="text"
                        placeholder="搜索..."
                        @keydown.escape="closeFkDropdown"
                      />
                    </div>
                    <div class="fk-edit-dropdown-list">
                      <div
                        v-for="o in fkFilteredOptions"
                        :key="String(o.value)"
                        class="fk-edit-dropdown-item"
                        :class="{
                          'is-selected': o.value === editValue,
                          'is-disabled': o.disabled,
                        }"
                        @click="selectFkOption(o)"
                      >
                        <span class="fk-edit-dropdown-label">{{ o.label }}</span>
                        <svg
                          v-if="o.value === editValue"
                          class="fk-edit-dropdown-check"
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                        >
                          <path d="M2.5 7l3 3 6-6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </div>
                      <div v-if="fkFilteredOptions.length === 0" class="fk-edit-dropdown-empty">
                        {{ fkSearchText ? '无匹配结果' : '暂无可选项' }}
                      </div>
                    </div>
                    <button
                      v-if="col.quickCreate"
                      type="button"
                      class="fk-edit-quick-create"
                      @click="openFkQuickCreate"
                    >+ 新建{{ col.title }}</button>
                  </div>
                </div>
                <!-- mediaImage：媒体库选择 / 上传新资源 / 清除，确认后才保存媒体 id -->
                <div v-else-if="col.fieldType === 'mediaImage'" class="media-edit">
                  <span class="media-edit__thumb">
                    <MediaImageCell :value="editValue" :preview="false" />
                  </span>
                  <button
                    type="button"
                    class="edit-inline__btn media-edit__btn"
                    @click="openMediaPicker"
                  >媒体库</button>
                  <button
                    type="button"
                    class="edit-inline__btn media-edit__btn"
                    :disabled="mediaUploading"
                    @click="triggerMediaUpload($event)"
                  >{{ mediaUploading ? '上传中...' : '上传' }}</button>
                  <button
                    type="button"
                    class="edit-inline__btn media-edit__btn media-edit__btn--clear"
                    @click="clearMediaSelection"
                  >清除</button>
                  <!-- 关键：不能用 hidden/display:none，否则内嵌 webview/部分浏览器下 .click() 无法唤起系统文件框 -->
                  <input ref="mediaFileInput" type="file" accept="image/*" class="media-edit__file" @change="onMediaFileChange" />
                </div>
                <!-- fallback -->
                <input
                  v-else
                  v-model="editValue"
                  class="edit-inline__input"
                  @keydown.enter="confirmEdit(row, col)"
                  @keydown.escape="cancelEdit"
                />
              </div>

              <div class="edit-inline__actions">
                <button
                  class="edit-inline__btn edit-inline__btn--confirm"
                  @click="confirmEdit(row, col)"
                  title="保存"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </button>
                <button
                  class="edit-inline__btn edit-inline__btn--cancel"
                  @click="cancelEdit"
                  title="取消"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
          </template>
          <MediaImageCell
            v-else-if="col.fieldType === 'mediaImage' && row[col.field]"
            :value="row[col.field]"
          />
          <img
            v-else-if="(col.fieldType === 'image' || col.fieldType === 'attachment') && row[col.field]"
            :src="String(row[col.field])"
            class="cell-image"
            alt=""
            loading="lazy"
            @click="openImage(row[col.field])"
          />
          <span v-else-if="col.fieldType === 'datetime' || col.fieldType === 'date'" class="cell-value cell-datetime">{{ formatDateTimeCell(row[col.field], col.fieldType) }}</span>
          <!-- 枚举彩色标签：任一取值声明了颜色（options[].color / statusMap）时逐值渲染带色标签 -->
          <span
            v-else-if="isEnumColumn(col) && hasEnumTagStyle(row[col.field], col)"
            class="cell-value cell-enum"
            v-html="getEnumCellHtml(row[col.field], col)"
          ></span>
            <!-- select/fk 空值不挂 cell-tag：否则空单元格渲染出空胶囊占位 -->
            <span v-else class="cell-value" :class="[(col.fieldType === 'select' || col.fieldType === 'fk') && row[col.field] != null && row[col.field] !== '' ? 'cell-tag' : '', col.fieldType === 'fk' ? 'cell-tag--fk' : '', col.fieldType === 'boolean' ? ['cell-boolean', getBooleanStateClass(row[col.field]), row[col.field] ? col.trueLabelClass : col.falseLabelClass] : '', hasFilterMatch(col) ? 'cell-highlighted' : '']" v-html="getCellHighlightHtml(row[col.field], col)"></span>
        </template>
      </VxeColumn>

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
        title="操作"
        :width="opColumnWidth"
        fixed="right"
        align="center"
        class-name="op-column"
      >
        <template #default="{ row }">
          <span class="op-cell">
            <button
              v-for="op in visibleOps(row)"
              :key="op.field"
              type="button"
              class="op-link"
              :class="{ 'op-link--danger': op.actionDanger }"
              @click.stop="handleOpClick(row, op)"
            >
              {{ op.title }}
            </button>
          </span>
        </template>
      </VxeColumn>
    </VxeTable>

    <!-- mediaImage 行内编辑共用媒体选择弹窗（append-to-body，不参与表格布局） -->
    <MediaPickerDialog v-model="mediaPickerVisible" :selected-id="editValue" @select="onMediaPicked" />

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
/* 列宽分配兜底：vxe 的 fit 剩余宽度分配在部分挂载时序下不会被重算（首次 calc 时
   容器尚窄则 meanWidth=0 永久定格），主层表格声明 min-width:100% 交给浏览器
   fixed 布局把差额均摊到各列，表头/表体同 colgroup 天然对齐。
   列总宽超出容器（横向滚动）时 vxe 内联 width 生效、min-width 不参与，固定列层不在选择域内不受影响 */
.vxe-table-wrapper :deep(.vxe-table--render-default .vxe-table--main-wrapper table) {
  min-width: 100%;
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
.schema-header-cell__arrow {
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
.schema-header-cell__arrow:hover {
  background: var(--sg-fill-color-light);
  border-color: var(--sg-border-color-light);
}
.schema-header-cell__arrow.is-active {
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
.op-link--danger {
  color: var(--sg-color-danger);
}
.op-link--danger:hover {
  color: var(--sg-color-danger-light-3);
}

.edit-inline {
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
.edit-inline__editor {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--sg-color-primary);
  border-radius: var(--sg-radius-md);
  background: var(--sg-color-primary-light-9);
}
.edit-inline__actions {
  display: flex;
  align-items: stretch;
  gap: var(--sg-spacing-2);
  padding: 0;
  background-color: transparent;
  z-index: var(--sg-z-index-sticky);
  flex: 1;
  margin-left: auto;
}
.edit-inline__input {
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
.edit-inline__textarea {
  height: auto;
  min-height: 28px;
  padding: var(--sg-spacing-2) var(--sg-spacing-3);
  resize: vertical;
  line-height: 1.4;
  font-family: inherit;
}
.edit-inline__select {
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
.edit-inline__btn {
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
.edit-inline__editor:has(.media-edit) {
  flex-basis: 100%;
}
.media-edit {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--sg-spacing-2);
  width: 100%;
  min-width: 0;
}
/* 视觉隐藏但保留渲染，保证 mediaFileInput.click() 在各类浏览器/内嵌 webview 中都能唤起系统文件框 */
.media-edit__file {
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
.media-edit__thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 56px;
  flex: none;
  border-radius: var(--sg-radius-md);
  background: var(--sg-fill-color-light);
  overflow: hidden;
}
.media-edit__thumb :deep(.media-image-cell) {
  max-width: 100%;
  max-height: 100%;
}
.media-edit__btn {
  width: 100%;
  height: 24px;
  padding: 0 var(--sg-spacing-3);
  color: var(--sg-color-primary);
  border-color: var(--sg-color-primary-light-7);
  flex: none;
}
.media-edit__btn:hover {
  color: var(--sg-color-white);
  background: var(--sg-color-primary);
}
.media-edit__btn:disabled {
  color: var(--sg-color-primary-light-5);
  border-color: var(--sg-color-primary-light-8);
  background: var(--sg-color-primary-light-9);
  cursor: not-allowed;
}
.media-edit__btn--clear {
  color: var(--sg-text-color-secondary);
  border-color: var(--sg-border-color);
}
.media-edit__btn--clear:hover {
  color: var(--sg-color-white);
  background: var(--sg-color-info);
}
.edit-inline__btn--confirm {
  color: var(--sg-color-success);
  border-color: var(--sg-color-success);
}
.edit-inline__btn--confirm:hover {
  color: var(--sg-color-white);
  background: var(--sg-color-success);
}
.edit-inline__btn--cancel {
  color: var(--sg-color-danger);
  border-color: var(--sg-color-danger);
}
.edit-inline__btn--cancel:hover {
  color: var(--sg-color-white);
  background: var(--sg-color-danger);
}
.toggle-switch {
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
.toggle-switch:focus-visible {
  box-shadow: var(--sg-shadow-focus-strong);
  border-radius: var(--sg-radius-md);
}
.toggle-switch__thumb {
  flex-shrink: 0;
  position: relative;
  width: 22px;
  height: 14px;
  border-radius: var(--sg-radius-xl);
  background: var(--sg-text-color-placeholder);
  transition: background var(--sg-duration-normal) ease;
}
.toggle-switch__thumb::after {
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
.toggle-switch--on .toggle-switch__thumb {
  background: var(--sg-color-primary);
}
.toggle-switch--on .toggle-switch__thumb::after {
  transform: translateX(0);
}
.toggle-switch__label {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--sg-text-color-placeholder);
  transition: color var(--sg-duration-normal) ease, font-weight var(--sg-duration-normal) ease;
}
.toggle-switch__label.is-active {
  color: var(--sg-text-color-primary);
  font-weight: 600;
}

.cell-value {
  display: inline-block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-image {
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
.cell-image:hover {
  box-shadow: var(--sg-shadow-md);
}
.cell-tag {
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
.cell-boolean {
  display: inline-flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  font-weight: 500;
}
.cell-boolean::before {
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
.cell-boolean--yes {
  color: var(--sg-color-success);
}
.cell-boolean--no {
  color: var(--sg-color-danger);
}
/* 预设：否/是无关紧要的中性灰（如「支持积分支付=否」）。
   固定色值不走 --el-color-info——宿主主题会把它映射成品牌蓝，失去「中性」语义 */
.cell-boolean--neutral {
  color: var(--sg-text-color-secondary);
}

.cell-tag--fk {
  background: var(--sg-color-primary-light-9);
  color: var(--sg-color-primary);
  border-color: var(--sg-color-primary-light-7);
}
/* 枚举彩色标签：span 经 v-html 注入拿不到 scoped 属性，几何样式在此重述；
   背景文字描边由 getEnumCellHtml 内联样式逐值覆盖，未声明颜色的取值即默认蓝标签 */
.cell-enum {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sg-spacing-2);
  flex-wrap: wrap;
}
.cell-enum :deep(.cell-tag) {
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
.fk-edit-wrapper {
  flex: 1;
  min-width: 0;
  position: relative;
}

.fk-edit-trigger {
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

.fk-edit-trigger:hover {
  border-color: var(--sg-color-primary-light-3);
}

.fk-edit-trigger.is-open {
  border-color: var(--sg-color-primary);
  box-shadow: var(--sg-shadow-focus);
}

.fk-edit-tag {
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

.fk-edit-tag-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fk-edit-tag-close {
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

.fk-edit-tag-close:hover {
  background: var(--sg-color-primary);
  color: var(--sg-color-white);
}

.fk-edit-placeholder {
  flex: 1;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-placeholder);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fk-edit-arrow {
  flex-shrink: 0;
  color: var(--sg-text-color-secondary);
  transition: transform var(--sg-duration-normal) ease;
}

.is-open .fk-edit-arrow {
  transform: rotate(180deg);
  color: var(--sg-color-primary);
}

.fk-edit-dropdown {
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

.fk-edit-dropdown-search {
  padding: var(--sg-spacing-3);
  border-bottom: 1px solid var(--sg-border-color-extra-light);
}

.fk-edit-search-input {
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

.fk-edit-search-input:focus {
  border-color: var(--sg-color-primary);
}

.fk-edit-search-input::placeholder {
  color: var(--sg-text-color-placeholder);
}

.fk-edit-dropdown-list {
  max-height: 180px;
  overflow-y: auto;
  padding: var(--sg-spacing-2) 0;
}

.fk-edit-dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sg-spacing-2) var(--sg-spacing-5);
  cursor: pointer;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-primary);
  transition: background-color var(--sg-duration-fast) ease;
}

.fk-edit-dropdown-item:hover {
  background-color: var(--sg-fill-color-light);
}

.fk-edit-dropdown-item.is-selected {
  color: var(--sg-color-primary);
  font-weight: 500;
  background-color: var(--sg-color-primary-light-9);
}

.fk-edit-dropdown-item.is-disabled {
  color: var(--sg-text-color-placeholder);
  cursor: not-allowed;
  pointer-events: none;
}

.fk-edit-dropdown-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fk-edit-dropdown-check {
  flex-shrink: 0;
  color: var(--sg-color-primary);
  margin-left: var(--sg-spacing-3);
}

.fk-edit-dropdown-empty {
  padding: var(--sg-spacing-6) var(--sg-spacing-5);
  text-align: center;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-placeholder);
}

/* fk 下拉底部快速新建（col.quickCreate）：与候选列表分隔的常驻入口 */
.fk-edit-quick-create {
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
.fk-edit-quick-create:hover {
  background: var(--sg-color-primary-light-9);
  color: var(--sg-color-primary-dark-2);
}

.sort-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  margin-right: var(--sg-spacing-1);
  font-size: var(--sg-font-size-base);
  line-height: 1;
  color: currentColor;
}

.cell-highlighted :deep(.filter-match-highlight) {
  display: inline;
}

.edit-inline__number-wrapper {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  border: 1px solid var(--sg-color-primary);
  border-radius: var(--sg-radius-sm);
  background: var(--sg-bg-color);
  overflow: hidden;
}

.edit-inline__number-wrapper .edit-inline__input {
  flex: 1;
  border: none;
  border-radius: 0;
}

.edit-inline__number-wrapper.has-suffix .edit-inline__input {
  border-right: 1px solid var(--sg-border-color-light);
}

.edit-inline__suffix {
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
