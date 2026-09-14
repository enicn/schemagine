<script setup lang="ts">
import { ref, computed, watch, inject, type Ref } from 'vue'
import { ElTag, ElButton, ElMessageBox } from 'element-plus'
import SchemaTable from '@/components/table/SchemaTable.vue'
import SchemaPagination from '@/components/table/SchemaPagination.vue'
import { getOperatorLabel } from '@/utils/filterLabels'
import BottomTabs from '@/components/filter/BottomTabs.vue'
import type { FilterTab } from '@/components/filter/BottomTabs.vue'
import ListActionBar from '@/engine/actions/ListActionBar.vue'
import type { FieldSchema } from '@/types'
import { useAggregation } from '@/composables/useAggregation'
import { usePermission } from '@/composables/usePermission'
import { recordService } from '@/services/api/recordService'
import { useMounted } from '@/composables/useMounted'
import { useRecords, useSchemaMeta, useUi } from '@/composables/instanceState'
import type { ModuleSchema, ColumnConfig, SortParam, QueryState, FilterClause, ListAction } from '@/types'
import type { AggregationItem } from '@/composables/useAggregation'

const props = defineProps<{
  schema: ModuleSchema
  viewConfig: ColumnConfig[] | null
  initialQueryState?: Partial<QueryState>
  infiniteScroll?: boolean
  externalFilters?: FilterClause[] | null
  /** 透传给 SchemaTable 的表格高度（vxe height），不传保持自然高度 */
  tableHeight?: string | number
}>()

const emit = defineEmits<{
  'cell-edit': [payload: { rowId: string; field: string; value: unknown; oldValue: unknown; mode: string; source: string }]
  'query-change': [payload: { filters: FilterClause[]; sort: SortParam | null; pagination: { page: number; pageSize: number } }]
  'open-quick-create': [payload: { field: string; targetModuleId: string }]
  'formula-detail-open': [payload: { field: string; rowId?: string }]
  'cell-click': [payload: { field: string; rowId: string | null }]
  'row-action': [payload: { rowId: string; field: string; actionId: string }]
  'open-relation-editor': [payload: { field: string; fieldSchema: FieldSchema; recordId: string; moduleId: string }]
  'action-trigger': [payload: { action: ListAction; context?: Record<string, unknown> }]
}>()

const filterSummaryItems = computed(() => {
  const activeFilters = filters.value
  const fieldMap = new Map(props.schema.fields.map(f => [f.key, f]))
  return activeFilters.map(clause => {
    const field = fieldMap.get(clause.field)
    const label = field?.label ?? clause.field
    const operator = clause.operator
    const operatorLabel = getOperatorLabel(operator)
    let valueLabel = String(clause.value ?? clause.values ?? '')
    if (operator === 'isNull') valueLabel = '空'
    else if (operator === 'isNotNull') valueLabel = '非空'
    return { fieldKey: clause.field, label, operator, operatorLabel, valueLabel }
  })
})

const hasActiveFilters = computed(() => filterSummaryItems.value.length > 0)

const sortFieldLabel = computed(() => {
  if (!currentSort.value) return ''
  const field = props.schema.fields.find(f => f.key === currentSort.value!.field)
  return field?.label ?? currentSort.value!.field
})

const listActions = computed<ListAction[]>(() => {
  return props.schema.listActions ?? []
})

const recordStore = useRecords()
const schemaMeta = useSchemaMeta()
const uiState = useUi()
const permission = usePermission(schemaMeta)
const aggregation = useAggregation()
const { isMounted } = useMounted()
const loadingModuleId = inject<Ref<string | null>>('loadingModuleId', ref(null))

// 标准数据操作（删除/批量删除）：配置 × 权限，由引擎内置交互
const deleteOps = computed(() => permission.deleteOperations.value)
const canExport = computed(() => permission.canExport.value)

// 存在批量删除或需要勾选行上下文的列表动作（如 custom 批量操作）时，渲染行首复选框列
const showSelection = computed<boolean>(() => {
  return deleteOps.value.canBatchDelete || listActions.value.some((a) => a.type === 'custom')
})

const filters = ref<FilterClause[]>([])

watch(() => props.externalFilters, (newFilters) => {
  if (newFilters !== null && newFilters !== undefined) {
    filters.value = newFilters
    currentPage.value = 1
  }
}, { immediate: true })
const currentSort = ref<SortParam | null>(null)
const currentPage = ref(1)
const pageSize = ref(20)

const aggregationSummary = computed<AggregationItem[]>(() => {
  return aggregation.compute(recordStore.records)
})

const totalCount = computed(() => aggregationSummary.value[0]?.totalCount ?? 0)

const isSelectThenEditMode = computed(() => {
  return props.schema.listEditMode === 'select-then-edit'
})

const selectedRowId = computed(() => {
  return uiState.selectedRowIds[0] ?? null
})

const tableEditable = computed(() => {
  return !isSelectThenEditMode.value
})

async function fetchData(): Promise<void> {
  recordStore.setLoading(true)
  const queryModuleId = props.schema.id
  try {
    const res = await recordService.list({
      moduleId: props.schema.id,
      filters: filters.value,
      sort: currentSort.value || undefined,
      page: currentPage.value,
      pageSize: pageSize.value,
    })
    if (queryModuleId !== loadingModuleId.value) return
    if (!isMounted.value) return

    if (res.success) {
      recordStore.setRecords(res.data.records, res.data.total)
      recordStore.setPagination({ page: res.data.page, pageSize: res.data.pageSize, total: res.data.total })
    } else {
      uiState.showMessage(res.message || '查询失败', 'error')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败'
    uiState.showMessage(message, 'error')
  } finally {
    recordStore.setLoading(false)
  }
}

watch([currentPage, pageSize, filters, currentSort], () => {
  fetchData()
}, { immediate: true })

function handleSearch(newFilters: FilterClause[]): void {
  filters.value = newFilters
  currentPage.value = 1
}

function handleSortChange(payload: { field: string; order: 'asc' | 'desc' | null }): void {
  if (payload.order) {
    currentSort.value = { field: payload.field, order: payload.order }
  } else {
    currentSort.value = null
  }
  currentPage.value = 1
}

function handleHeaderFilterChange(payload: { field: string; clause: FilterClause | null }): void {
  const next = filters.value.filter(c => c.field !== payload.field)
  if (payload.clause) next.push(payload.clause)
  handleSearch(next)
}

function handleClearSort(): void {
  currentSort.value = null
  currentPage.value = 1
}

function handleRemoveFilter(fieldKey: string): void {
  const next = filters.value.filter(c => c.field !== fieldKey)
  handleSearch(next)
}

function handleClearFilters(): void {
  handleSearch([])
}

function handleClearAll(): void {
  currentSort.value = null
  handleSearch([])
}

function handlePageChange(payload: { page: number; pageSize: number }): void {
  currentPage.value = payload.page
  pageSize.value = payload.pageSize
}

function handlePageSizeChange(payload: { pageSize: number }): void {
  currentPage.value = 1
  pageSize.value = payload.pageSize
}

function handleCellEdit(payload: { rowId: string; field: string; value: unknown; oldValue: unknown; mode: string; source: string }): void {
  emit('cell-edit', payload)
}

function handleOpenQuickCreate(payload: { field: string; targetModuleId: string }): void {
  emit('open-quick-create', payload)
}

function handleFormulaDetailOpen(payload: { field: string; rowId?: string }): void {
  emit('formula-detail-open', payload)
}

function handleRowAction(payload: { rowId: string; field: string; actionId: string }): void {
  // 标准删除操作：引擎统一二次确认后再上抛，宿主只负责执行
  if (payload.actionId === 'delete') {
    void confirmRowDelete(payload)
    return
  }
  emit('row-action', payload)
}

async function confirmRowDelete(payload: { rowId: string; field: string; actionId: string }): Promise<void> {
  const ops = deleteOps.value
  if (!ops.canDelete) return
  try {
    await ElMessageBox.confirm(ops.confirmMessage, ops.confirmTitle, {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  emit('row-action', payload)
}

async function handleBatchDeleteClick(): Promise<void> {
  const ops = deleteOps.value
  if (!ops.canBatchDelete) return
  const ids = uiState.selectedRowIds
  if (ids.length === 0) {
    uiState.showMessage(`请先勾选要${ops.batchLabel}的记录`, 'warning')
    return
  }
  try {
    await ElMessageBox.confirm(ops.batchConfirmMessage(ids.length), ops.batchConfirmTitle, {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  // 标准化批量删除事件契约：type:'delete' + selectedRowIds 上下文
  emit('action-trigger', {
    action: { id: 'batch-delete', type: 'delete', label: ops.batchLabel },
    context: { selectedRowIds: [...ids] },
  })
  uiState.setSelectedRows([])
}

function handleSelectionChange(rowIds: string[]): void {
  uiState.setSelectedRows(rowIds)
}

function handleOpenRelationEditor(payload: { field: string; fieldSchema: FieldSchema; recordId: string; moduleId: string }): void {
  emit('open-relation-editor', payload)
}

// ── CSV 导出：按当前筛选/排序拉取全量（服务端单页上限 200，安全封顶 5000 行）──
const EXPORT_PAGE_SIZE = 200
const EXPORT_MAX_ROWS = 5000
const exporting = ref(false)

/** 导出列 = schema 可见字段 ∩ 用户视图配置可见列，按视图配置排序优先 */
const exportColumns = computed<FieldSchema[]>(() => {
  const fields = props.schema.fields.filter(f => f.visible && f.type !== 'action')
  const vc = props.viewConfig ?? []
  if (vc.length === 0) return fields
  const cfgMap = new Map(vc.map(c => [c.field, c]))
  return fields
    .filter(f => cfgMap.get(f.key)?.visible !== false)
    .sort((a, b) => {
      const ia = cfgMap.get(a.key)?.order ?? a.order
      const ib = cfgMap.get(b.key)?.order ?? b.order
      return ia - ib
    })
})

/** 单元格文本化：外键取关联名标签；枚举取 options 标签；布尔取是/否；结构化值 JSON 化 */
function exportCellText(field: FieldSchema, row: Record<string, unknown>): string {
  const raw = row[`${field.key}_label`] ?? row[field.key]
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'boolean') return raw ? '是' : '否'
  if ((field.type === 'select' || field.type === 'status') && field.options?.length) {
    const opt = field.options.find(o => String(o.value) === String(raw))
    if (opt) return String(opt.label)
  }
  if (Array.isArray(raw) || typeof raw === 'object') return JSON.stringify(raw)
  return String(raw)
}

/** CSV 单元格转义：防公式注入（=+-@ 开头前置 '）与引号/换行 */
function csvEscape(text: string): string {
  let v = text
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`
  if (/[",\n\r]/.test(v)) v = `"${v.replace(/"/g, '""')}"`
  return v
}

function exportTimestamp(): string {
  const d = new Date()
  const p = (n: number): string => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function downloadCsv(rows: Array<Record<string, unknown>>): void {
  const cols = exportColumns.value
  const lines = [cols.map(c => csvEscape(c.label)).join(',')]
  for (const row of rows) {
    lines.push(cols.map(c => csvEscape(exportCellText(c, row))).join(','))
  }
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.schema.name}_${exportTimestamp()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

async function handleExportCsv(): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  try {
    const rows: Array<Record<string, unknown>> = []
    let total = Number.POSITIVE_INFINITY
    let page = 1
    while (rows.length < EXPORT_MAX_ROWS && (page - 1) * EXPORT_PAGE_SIZE < total) {
      const res = await recordService.list({
        moduleId: props.schema.id,
        filters: filters.value,
        sort: currentSort.value || undefined,
        page,
        pageSize: EXPORT_PAGE_SIZE,
      })
      if (!res.success) {
        uiState.showMessage(res.message || '导出失败', 'error')
        return
      }
      total = res.data.total
      rows.push(...(res.data.records as unknown as Array<Record<string, unknown>>))
      if (res.data.records.length === 0) break
      page += 1
    }
    if (rows.length === 0) {
      uiState.showMessage('当前筛选下没有可导出的数据', 'warning')
      return
    }
    downloadCsv(rows)
    uiState.showMessage(`已导出 ${rows.length} 行 CSV`, 'success')
  } catch (err) {
    uiState.showMessage(err instanceof Error ? err.message : '导出失败', 'error')
  } finally {
    exporting.value = false
  }
}

function handleRowClick(payload: { rowId: string }): void {
  // 存在复选框时，行点击仅切换当前记录用于详情，不覆盖多选；否则保留原「单击选中单行」行为
  if (!showSelection.value) {
    uiState.setSelectedRows([payload.rowId])
  }
  const record = recordStore.getRecordById(payload.rowId)
  if (record) {
    recordStore.setCurrentRecord(record)
  }
}

function handleListAction(payload: { action: ListAction; context?: Record<string, unknown> }): void {
  // 自定义列表动作上抛给 SchemaEngine -> 宿主
  emit('action-trigger', payload)
  emit('query-change', {
    filters: filters.value,
    sort: currentSort.value,
    pagination: { page: currentPage.value, pageSize: pageSize.value },
  })
}

const bottomTabsRef = ref<InstanceType<typeof BottomTabs> | null>(null)

const bottomTabsField = computed(() => {
  return props.schema.fields.find(f => f.filterable && f.type === 'select' && (f.options ?? []).length > 0) ?? null
})

const filterTabs = computed<FilterTab[]>(() => {
  const field = bottomTabsField.value
  if (!field) return []
  const options = field.options ?? []

  const tabs: FilterTab[] = [
    { id: '__all__', label: '全部' },
  ]

  for (const opt of options) {
    tabs.push({
      id: `f:${field.key}:${String(opt.value)}`,
      label: opt.label,
      filter: { field: field.key, operator: 'eq', value: opt.value },
    })
  }
  return tabs
})

const activeTabId = computed(() => {
  const statusFilter = filters.value.find(f => f.field === bottomTabsField.value?.key && f.operator === 'eq')
  if (statusFilter && statusFilter.value !== undefined) {
    return `f:${statusFilter.field}:${String(statusFilter.value)}`
  }
  return '__all__'
})

function handleBottomTabChange(tabId: string): void {
  if (tabId === '__all__') {
    const field = bottomTabsField.value
    if (!field) return
    const newFilters = filters.value.filter(f => f.field !== field.key)
    handleSearch(newFilters)
    return
  }
  const tab = filterTabs.value.find(t => t.id === tabId)
  if (tab?.filter) {
    const field = bottomTabsField.value
    if (!field) return
    const newFilters = filters.value.filter(f => f.field !== field.key)
    newFilters.push(tab.filter)
    handleSearch(newFilters)
  }
}
</script>

<template>
  <div class="list-view">
    <div v-if="listActions.length > 0 || deleteOps.canBatchDelete || canExport" class="list-toolbar">
      <div v-if="listActions.length > 0" class="list-toolbar__left">
        <ListActionBar :actions="listActions" :active-filters="filters"
          :selected-row-ids="uiState.selectedRowIds" @action-trigger="handleListAction" />
      </div>
      <div v-if="canExport || deleteOps.canBatchDelete" class="list-toolbar__right">
        <ElButton size="small" plain :loading="exporting" @click="handleExportCsv">
          导出CSV
        </ElButton>
        <ElButton v-if="deleteOps.canBatchDelete" size="small" type="danger" plain
          :disabled="uiState.selectedRowIds.length === 0" @click="handleBatchDeleteClick">
          {{ deleteOps.batchLabel }}{{ uiState.selectedRowIds.length > 0 ? ` (${uiState.selectedRowIds.length})` : '' }}
        </ElButton>
      </div>
    </div>

    <div v-if="currentSort || hasActiveFilters" class="list-view-status-bar">
      <div v-if="currentSort" class="status-segment">
        <span class="status-label">排序：</span>
        <ElTag size="small" closable :type="currentSort.order === 'asc' ? 'success' : 'danger'"
          @close="handleClearSort">
          <span class="sort-icon" :class="currentSort.order === 'asc' ? 'sort-icon--asc' : 'sort-icon--desc'">
            {{ currentSort.order === 'asc' ? '↑' : '↓' }}
          </span>
          {{ sortFieldLabel }}
        </ElTag>
      </div>
      <div v-if="hasActiveFilters" class="status-segment">
        <span class="status-label">筛选：</span>
        <ElTag v-for="item in filterSummaryItems" :key="item.fieldKey" size="small" closable
          :type="item.operator === 'isNull' || item.operator === 'notIn' || item.operator === 'neq' || item.operator === 'notLike' || item.operator === 'notBetween' || item.operator === 'isNotNull' ? 'danger' : 'info'"
          @close="handleRemoveFilter(item.fieldKey)">
          <span class="tag-label">{{ item.label }}</span>
          <span class="tag-operator">{{ item.operatorLabel }}</span>
          <span class="tag-value">{{ item.valueLabel }}</span>
        </ElTag>
      </div>
      <div class="status-actions">
        <ElButton v-if="currentSort" size="small" text @click="handleClearSort">清除排序</ElButton>
        <ElButton v-if="hasActiveFilters" size="small" text @click="handleClearFilters">清除筛选</ElButton>
        <ElButton v-if="currentSort || hasActiveFilters" size="small" text type="danger" @click="handleClearAll">清除全部
        </ElButton>
      </div>
    </div>

    <SchemaTable :schema="schema" :rows="recordStore.records" :view-config="viewConfig || []" :sort-state="currentSort"
      :filter-clauses="filters" :editable="tableEditable" :selected-row-id="selectedRowId"
      :show-selection="showSelection" :loading="recordStore.isLoading" :height="tableHeight" @sort-change="handleSortChange"
      @filter-change="handleHeaderFilterChange" @row-click="handleRowClick" @cell-edit="handleCellEdit"
      @cell-click="(p: { field: string; rowId: string | null }) => emit('cell-click', p)"
      @open-quick-create="handleOpenQuickCreate" @formula-detail-open="handleFormulaDetailOpen"
      @row-action="handleRowAction" @open-relation-editor="handleOpenRelationEditor"
      @selection-change="handleSelectionChange" />

    <div v-if="aggregationSummary.length > 0" class="aggregation-bar">
      <div class="aggregation-item">
        <span class="agg-label">总行数</span>
        <span class="agg-number">{{ totalCount }}</span>
      </div>
      <div class="aggregation-divider"></div>
      <div class="aggregation-item" v-for="item in aggregationSummary" :key="item.fieldKey">
        <span class="agg-label">{{ item.label }}：</span>
        <span v-if="item.type === 'sum'" class="agg-type">合计</span>
        <span v-else-if="item.type === 'average'" class="agg-type">平均</span>
        <span v-else-if="item.type === 'count'" class="agg-type">计数</span>
        <span v-else-if="item.type === 'max'" class="agg-type">最大</span>
        <span v-else-if="item.type === 'min'" class="agg-type">最小</span>
        <span class="agg-number">
          {{ item.type === 'count' ? item.count : item.value.toLocaleString('zh-CN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2 }) }}
        </span>
      </div>
    </div>

    <div class="list-footer">
      <BottomTabs ref="bottomTabsRef" v-if="bottomTabsField && filterTabs.length > 1" :tabs="filterTabs"
        :active-tab-id="activeTabId" :show-count="true" @change="handleBottomTabChange" />
      <span v-if="bottomTabsField && filterTabs.length > 1" class="footer-divider" />
      <SchemaPagination :page="recordStore.queryState.pagination.page"
        :page-size="recordStore.queryState.pagination.pageSize" :total="recordStore.totalRecords"
        :loading="recordStore.isLoading" @page-change="handlePageChange" @page-size-change="handlePageSizeChange" />
    </div>
  </div>
</template>

<style scoped>
.list-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.list-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sg-spacing-2);
  padding: var(--sg-spacing-2) var(--sg-spacing-8);
  border-bottom: 1px solid var(--sg-border-color-light);
  background: var(--sg-fill-color-lighter);
  min-height: 36px;
}

.list-toolbar__left,
.list-toolbar__right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sg-spacing-2);
  min-width: 0;
}

.list-toolbar__right {
  margin-left: auto;
}

:deep(.schema-filter-bar) {
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
}

:deep(.list-action-bar) {
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
  min-height: unset !important;
}

.list-view-status-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sg-spacing-2);
  padding: var(--sg-spacing-2) var(--sg-spacing-8);
  border-bottom: 1px solid var(--sg-border-color-light);
  background: var(--sg-fill-color-lighter);
  min-height: 28px;
}

.status-segment {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
}

.status-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
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

.status-label {
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-secondary);
  white-space: nowrap;
}

.tag-label {
  font-weight: 600;
  margin-right: var(--sg-spacing-1);
}

.tag-operator {
  margin-right: var(--sg-spacing-1);
  color: var(--sg-text-color-secondary);
}

.tag-value {
  color: var(--sg-text-color-primary);
}

.aggregation-bar {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-12);
  padding: var(--sg-spacing-4) var(--sg-spacing-8);
  border-top: 1px solid var(--sg-border-color-light);
  background: var(--sg-fill-color-lighter);
  font-size: var(--sg-font-size-base);
}

.aggregation-item {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
}

.agg-label {
  color: var(--sg-text-color-secondary);
  font-weight: 500;
}

.agg-type {
  color: var(--sg-color-primary);
  font-weight: 600;
  margin-right: var(--sg-spacing-1);
}

.agg-number {
  color: var(--sg-text-color-primary);
  font-weight: 700;
  font-family: 'Courier New', monospace;
}

.aggregation-divider {
  width: 1px;
  height: 16px;
  background: var(--sg-border-color);
  flex-shrink: 0;
}

.list-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  border-top: 1px solid var(--sg-border-color-light);
  background: var(--sg-fill-color-lighter);
  flex-shrink: 0;
}

.list-footer :deep(.bottom-tabs) {
  flex: 1;
  min-width: 0;
  border-top: none;
}

.list-footer :deep(.schema-pagination) {
  flex-shrink: 0;
  border-top: none;
  padding: var(--sg-spacing-2) var(--sg-spacing-8);
}

.footer-divider {
  flex-shrink: 0;
  width: 1px;
  height: 16px;
  background: var(--sg-border-color);
}
</style>
