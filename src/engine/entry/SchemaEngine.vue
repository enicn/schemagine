<script setup lang="ts">
import { onMounted, watch, computed, ref, provide, nextTick } from 'vue'
import { ElButton, ElTag, ElTooltip, ElMessage } from 'element-plus'
import type { ViewMode } from '@/constants'
import { setLocale } from '@/locales'
import { useSchema } from '@/composables/useSchema'
import { usePermission } from '@/composables/usePermission'
import { useCellEdit } from '@/composables/useCellEdit'
import { useFormula } from '@/composables/useFormula'
import { createSchemaMetaState, createRecordState, createUiState, createRuntimeContextState, SCHEMA_META_KEY, RECORD_STATE_KEY, UI_STATE_KEY, RUNTIME_CONTEXT_KEY } from '@/composables/instanceState'
import { recordService } from '@/services/api/recordService'
import ErrorBoundary from '@/engine/providers/ErrorBoundary.vue'
import SchemaContextProvider from '@/engine/providers/SchemaContextProvider.vue'
import ViewContainer from '@/engine/containers/ViewContainer.vue'
import GlobalDialogHost from '@/engine/dialogs/GlobalDialogHost.vue'
import ListView from '@/engine/containers/ListView.vue'
import CardView from '@/engine/containers/CardView.vue'
import CreateView from '@/engine/containers/CreateView.vue'
import CardCreateView from '@/engine/containers/CardCreateView.vue'
import ColumnSettingsPopover from '@/components/table/ColumnSettingsPopover.vue'
import CardLayoutSettingsPopover from '@/components/card/CardLayoutSettingsPopover.vue'
import RelationEditor from '@/components/field/editors/RelationEditor.vue'
import type { DialogType, DraftRecord, ColumnConfig, UserViewConfig, CardLayoutConfig, FieldSchema, FilterCondition, FilterPreset, SortParam, RowActionEvent, ActionTriggerEvent, ExtendedDialogType } from '@/types'
import { validateFieldValue } from '@/utils/fieldValidation'

const props = defineProps<{
  moduleId: string
  initialViewMode?: ViewMode
  embedded?: boolean
  readonly?: boolean
  globalContext?: Record<string, unknown>
  /** 列表表格高度（vxe height）：传 '100%' 等让表体内部滚动、表头固定 */
  tableHeight?: string | number
  /** 列表密度档位（docs/19 F1）：compact/default/large，透传 ListView → SchemaTable → VxeTableWrapper */
  density?: 'compact' | 'default' | 'large'
  /** 引擎语言（docs/19 G1）：语言包须先经 registerLocale 注册；未传保持当前语言 */
  locale?: string
}>()

// 引擎语言注入（docs/19 G1）：宿主经 locale prop 切换（语言包先 registerLocale 注册）
watch(() => props.locale, (loc) => {
  if (loc) setLocale(loc)
}, { immediate: true })

const emit = defineEmits<{
  'module-loaded': [payload: { moduleId: string }]
  'view-mode-change': [payload: { mode: 'list' | 'card' | 'create' }]
  'data-changed': [payload: { moduleId: string }]
  error: [payload: { moduleId: string; code: string; message: string }]
  'request-open-dialog': [payload: { dialogType: ExtendedDialogType; payload: Record<string, unknown> }]
  'action-trigger': [payload: ActionTriggerEvent]
  'row-action': [payload: RowActionEvent]
  'cell-click': [payload: { field: string; rowId: string | null }]
  'edit-activated': [payload: { rowId: string; field: string }]
  'edit-closed': [payload: { rowId: string; field: string; value: unknown }]
}>()

const schemaMeta = createSchemaMetaState()
const recordStore = createRecordState()
const uiState = createUiState()
const runtimeContext = createRuntimeContextState(props.globalContext ?? {})

provide(SCHEMA_META_KEY, schemaMeta)
provide(RECORD_STATE_KEY, recordStore)
provide(UI_STATE_KEY, uiState)
provide(RUNTIME_CONTEXT_KEY, runtimeContext)

const schema = useSchema(schemaMeta, uiState)
provide('loadingModuleId', schema.loadingModuleId)
const permission = usePermission(schemaMeta)
const cellEdit = useCellEdit(recordStore, schemaMeta, uiState)
const formula = useFormula(recordStore, schemaMeta)

const hasFormulaFields = computed(() => {
  return schemaMeta.schema?.formulaConfig?.enabled && (schemaMeta.schema.formulaConfig.fields?.length ?? 0) > 0
})

const cycleAlert = computed(() => {
  if (!hasFormulaFields.value) return null
  const cycle = formula.hasCycleError.value
  if (!cycle.hasCycle) return null
  return cycle
})

const currentCreateMode = ref<'list' | 'card'>('list')
const autoEditCard = ref(false)

const relationEditorState = ref<{
  field: string
  fieldSchema: FieldSchema
  recordId: string
  moduleId: string
} | null>(null)

function handleOpenRelationEditor(payload: { field: string; fieldSchema: FieldSchema; recordId: string; moduleId: string }): void {
  relationEditorState.value = payload
}

function handleRelationEditorClose(): void {
  relationEditorState.value = null
}

function handleFormulaDetailOpen(payload: { field: string; rowId?: string }): void {
  openDialog('formula-detail', { fieldKey: payload.field, recordId: payload.rowId })
}

function handleRowAction(payload: { rowId: string; field: string; actionId: string }): void {
  // 行级操作（如删除）上抛给宿主处理，由宿主侧调用删除接口并刷新
  emit('row-action', payload)
}

onMounted(async () => {
  await schema.loadModule(props.moduleId)
  if (schemaMeta.isLoaded && schemaMeta.schema) {
    emit('module-loaded', { moduleId: props.moduleId })
  }
  if (schemaMeta.loadError) {
    emit('error', {
      moduleId: props.moduleId,
      code: 'LOAD_ERROR',
      message: schemaMeta.loadError,
    })
  }
})

watch(
  () => props.globalContext,
  (ctx) => {
    runtimeContext.setGlobal(ctx ?? {})
  },
  { deep: true },
)

watch(() => uiState.viewMode, (mode) => {
  emit('view-mode-change', { mode: mode as 'list' | 'card' | 'create' })
})

// 全局消息桥接(docs/19 批次 D2):showMessage 写入的状态此前无组件渲染,
// 批量删除/保存失败等提示均不可见;在此统一转 ElMessage 弹出。
watch(() => uiState.globalMessage, (message) => {
  if (!message) return
  ElMessage({
    message,
    type: (uiState.globalMessageType as 'info' | 'warning' | 'error' | 'success') ?? 'info',
    grouping: true,
  })
  uiState.clearMessage()
})

function handleViewModeChange(mode: 'list' | 'card' | 'create'): void {
  schema.setViewMode(mode)
  if (mode === 'create') {
    recordStore.clearDrafts()
    currentCreateMode.value = schemaMeta.schema?.createMode ?? 'list'
  }
}

const isSelectThenEditMode = computed(() => {
  return schemaMeta.schema?.listEditMode === 'select-then-edit'
})

function handleEditSelectedRow(): void {
  const selectedId = uiState.selectedRowIds[0]
  if (!selectedId) {
    ElMessage.warning('请先选择一行')
    return
  }
  const record = recordStore.getRecordById(selectedId)
  if (!record) {
    ElMessage.warning('所选行不在当前列表数据中')
    return
  }
  recordStore.setCurrentRecord(record)
  autoEditCard.value = true
  handleViewModeChange('card')
  nextTick(() => {
    autoEditCard.value = false
  })
}

/**
 * 落地视图配置：先更新内存态（立即生效、不等待网络），再异步持久化。
 *
 * 写后端失败只影响下次进入（回落到 schema 默认列），不打断本次操作 ——
 * 列显隐/排序是体验偏好，不是业务数据，没必要为它弹错阻断用户。
 */
function persistViewConfig(config: UserViewConfig): void {
  schemaMeta.setViewConfig(config)
  void schema.saveViewConfig(config)
}

/** 排序是否等价（null 与 undefined 都视为「未排序」，避免翻页/筛选触发重复落库） */
function isSameSort(a?: SortParam, b?: SortParam | null): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.field === b.field && a.order === b.order
}

function handleColumnSettingsSave(columns: ColumnConfig[]): void {
  const config: UserViewConfig = {
    moduleId: props.moduleId,
    version: schemaMeta.viewConfig?.version ?? 1,
    columns,
    pageSize: schemaMeta.viewConfig?.pageSize ?? 20,
    cardLayout: schemaMeta.viewConfig?.cardLayout,
    defaultSort: schemaMeta.viewConfig?.defaultSort,
  }
  persistViewConfig(config)
}

function handleColumnSettingsReset(): void {
  if (schemaMeta.schema) {
    // 操作列（type:'action'）为标准数据操作，固定渲染，不参与列设置
    const defaultColumns: ColumnConfig[] = schemaMeta.schema.fields
      .filter(f => f.visible !== false && f.type !== 'action')
      .map((f, i) => ({
        field: f.key,
        width: f.width || 120,
        visible: true,
        order: i,
        sortable: !!f.sortable,
      }))
    handleColumnSettingsSave(defaultColumns)
  }
}

function handleCardLayoutSave(cardLayout: CardLayoutConfig): void {
  const config: UserViewConfig = {
    moduleId: props.moduleId,
    version: schemaMeta.viewConfig?.version ?? 1,
    columns: schemaMeta.viewConfig?.columns ?? [],
    pageSize: schemaMeta.viewConfig?.pageSize ?? 20,
    cardLayout,
    defaultSort: schemaMeta.viewConfig?.defaultSort,
  }
  persistViewConfig(config)
}

function handleCardLayoutReset(): void {
  const config: UserViewConfig = {
    moduleId: props.moduleId,
    version: schemaMeta.viewConfig?.version ?? 1,
    columns: schemaMeta.viewConfig?.columns ?? [],
    pageSize: schemaMeta.viewConfig?.pageSize ?? 20,
    cardLayout: undefined,
    defaultSort: schemaMeta.viewConfig?.defaultSort,
  }
  persistViewConfig(config)
}

/** 保存视图变更(docs/19 批次 E3):presets 增删/设默认 → UserViewConfig.filterPresets */
function handlePresetsChange(presets: FilterPreset[]): void {
  const current = schemaMeta.viewConfig
  if (!current) return
  persistViewConfig({ ...current, filterPresets: presets })
}

/** 列拖拽持久化(docs/19 批次 E4):按新列序重排 UserViewConfig.columns(未出现的列保持原序) */
function handleColumnOrderChange(newOrder: string[]): void {
  const current = schemaMeta.viewConfig
  if (!current || newOrder.length === 0) return
  const orderMap = new Map(newOrder.map((field, index) => [field, index]))
  const columns = current.columns.map((c) => {
    const nextOrder = orderMap.get(c.field)
    return nextOrder === undefined ? c : { ...c, order: nextOrder }
  })
  persistViewConfig({ ...current, columns })
}

function handleCellEdit(payload: { rowId: string; field: string; value: unknown; oldValue: unknown; mode: string; source: string }): void {
  cellEdit.onCellEdit(payload as any)
  emit('data-changed', { moduleId: props.moduleId })
}

function handleQueryChange(payload: { filters: FilterCondition[]; sort: SortParam | null; pagination: { page: number; pageSize: number } }): void {
  recordStore.setQueryState({ filters: payload.filters, sort: payload.sort })
  recordStore.setPagination(payload.pagination)

  // 排序与每页条数是长期视图偏好（刷新后应保持），筛选是一次性查询条件不落库。
  // query-change 在翻页/筛选时同样会触发，故只在真正变化时写入，避免每页一次请求。
  const current = schemaMeta.viewConfig
  if (!current) return
  const sortChanged = !isSameSort(current.defaultSort, payload.sort)
  const pageSizeChanged = current.pageSize !== payload.pagination.pageSize
  if (!sortChanged && !pageSizeChanged) return
  persistViewConfig({
    ...current,
    defaultSort: payload.sort ?? undefined,
    pageSize: payload.pagination.pageSize || current.pageSize,
  })
}

function handleCardFieldChange(payload: { field: string; value: unknown; oldValue: unknown }): void {
  const record = recordStore.currentRecord
  if (!record) return
  cellEdit.onCellEdit({
    rowId: record.id,
    field: payload.field,
    value: payload.value,
    oldValue: payload.oldValue,
    mode: 'row',
    source: 'user',
  })
}

function handleCardSave(): void {
  emit('data-changed', { moduleId: props.moduleId })
}

function getDecimalPlaces(value: number): number {
  if (!isFinite(value)) return 0
  const str = String(value)
  const dotIndex = str.indexOf('.')
  if (dotIndex === -1) return 0
  return str.length - dotIndex - 1
}

function validateDecimalValue(value: unknown, fieldSchema: FieldSchema): string | null {
  if (value == null || value === '') return null
  if (fieldSchema.type !== 'number' && fieldSchema.type !== 'currency' && fieldSchema.type !== 'percent') return null
  const decimal = fieldSchema.decimal ?? (fieldSchema.type === 'currency' ? 2 : fieldSchema.type === 'percent' ? 0 : undefined)
  if (decimal == null) return null
  const num = Number(value)
  if (isNaN(num)) return null
  const actualPlaces = getDecimalPlaces(num)
  const mode = fieldSchema.decimalMode ?? 'fixed'
  const maxDec = mode === 'range' ? (fieldSchema.maxDecimal ?? decimal) : decimal
  if (actualPlaces <= maxDec) return null
  return `最多允许${maxDec}位小数，当前${actualPlaces}位`
}

async function handleCreateSave(): Promise<void> {
  const drafts = recordStore.draftRows
  if (drafts.length === 0) return

  // docs/19 批次 D3:共享校验器(ValidationRule[] + required)与行内编辑/快速创建同口径
  const errors: string[] = []
  const warnings: string[] = []
  drafts.forEach((draft, idx) => {
    for (const field of schemaMeta.visibleFields) {
      const decimalError = validateDecimalValue(draft.fields[field.key], field)
      if (decimalError) {
        errors.push(`第${idx + 1}行「${field.label}」: ${decimalError}`)
        continue
      }
      const result = validateFieldValue(field, draft.fields[field.key])
      for (const message of result.errors) {
        errors.push(`第${idx + 1}行「${field.label}」: ${message}`)
      }
      for (const message of result.warnings) {
        warnings.push(`第${idx + 1}行「${field.label}」: ${message}`)
      }
    }
  })
  if (errors.length > 0) {
    ElMessage.warning(errors.join('；'))
    return
  }
  if (warnings.length > 0) {
    ElMessage.warning(warnings.join('；'))
  }

  if (!schemaMeta.schema) return

  recordStore.setSaving(true)
  try {
    const createParams = drafts.map(draft => {
      const evaluatedFields = { ...draft.fields }
      if (hasFormulaFields.value) {
        formula.evaluateAllFormulas(evaluatedFields)
      }
      return { moduleId: schemaMeta.schema!.id, fields: evaluatedFields }
    })

    const res = await recordService.batchCreate(createParams)
    if (res.success) {
      ElMessage.success(`成功创建 ${res.data.length} 条记录`)
      recordStore.clearDrafts()
      handleViewModeChange('list')
      await schema.loadModule(props.moduleId)
      emit('data-changed', { moduleId: props.moduleId })
    } else {
      ElMessage.error(res.message || '创建失败')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败'
    ElMessage.error(message)
  } finally {
    recordStore.setSaving(false)
  }
}

async function handleCreateSaveAndContinue(): Promise<void> {
  const drafts = recordStore.draftRows
  if (drafts.length === 0) return

  if (!schemaMeta.schema) return

  recordStore.setSaving(true)
  try {
    const createParams = drafts.map(draft => {
      const evaluatedFields = { ...draft.fields }
      if (hasFormulaFields.value) {
        formula.evaluateAllFormulas(evaluatedFields)
      }
      return { moduleId: schemaMeta.schema!.id, fields: evaluatedFields }
    })

    const res = await recordService.batchCreate(createParams)
    if (res.success) {
      ElMessage.success(`成功创建 ${res.data.length} 条记录`)
      recordStore.clearDrafts()
      emit('data-changed', { moduleId: props.moduleId })
    } else {
      ElMessage.error(res.message || '创建失败')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败'
    ElMessage.error(message)
  } finally {
    recordStore.setSaving(false)
  }
}

function handleCreateCancel(): void {
  recordStore.clearDrafts()
  handleViewModeChange('list')
}

async function handleRefresh(): Promise<void> {
  await schema.loadModule(props.moduleId)
}

function handleCardCreateDraftChange(payload: { drafts: DraftRecord[]; changedIndex?: number }): void {
  void payload
}

function openDialog(dialogType: DialogType, payload: Record<string, unknown>): void {
  uiState.openDialog(dialogType, payload)
  emit('request-open-dialog', { dialogType, payload })
}

defineExpose({
  refresh: () => schema.loadModule(props.moduleId),
  setViewMode: handleViewModeChange,
  getCurrentRecord: () => recordStore.currentRecord,
})
</script>

<template>
  <div class="schema-engine" :class="{ embedded, readonly }">
    <div v-if="schemaMeta.loadError" class="engine-error">
      <el-empty description="模块加载失败">
        <template #description>
          <p>{{ schemaMeta.loadError }}</p>
        </template>
        <ElButton type="primary" @click="schema.loadModule(moduleId)">重试</ElButton>
      </el-empty>
    </div>

    <!-- 权限判定随模块加载异步返回（loadModule 期间 permissions 为 null）：
         未返回前必须呈现加载态，否则差网下先闪"无权限"再出数据，误导用户怀疑权限故障 -->
    <div v-else-if="schemaMeta.isLoading && !schemaMeta.permissions" class="engine-error">
      <el-skeleton class="engine-loading-skeleton" :rows="4" animated />
    </div>

    <div v-else-if="!permission.canView.value" class="engine-error">
      <el-empty description="无权限访问该模块" />
    </div>

    <template v-else>
      <SchemaContextProvider :module-id="moduleId">
        <ViewContainer
          :schema="schemaMeta.schema"
          :view-mode="uiState.viewMode"
          :records="recordStore.records"
          :query-state="recordStore.queryState"
          :view-config="schemaMeta.viewConfig"
          :loading="schemaMeta.isLoading"
          @cell-edit="handleCellEdit"
          @query-change="handleQueryChange"
        >
          <template #toolbar>
            <div class="engine-toolbar">
              <div class="toolbar-left">
                <h2 class="engine-title">{{ schemaMeta.schema?.name }}</h2>
                <ElButton
                  v-if="uiState.viewMode !== 'create'"
                  size="small"
                  :loading="schemaMeta.isLoading"
                  @click="handleRefresh"
                >
                  刷新
                </ElButton>
              </div>
              <div class="toolbar-actions">
                <template v-if="uiState.viewMode === 'list'">
                  <ElButton
                    v-if="isSelectThenEditMode && permission.canEdit.value && !readonly"
                    size="small"
                    type="primary"
                    :disabled="uiState.selectedRowIds.length === 0"
                    @click="handleEditSelectedRow"
                  >
                    编辑
                  </ElButton>
                  <ColumnSettingsPopover
                    v-if="schemaMeta.schema"
                    :fields="schemaMeta.schema.fields"
                    :columns="schemaMeta.viewConfig?.columns ?? []"
                    @save="handleColumnSettingsSave"
                    @reset="handleColumnSettingsReset"
                  >
                    <ElButton size="small">
                      列设置
                    </ElButton>
                  </ColumnSettingsPopover>
                </template>
                <template v-else-if="uiState.viewMode === 'card'">
                  <CardLayoutSettingsPopover
                    v-if="schemaMeta.schema"
                    :fields="schemaMeta.schema.fields"
                    :card-layout="schemaMeta.viewConfig?.cardLayout ?? null"
                    @save="handleCardLayoutSave"
                    @reset="handleCardLayoutReset"
                  >
                    <ElButton size="small">
                      卡片布局
                    </ElButton>
                  </CardLayoutSettingsPopover>
                </template>
                <ElTooltip
                  v-if="cycleAlert"
                  :content="'检测到公式循环依赖: ' + cycleAlert.cyclePath.join(' → ')"
                  placement="bottom"
                >
                  <ElTag type="danger" size="small" effect="dark" style="cursor: pointer;" @click="openDialog('formula-detail', { fieldKey: cycleAlert.cyclePath[0] })">
                    &#9888; 公式循环
                  </ElTag>
                </ElTooltip>
                <template v-if="uiState.viewMode === 'create'">
                  <ElButton
                    v-if="currentCreateMode !== 'list'"
                    size="small"
                    @click="currentCreateMode = 'list'"
                  >
                    列表新增
                  </ElButton>
                  <ElButton
                    v-if="currentCreateMode !== 'card'"
                    size="small"
                    @click="currentCreateMode = 'card'"
                  >
                    卡片新增
                  </ElButton>
                  <ElButton
                    size="small"
                    type="primary"
                    @click="handleViewModeChange('list')"
                  >
                    返回列表
                  </ElButton>
                </template>
                <template v-else>
                  <ElButton
                    v-if="uiState.viewMode !== 'list' && permission.canView.value"
                    size="small"
                    @click="handleViewModeChange('list')"
                  >
                    列表视图
                  </ElButton>
                  <ElButton
                    v-if="uiState.viewMode !== 'card' && permission.canView.value && schemaMeta.schema?.moduleType !== 'list'"
                    size="small"
                    @click="handleViewModeChange('card')"
                  >
                    卡片视图
                  </ElButton>
                  <ElButton
                    v-if="permission.canCreate.value"
                    size="small"
                    type="primary"
                    @click="handleViewModeChange('create')"
                  >
                    新增
                  </ElButton>
                </template>
              </div>
            </div>
          </template>

          <template #list-view>
            <ErrorBoundary>
              <ListView
                v-if="schemaMeta.schema"
                :schema="schemaMeta.schema"
                :view-config="schemaMeta.viewConfig?.columns ?? []"
                :table-height="tableHeight"
                :density="density"
                @cell-edit="handleCellEdit"
                @query-change="handleQueryChange"
                @formula-detail-open="handleFormulaDetailOpen"
                @row-action="handleRowAction"
                @open-relation-editor="handleOpenRelationEditor"
                @presets-change="handlePresetsChange"
                @column-order-change="handleColumnOrderChange"
                @action-trigger="(p) => emit('action-trigger', p)"
                @cell-click="(p: { field: string; rowId: string | null }) => emit('cell-click', p)"
                @edit-activated="(p: { rowId: string; field: string }) => emit('edit-activated', p)"
                @edit-closed="(p: { rowId: string; field: string; value: unknown }) => emit('edit-closed', p)"
              />
            </ErrorBoundary>
          </template>

          <template #card-view>
            <ErrorBoundary>
              <CardView
                v-if="schemaMeta.schema && recordStore.records.length > 0"
                :editable="permission.canEdit.value && !readonly"
                :card-layout="schemaMeta.viewConfig?.cardLayout ?? null"
                :auto-edit="autoEditCard"
                @field-change="handleCardFieldChange"
                @save="handleCardSave"
              />
            </ErrorBoundary>
          </template>

          <template #create-view>
            <ErrorBoundary>
              <CreateView
                v-if="schemaMeta.schema && currentCreateMode === 'list'"
                :submitting="recordStore.isSaving"
                @save="handleCreateSave"
                @save-and-continue="handleCreateSaveAndContinue"
                @cancel="handleCreateCancel"
              />
            </ErrorBoundary>
            <ErrorBoundary>
              <CardCreateView
                v-if="schemaMeta.schema && currentCreateMode === 'card'"
                :submitting="recordStore.isSaving"
                @save="handleCreateSave"
                @cancel="handleCreateCancel"
                @draft-change="handleCardCreateDraftChange"
              />
            </ErrorBoundary>
          </template>
        </ViewContainer>

        <GlobalDialogHost />

        <RelationEditor
          v-if="relationEditorState"
          :key="relationEditorState.recordId + '-' + relationEditorState.field"
          :field-schema="relationEditorState.fieldSchema"
          :record-id="relationEditorState.recordId"
          :module-id="relationEditorState.moduleId"
          :auto-open="true"
          @update:auto-open="(v: boolean) => { if (!v) handleRelationEditorClose() }"
          @close="handleRelationEditorClose"
        />
      </SchemaContextProvider>
    </template>
  </div>
</template>

<style scoped>
.schema-engine {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.schema-engine.embedded {
  border: 1px solid var(--sg-border-color-light);
  border-radius: var(--sg-radius-md);
}
.engine-error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300px;
}
.engine-loading-skeleton {
  width: min(560px, 80%);
}
.engine-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sg-spacing-6) var(--sg-spacing-8);
  border-bottom: 1px solid var(--sg-border-color-light);
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-6);
}
.engine-title {
  margin: 0;
  font-size: var(--sg-font-size-xl);
  font-weight: 600;
}
.toolbar-actions {
  display: flex;
  gap: var(--sg-spacing-4);
}
</style>
