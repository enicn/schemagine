<script setup lang="ts">
import { ref, computed, watch, inject, type Ref } from 'vue'
import { CircleClose, Delete, Download, EditPen, RefreshLeft, RefreshRight } from '@element-plus/icons-vue'
import { ElTag, ElButton, ElMessageBox, ElDialog, ElSelect, ElOption } from 'element-plus'
import SchemaTable from '@/components/table/SchemaTable.vue'
import SchemaPagination from '@/components/table/SchemaPagination.vue'
import FieldEditorFactory from '@/components/field/FieldEditorFactory.vue'
import SchemaFilterBar from '@/components/filter/SchemaFilterBar.vue'
import MobileCardList from '@/engine/containers/MobileCardList.vue'
import { builtinEditorForType } from '@/components/field/editorMap'
import { getFieldTypeDefinition } from '@/engine/registry/fieldTypeRegistry'
import { validateFieldValue } from '@/utils/fieldValidation'
import { executeBatchPatch, survivingChanges } from '@/utils/batchPatch'
import { buildFilterSummaryItems, type FilterSummaryItem } from '@/utils/filterSummary'
import { buildExportMatrix, downloadCsvFile, downloadXlsxFile } from '@/utils/tableExport'
import { flattenFilterConditions, removeFieldFromConditions, cloneFilterConditions, isFilterGroup } from '@/utils/filterConditions'
import BottomTabs from '@/components/filter/BottomTabs.vue'
import type { FilterTab } from '@/components/filter/BottomTabs.vue'
import ListActionBar from '@/engine/actions/ListActionBar.vue'
import type { FieldSchema } from '@/types'
import { useAggregation } from '@/composables/useAggregation'
import { resolveFkLabelForSummary } from '@/composables/useFkLabelCache'
import { usePermission } from '@/composables/usePermission'
import { useViewportMode } from '@/composables/useViewportMode'
import { recordService } from '@/services/api/recordService'
import { candidateService } from '@/services/api/candidateService'
import { useMounted } from '@/composables/useMounted'
import { useRecords, useSchemaMeta, useUi } from '@/composables/instanceState'
import { useRecordHistory } from '@/composables/useRecordHistory'
import type { ModuleSchema, ColumnConfig, SortParam, QueryState, FilterClause, FilterCondition, FilterPreset, ListAction, ActionTriggerEvent, RowActionEvent, EngineAppearance } from '@/types'
import type { AggregationItem } from '@/composables/useAggregation'

const props = defineProps<{
  schema: ModuleSchema
  viewConfig: ColumnConfig[] | null
  initialQueryState?: Partial<QueryState>
  infiniteScroll?: boolean
  externalFilters?: FilterClause[] | null
  /** 透传给 SchemaTable 的表格高度（vxe height），不传保持自然高度 */
  tableHeight?: string | number
  /** 密度档位（docs/19 F1）：透传 SchemaTable → VxeTableWrapper */
  density?: 'compact' | 'default' | 'large'
  /** 引擎只读形态（SchemaEngine 透传 SchemaTable）：隐藏内置行级编辑入口 */
  readonly?: boolean
  /** 工具栏收敛档位（SchemaEngine 透传）：'conservative' 隐藏撤销/重做/命名视图/批量编辑/导出等高级入口 */
  toolbarMode?: 'full' | 'conservative'
  /** 外观与格式契约（docs/20）：透传 SchemaTable → VxeTableWrapper；exportInConservative 控制保守工具栏导出入口 */
  appearance?: EngineAppearance
}>()

const emit = defineEmits<{
  'cell-edit': [payload: { rowId: string; field: string; value: unknown; oldValue: unknown; mode: string; source: string }]
  'query-change': [payload: { filters: FilterCondition[]; sort: SortParam | null; pagination: { page: number; pageSize: number } }]
  'open-quick-create': [payload: { field: string; targetModuleId: string }]
  'formula-detail-open': [payload: { field: string; rowId?: string }]
  'cell-click': [payload: { field: string; rowId: string | null }]
  'edit-activated': [payload: { rowId: string; field: string }]
  'edit-closed': [payload: { rowId: string; field: string; value: unknown }]
  'row-action': [payload: { rowId: string; field: string; actionId: string }]
  /** 内置行级编辑（select-then-edit）：请求以卡片视图编辑态打开该行，由 SchemaEngine 本地处理 */
  'row-edit': [payload: { rowId: string }]
  'open-relation-editor': [payload: { field: string; fieldSchema: FieldSchema; recordId: string; moduleId: string }]
  'action-trigger': [payload: ActionTriggerEvent]
  /** 保存视图变更(FilterPreset 增删/设默认),由 SchemaEngine 持久化到 UserViewConfig(docs/19 批次 E3) */
  'presets-change': [presets: FilterPreset[]]
  /** 拖拽调宽结束(docs/20):上抛 SchemaEngine 持久化进 UserViewConfig */
  'column-width-change': [payload: { field: string; width: number }]
  /** 列拖拽后的新列序(字段 key 列表),由 SchemaEngine 合并进 UserViewConfig.columns(docs/19 批次 E4) */
  'column-order-change': [newOrder: string[]]
  /** 批量字段更新上抛(docs/19 H4 宿主执行契约):schema.operations.batchPatch.enabled 时由批量编辑对话框触发,宿主原子执行后 refresh */
  'batch-patch': [payload: { moduleId: string; ids: string[]; patch: Record<string, unknown> }]
}>()

// 摘要与 SchemaFilterBar 同一格式化口径(docs/19 批次 E;含组合过滤组拍平)。
// FK 值走全局共享标签缓存(useFkLabelCache):命中出人读标签,未命中后台解析后响应式回填。
const filterSummaryItems = computed<FilterSummaryItem[]>(() => {
  return buildFilterSummaryItems(flattenFilterConditions(filters.value), props.schema.fields, resolveFkLabelForSummary)
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
const history = useRecordHistory(recordStore, uiState)
const { isMounted } = useMounted()
const { isMobile } = useViewportMode()
const loadingModuleId = inject<Ref<string | null>>('loadingModuleId', ref(null))

// 标准数据操作（删除/批量删除）：配置 × 权限，由引擎内置交互
const deleteOps = computed(() => permission.deleteOperations.value)
const canExport = computed(() => permission.canExport.value)
const canEditRecords = computed(() => permission.canEdit.value)

// 存在批量删除/批量编辑或需要勾选行上下文的列表动作（如 custom 批量操作）时，渲染行首复选框列
const showSelection = computed<boolean>(() => {
  return deleteOps.value.canBatchDelete
    || canEditRecords.value
    || listActions.value.some((a) => a.type === 'custom')
})

// --- 批量编辑（docs/19 批次 D2）：选中行 → 单字段填充 → patchField 循环提交 ---
const NON_BATCH_EDITABLE_TYPES = new Set([
  'formula', 'one-to-many', 'many-to-many', 'reverse-ref', 'action',
  'json', 'image', 'attachment', 'mediaImage',
])

const batchEditableFields = computed<FieldSchema[]>(() => {
  return props.schema.fields
    .filter((f) => {
      if (!f.visible) return false
      if (f.readonly || f.editMode === 'limited') return false
      if (!permission.isFieldEditable(f.key)) return false
      if (NON_BATCH_EDITABLE_TYPES.has(f.type)) return false
      return builtinEditorForType(f.type) !== undefined || !!getFieldTypeDefinition(f.type)?.editor
    })
    .sort((a, b) => a.order - b.order)
})

const batchEditVisible = ref(false)
const batchEditFieldKey = ref('')
const batchEditValue = ref<unknown>(undefined)
const batchEditRunning = ref(false)

const batchEditSelectedField = computed<FieldSchema | null>(() => {
  return batchEditableFields.value.find(f => f.key === batchEditFieldKey.value) ?? null
})

function handleBatchEditClick(): void {
  if (uiState.selectedRowIds.length === 0) return
  if (batchEditableFields.value.length === 0) {
    uiState.showMessage('当前模块没有可批量编辑的字段', 'warning')
    return
  }
  batchEditFieldKey.value = batchEditableFields.value[0]!.key
  batchEditValue.value = undefined
  batchEditVisible.value = true
}

// ── 撤销/重做（docs/19 H3）：引擎级 history，工具栏按钮回放本地历史 ──
function handleUndo(): void {
  history.undo()
}

function handleRedo(): void {
  history.redo()
}

async function handleBatchEditConfirm(): Promise<void> {
  const field = batchEditSelectedField.value
  if (!field || batchEditRunning.value) return

  const value = batchEditValue.value === undefined ? null : batchEditValue.value
  const validation = validateFieldValue(field, value)
  if (!validation.valid) {
    uiState.showMessage(`「${field.label}」${validation.errors[0] ?? '校验未通过'}`, 'warning')
    return
  }

  // docs/19 H4:宿主执行契约(schema.operations.batchPatch.enabled)→ 引擎只收集与校验,
  // emit batch-patch 由宿主原子执行(失败由宿主整体回滚),完成后宿主 refresh()。
  // 此路径不做本地乐观更新、不入撤销栈(数据真源在宿主侧)。
  if (deleteOps.value.batchPatchDelegated) {
    emit('batch-patch', {
      moduleId: props.schema.id,
      ids: [...uiState.selectedRowIds],
      patch: { [field.key]: value },
    })
    batchEditVisible.value = false
    return
  }

  batchEditRunning.value = true
  try {
    // 缺省路径:引擎本地逐条提交(docs/19 H4 批量事务语义)——存在失败时对已成功行
    // 补偿回写,尽量达成整体生效或整体不生效;提示按"整体"口径而非部分成功。
    const outcome = await executeBatchPatch({
      ids: uiState.selectedRowIds,
      field: field.key,
      value,
      getRecord: (id) => {
        const record = recordStore.getRecordById(id)
        return record ? { fields: record.fields, version: record.version } : undefined
      },
      patchField: params => recordService.patchField({ moduleId: props.schema.id, ...params }),
    })

    // 按结果集应用本地状态并汇入撤销栈(仅仍生效的行)
    for (const row of outcome.succeeded) {
      const stillApplied = !outcome.rolledBack || outcome.revertFailed.includes(row.recordId)
      if (!stillApplied) continue
      recordStore.updateRecordField(row.recordId, field.key, value, row.newVersion)
    }
    history.pushBatchEdit(survivingChanges(field.key, value, outcome))

    const notLoadedNote = outcome.notLoaded > 0 ? `，${outcome.notLoaded} 条不在当前页已跳过` : ''
    if (!outcome.rolledBack) {
      uiState.showMessage(
        `已更新 ${outcome.succeeded.length} 条${outcome.skipped > 0 ? `（跳过 ${outcome.skipped} 条未变化）` : ''}${notLoadedNote}`,
        'success',
      )
    } else if (outcome.revertFailed.length === 0) {
      uiState.showMessage(
        `批量更新失败：${outcome.failed.length} 条提交失败（可能存在版本冲突），已整体回滚，数据未变更${notLoadedNote}`,
        'warning',
      )
    } else {
      uiState.showMessage(
        `批量更新失败：已回滚 ${outcome.reverted.length} 条，${outcome.revertFailed.length} 条回滚失败仍为新值，请刷新核对${notLoadedNote}`,
        'warning',
      )
    }
    batchEditVisible.value = false
  } finally {
    batchEditRunning.value = false
  }
}

// ── 查询状态:pageSize/defaultSort 从 UserViewConfig 恢复(保存侧见 query-change 上抛,docs/19 批次 E5)──
const filters = ref<FilterCondition[]>([])

watch(() => props.externalFilters, (newFilters) => {
  if (newFilters !== null && newFilters !== undefined) {
    filters.value = newFilters
    currentPage.value = 1
  }
}, { immediate: true })

const currentSort = ref<SortParam | null>(schemaMeta.viewConfig?.defaultSort ? { ...schemaMeta.viewConfig.defaultSort } : null)
const currentPage = ref(1)
// 移动端固定默认 20（触底加载逐页追加，§3.5）；桌面沿用用户视图配置
const pageSize = ref(isMobile.value ? 20 : (schemaMeta.viewConfig?.pageSize ?? 20))
// 顶部搜索关键词（移动端 §3.6）：走 list 通道 keyword 参数（后端 searchFields 跨字段 OR）
const searchKeyword = ref('')

// ── 保存视图(docs/19 批次 E3):FilterPreset 命名保存当前过滤+排序,经 SchemaEngine 持久化 ──
const presets = computed<FilterPreset[]>(() => schemaMeta.viewConfig?.filterPresets ?? [])
const activePresetId = ref('')
const activePreset = computed<FilterPreset | null>(() => presets.value.find(p => p.id === activePresetId.value) ?? null)
const hasFilterableFields = computed(() => props.schema.fields.some(f => f.filterable))
const showFilterControls = computed(() => hasFilterableFields.value || presets.value.length > 0)
// 保守工具栏（toolbarMode='conservative'）：只留筛选/业务动作/批量删除，命名视图与高级操作整体隐藏
const conservativeToolbar = computed(() => props.toolbarMode === 'conservative')
const showPresetControls = computed(() => showFilterControls.value && !conservativeToolbar.value)
const showToolbarLeft = computed(() =>
  listActions.value.length > 0
  || (conservativeToolbar.value ? hasFilterableFields.value : showFilterControls.value),
)
const showToolbarRight = computed(() =>
  conservativeToolbar.value
    ? showExportCsv.value || showExportExcel.value || deleteOps.value.canBatchDelete || showSelection.value
    : canExport.value || deleteOps.value.canBatchDelete || (canEditRecords.value && batchEditableFields.value.length > 0) || showSelection.value,
)
// 导出入口（docs/20）：full 模式保持历史行为；conservative 模式默认隐藏，
// CSV 与 Excel 为两个独立开关，显式开启且 permissions.export 允许时才显示
const showExportCsv = computed(() =>
  !conservativeToolbar.value
  || (props.appearance?.exportCsvInConservative === true && canExport.value),
)
const showExportExcel = computed(() =>
  !conservativeToolbar.value
  || (props.appearance?.exportExcelInConservative === true && canExport.value),
)

function applyPreset(preset: FilterPreset): void {
  filters.value = cloneFilterConditions(preset.filters)
  currentSort.value = preset.sort ? { ...preset.sort } : null
  currentPage.value = 1
  activePresetId.value = preset.id
}

function handlePresetSelect(presetId: string): void {
  const preset = presets.value.find(p => p.id === presetId)
  if (preset) applyPreset(preset)
}

function handlePresetClear(): void {
  activePresetId.value = ''
}

/** 手动改动查询条件即视为离开视图上下文 */
function markManualQueryChange(): void {
  activePresetId.value = ''
}

async function handleSavePreset(): Promise<void> {
  const defaultName = `视图 ${presets.value.length + 1}`
  try {
    const { value } = await ElMessageBox.prompt('保存当前筛选与排序为命名视图', '保存为视图', {
      inputValue: defaultName,
      inputPattern: /\S/,
      inputErrorMessage: '请输入视图名称',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    })
    const preset: FilterPreset = {
      id: `preset-${Date.now().toString(36)}`,
      name: value.trim(),
      filters: cloneFilterConditions(filters.value),
      sort: currentSort.value ? { ...currentSort.value } : undefined,
    }
    emit('presets-change', [...presets.value, preset])
    activePresetId.value = preset.id
    uiState.showMessage(`已保存视图「${preset.name}」`, 'success')
  } catch {
    // 用户取消
  }
}

function handleToggleDefaultPreset(): void {
  const target = activePreset.value
  if (!target) return
  const nextIsDefault = !target.isDefault
  emit('presets-change', presets.value.map(p => ({ ...p, isDefault: p.id === target.id ? nextIsDefault : false })))
  uiState.showMessage(nextIsDefault ? `已将「${target.name}」设为默认视图` : '已取消默认视图', 'success')
}

async function handleDeletePreset(): Promise<void> {
  const target = activePreset.value
  if (!target) return
  try {
    await ElMessageBox.confirm(`确定删除视图「${target.name}」？`, '删除视图', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  emit('presets-change', presets.value.filter(p => p.id !== target.id))
  if (activePresetId.value === target.id) activePresetId.value = ''
}

// 默认视图自动应用(宿主外部筛选优先)
if (!props.externalFilters?.length) {
  const defaultPreset = presets.value.find(p => p.isDefault)
  if (defaultPreset) applyPreset(defaultPreset)
}

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
      keyword: searchKeyword.value.trim() || undefined,
      sort: currentSort.value || undefined,
      page: currentPage.value,
      pageSize: pageSize.value,
    })
    if (queryModuleId !== loadingModuleId.value) return
    if (!isMounted.value) return

    if (res.success) {
      recordStore.setRecords(res.data.records, res.data.total, res.data.hasMore)
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

watch([currentPage, pageSize, filters, currentSort, searchKeyword], () => {
  fetchData()
  // 查询状态上抛:SchemaEngine 据此把 pageSize/defaultSort 持久化到 UserViewConfig(仅真变化时写,docs/19 批次 E5)
  emit('query-change', {
    filters: filters.value,
    sort: currentSort.value,
    pagination: { page: currentPage.value, pageSize: pageSize.value },
  })
}, { immediate: true })

/** 表头筛选状态/列表动作等只消费叶子子句的场景使用拍平视图 */
const flatFilterClauses = computed<FilterClause[]>(() => flattenFilterConditions(filters.value))

function handleSearch(newFilters: FilterCondition[]): void {
  markManualQueryChange()
  filters.value = newFilters
  currentPage.value = 1
}

function handleSortChange(payload: { field: string; order: 'asc' | 'desc' | null }): void {
  markManualQueryChange()
  if (payload.order) {
    currentSort.value = { field: payload.field, order: payload.order }
  } else {
    currentSort.value = null
  }
  currentPage.value = 1
}

function handleHeaderFilterChange(payload: { field: string; clause: FilterClause | null }): void {
  // 表头筛选子句平铺在顶层(与组合过滤组整体 AND,docs/19 批次 E2)
  const next = filters.value.filter(c => isFilterGroup(c) || c.field !== payload.field)
  if (payload.clause) next.push(payload.clause)
  handleSearch(next)
}

function handleClearSort(): void {
  currentSort.value = null
  currentPage.value = 1
}

function handleRemoveFilter(fieldKey: string): void {
  // 组合过滤组(docs/19 批次 E2)内的子句同样按字段移除,组被清空时整组剔除
  handleSearch(removeFieldFromConditions(filters.value, fieldKey))
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

function handleRowAction(payload: RowActionEvent): void {
  // 内置行级编辑（select-then-edit 操作列「编辑」）：保留 actionId，本地转卡片编辑态，不上抛宿主
  if (payload.actionId === '__rowEdit__') {
    emit('row-edit', { rowId: payload.rowId })
    return
  }
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

// ── 跨页勾选(docs/19 批次 E6):vxe checkbox reserve 保留勾选,此处提供清空入口 ──
const schemaTableRef = ref<InstanceType<typeof SchemaTable> | null>(null)

function handleClearSelection(): void {
  const table = schemaTableRef.value?.getTableInstance()
  table?.clearCheckboxRow?.()
  uiState.setSelectedRows([])
}

// ── 列拖拽持久化(docs/19 批次 E4):新列序上抛 SchemaEngine 合并进 UserViewConfig ──
function handleColumnDragEnd(payload: { columns: unknown[]; newOrder: string[] }): void {
  emit('column-order-change', payload.newOrder)
}

function handleOpenRelationEditor(payload: { field: string; fieldSchema: FieldSchema; recordId: string; moduleId: string }): void {
  emit('open-relation-editor', payload)
}

// ── CSV 导出：按当前筛选/排序拉取全量（服务端单页上限 200，安全封顶 5000 行）──
const EXPORT_PAGE_SIZE = 200
const EXPORT_MAX_ROWS = 5000
const exporting = ref(false)

// ── 导出行预处理(2026-09-21 修复):后端返回 RecordEntity(fields 嵌套),导出矩阵按扁平行取值;
//    兼容两种数据源——嵌套则展开 fields,扁平(本地 mock)原样保留;fk 字段补人读标签 ──
function flattenExportRow(row: Record<string, unknown>): Record<string, unknown> {
  const fields = row.fields as Record<string, unknown> | undefined
  if (fields && typeof fields === 'object') {
    return { ...row, ...fields, id: row.id }
  }
  return row
}

async function enrichFkLabels(fields: FieldSchema[], rows: Array<Record<string, unknown>>): Promise<void> {
  const fkFields = fields.filter(f => f.type === 'fk' && f.targetModule)
  for (const f of fkFields) {
    const values = [...new Set(rows
      .map(r => r[f.key])
      .filter(v => v !== null && v !== undefined && v !== '')
      .map(String))]
    if (values.length === 0) continue
    try {
      // 拉全量候选后按值精确匹配(按 keyword 搜索会漏掉 label 不含值文本的候选)
      const res = await candidateService.query({ targetModule: f.targetModule as string, page: 1, pageSize: 1000 })
      if (!res.success) continue
      const byValue = new Map(res.data.options.map(o => [String(o.value), o.label]))
      for (const v of values) {
        const label = byValue.get(v)
        if (label !== undefined) {
          for (const r of rows) {
            if (String(r[f.key]) === String(v)) r[`${f.key}_label`] = label
          }
        }
      }
    } catch {
      // 标签解析失败保留原值
    }
  }
}

async function prepareExportRows(fields: FieldSchema[], records: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
  const rows = records.map(flattenExportRow)
  await enrichFkLabels(fields, rows)
  return rows
}

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
      rows.push(...(await prepareExportRows(exportColumns.value, res.data.records as unknown as Array<Record<string, unknown>>)))
      if (res.data.records.length === 0) break
      page += 1
    }
    if (rows.length === 0) {
      uiState.showMessage('当前筛选下没有可导出的数据', 'warning')
      return
    }
    downloadCsvFile(props.schema.name, buildExportMatrix(exportColumns.value, rows))
    uiState.showMessage(`已导出 ${rows.length} 行 CSV`, 'success')
  } catch (err) {
    uiState.showMessage(err instanceof Error ? err.message : '导出失败', 'error')
  } finally {
    exporting.value = false
  }
}

/** 导出 Excel（docs/19 批次 G4）：xlsx 为可选 peer 依赖，未安装回退 CSV 并提示 */
/** 导出列宽(docs/20):取界面列宽(用户列表设置/拖拽调整值,px),Excel wch ≈ px/7 */
function exportColumnWidths(fields: FieldSchema[]): Array<number | undefined> {
  const cfgMap = new Map((props.viewConfig ?? []).map(c => [c.field, c]))
  return fields.map(f => cfgMap.get(f.key)?.width ?? f.width)
}

async function handleExportExcel(): Promise<void> {
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
      rows.push(...(await prepareExportRows(exportColumns.value, res.data.records as unknown as Array<Record<string, unknown>>)))
      if (res.data.records.length === 0) break
      page += 1
    }
    if (rows.length === 0) {
      uiState.showMessage('当前筛选下没有可导出的数据', 'warning')
      return
    }
    const result = await downloadXlsxFile(props.schema.name, buildExportMatrix(exportColumns.value, rows), exportColumnWidths(exportColumns.value))
    if (result === 'missing-peer') {
      downloadCsvFile(props.schema.name, buildExportMatrix(exportColumns.value, rows))
      uiState.showMessage('未安装 xlsx 依赖，已回退导出 CSV', 'warning')
      return
    }
    uiState.showMessage(`已导出 ${rows.length} 行 Excel`, 'success')
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

function handleListAction(payload: ActionTriggerEvent): void {
  // 自定义列表动作上抛给 SchemaEngine -> 宿主(查询状态变化已由 watch 统一上抛)
  emit('action-trigger', payload)
}

const bottomTabsRef = ref<InstanceType<typeof BottomTabs> | null>(null)

const bottomTabsField = computed(() => {
  return props.schema.fields.find(f => f.filterable && f.type === 'select' && (f.options ?? []).length > 0) ?? null
})

const filterTabs = computed<FilterTab[]>(() => {
  const field = bottomTabsField.value
  if (!field) return []
  const options = field.options ?? []

  // 计数:全部 = 服务端 total;各选项 = 当前页记录统计(展示口径)
  const stats: Record<string, number> = {}
  for (const r of recordStore.records) {
    const v = r.fields[field.key]
    if (v !== undefined && v !== null) {
      const key = String(v)
      stats[key] = (stats[key] ?? 0) + 1
    }
  }

  const tabs: FilterTab[] = [
    { id: '__all__', label: '全部', count: recordStore.totalRecords },
  ]

  for (const opt of options) {
    tabs.push({
      id: `f:${field.key}:${String(opt.value)}`,
      label: opt.label,
      count: stats[String(opt.value)] ?? 0,
      filter: { field: field.key, operator: 'eq', value: opt.value },
    })
  }
  return tabs
})

const activeTabId = computed(() => {
  const fieldKey = bottomTabsField.value?.key
  const statusFilter = fieldKey
    ? flatFilterClauses.value.find(f => f.field === fieldKey && f.operator === 'eq')
    : undefined
  if (statusFilter && statusFilter.value !== undefined) {
    return `f:${statusFilter.field}:${String(statusFilter.value)}`
  }
  return '__all__'
})

function handleBottomTabChange(tabId: string): void {
  const field = bottomTabsField.value
  if (!field) return
  if (tabId === '__all__') {
    const newFilters = filters.value.filter(f => isFilterGroup(f) || f.field !== field.key)
    handleSearch(newFilters)
    return
  }
  const tab = filterTabs.value.find(t => t.id === tabId)
  if (tab?.filter) {
    const newFilters = filters.value.filter(f => isFilterGroup(f) || f.field !== field.key)
    newFilters.push(tab.filter)
    handleSearch(newFilters)
  }
}
</script>

<template>
  <div class="list-view" :class="{ 'is-mobile': isMobile }">
    <!-- 移动端形态（§3.2）：卡片列表 + 触底加载，工具栏/表格/分页等桌面形态整体不渲染 -->
    <MobileCardList
      v-if="isMobile"
      :schema="schema"
      :filters="filters"
      :sort="currentSort"
      :keyword="searchKeyword"
      :tabs="filterTabs"
      :active-tab-id="activeTabId"
      :list-actions="listActions"
      @update:keyword="searchKeyword = $event"
      @search="handleSearch"
      @remove-filter="handleRemoveFilter"
      @tab-change="handleBottomTabChange"
      @row-action="handleRowAction"
      @action-trigger="handleListAction"
    />

    <template v-else>
    <div v-if="showToolbarLeft || showToolbarRight"
      class="list-toolbar">
      <div v-if="showToolbarLeft" class="list-toolbar__left">
        <SchemaFilterBar v-if="hasFilterableFields" :fields="schema.fields" :model-value="filters"
          @update:model-value="handleSearch" @search="handleSearch" />
        <template v-if="showPresetControls">
          <ElSelect :model-value="activePresetId" placeholder="视图" size="small" clearable class="preset-select"
            @change="handlePresetSelect" @clear="handlePresetClear">
            <ElOption v-for="p in presets" :key="p.id" :value="p.id"
              :label="p.isDefault ? `★ ${p.name}` : p.name" />
          </ElSelect>
          <ElButton size="small" text @click="handleSavePreset">存为视图</ElButton>
          <ElButton v-if="activePreset" size="small" text @click="handleToggleDefaultPreset">
            {{ activePreset.isDefault ? '取消默认' : '设为默认' }}
          </ElButton>
          <ElButton v-if="activePreset" size="small" text type="danger" @click="handleDeletePreset">删除视图</ElButton>
          <span v-if="activePreset" class="preset-hint">当前视图：{{ activePreset.name }}</span>
        </template>
        <ListActionBar v-if="listActions.length > 0" :actions="listActions" :active-filters="flatFilterClauses"
          :selected-row-ids="uiState.selectedRowIds" @action-trigger="handleListAction" />
      </div>
      <div v-if="showToolbarRight" class="list-toolbar__right">
        <ElButton v-if="showSelection && uiState.selectedRowIds.length > 0" size="small" text
          :icon="CircleClose" @click="handleClearSelection">
          清空选择
        </ElButton>
        <ElButton v-if="!conservativeToolbar && canEditRecords" size="small" plain :icon="RefreshLeft" :disabled="!recordStore.canUndo" @click="handleUndo">
          撤销
        </ElButton>
        <ElButton v-if="!conservativeToolbar && canEditRecords" size="small" plain :icon="RefreshRight" :disabled="!recordStore.canRedo" @click="handleRedo">
          重做
        </ElButton>
        <ElButton v-if="!conservativeToolbar && canEditRecords && batchEditableFields.length > 0" size="small" plain
          :icon="EditPen" :disabled="uiState.selectedRowIds.length === 0" @click="handleBatchEditClick">
          批量编辑{{ uiState.selectedRowIds.length > 0 ? ` (${uiState.selectedRowIds.length})` : '' }}
        </ElButton>
        <ElButton v-if="showExportCsv" size="small" plain :icon="Download" :loading="exporting" @click="handleExportCsv">
          导出CSV
        </ElButton>
        <ElButton v-if="showExportExcel" size="small" plain :icon="Download" :loading="exporting" @click="handleExportExcel">
          导出Excel
        </ElButton>
        <ElButton v-if="deleteOps.canBatchDelete" size="small" type="danger" plain
          :icon="Delete" :disabled="uiState.selectedRowIds.length === 0" @click="handleBatchDeleteClick">
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

    <SchemaTable ref="schemaTableRef" :schema="schema" :rows="recordStore.records" :view-config="viewConfig || []"
      :sort-state="currentSort" :filter-clauses="flatFilterClauses" :editable="tableEditable"
      :selected-row-id="selectedRowId" :show-selection="showSelection" :loading="recordStore.isLoading"
      :height="tableHeight" :density="density" :appearance="appearance" :readonly="readonly" @sort-change="handleSortChange" @filter-change="handleHeaderFilterChange"
      @row-click="handleRowClick" @cell-edit="handleCellEdit"
      @column-width-change="(p: { field: string; width: number }) => emit('column-width-change', p)"
      @column-drag-end="handleColumnDragEnd"
      @cell-click="(p: { field: string; rowId: string | null }) => emit('cell-click', p)"
      @edit-activated="(p: { rowId: string; field: string }) => emit('edit-activated', p)"
      @edit-closed="(p: { rowId: string; field: string; value: unknown }) => emit('edit-closed', p)"
      @open-quick-create="handleOpenQuickCreate" @formula-detail-open="handleFormulaDetailOpen"
      @row-action="handleRowAction" @row-edit="(p: { rowId: string }) => emit('row-edit', p)"
      @open-relation-editor="handleOpenRelationEditor"
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

    <!-- 批量编辑对话框（docs/19 批次 D2）：选中行单字段填充 -->
    <ElDialog v-model="batchEditVisible" title="批量编辑" width="480px" :close-on-click-modal="false" append-to-body>
      <div class="batch-edit-body">
        <div class="batch-edit-row">
          <span class="batch-edit-label">字段</span>
          <ElSelect v-model="batchEditFieldKey" size="small" filterable class="batch-edit-field-select">
            <ElOption v-for="f in batchEditableFields" :key="f.key" :label="f.label" :value="f.key" />
          </ElSelect>
        </div>
        <div class="batch-edit-row">
          <span class="batch-edit-label">填充值</span>
          <div class="batch-edit-editor">
            <FieldEditorFactory
              v-if="batchEditSelectedField"
              :field-schema="batchEditSelectedField"
              :model-value="batchEditValue"
              @update:model-value="(v: unknown) => batchEditValue = v"
            />
            <span v-else class="batch-edit-empty">无可编辑字段</span>
          </div>
        </div>
        <p class="batch-edit-hint">将对选中的 {{ uiState.selectedRowIds.length }} 条记录应用此值;校验规则与单条编辑一致。</p>
      </div>
      <template #footer>
        <ElButton size="small" @click="batchEditVisible = false">取消</ElButton>
        <ElButton size="small" type="primary" :loading="batchEditRunning" :disabled="!batchEditSelectedField"
          @click="handleBatchEditConfirm">
          应用
        </ElButton>
      </template>
    </ElDialog>
    </template>
  </div>
</template>

<style scoped>
.list-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 移动形态：列表回归文档流自然高度，滚动归属宿主提供的滚动容器（§3.2） */
.list-view.is-mobile {
  height: auto;
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

.preset-select {
  width: 132px;
}

.preset-hint {
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
  white-space: nowrap;
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

.batch-edit-body {
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-4);
}
.batch-edit-row {
  display: flex;
  align-items: flex-start;
  gap: var(--sg-spacing-4);
}
.batch-edit-label {
  flex-shrink: 0;
  width: 56px;
  padding-top: 4px;
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
}
.batch-edit-field-select {
  width: 100%;
}
.batch-edit-editor {
  flex: 1;
  min-width: 0;
}
.batch-edit-empty {
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
}
.batch-edit-hint {
  margin: 0;
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
}
</style>
