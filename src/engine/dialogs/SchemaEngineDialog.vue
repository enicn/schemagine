<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  ElDialog,
  ElButton,
  ElMessage,
} from 'element-plus'
import { flattenRecordRow } from '@/utils/recordRow'
import { formatMoney } from '@/utils/formatMoney'
import VxeTableWrapper from '@/components/table/VxeTableWrapper.vue'
import type { WrapperColumn } from '@/components/table/VxeTableWrapper.vue'
import SchemaPagination from '@/components/table/SchemaPagination.vue'
import SchemaCard from '@/components/card/SchemaCard.vue'
import ColumnSettingsPopover from '@/components/table/ColumnSettingsPopover.vue'
import CardLayoutSettingsPopover from '@/components/card/CardLayoutSettingsPopover.vue'
import { recordService } from '@/services/api/recordService'
import { schemaService } from '@/services/api/schemaService'
import type {
  ModuleSchema,
  SortParam,
  FilterClause,
  RecordEntity,
  ColumnConfig,
  CardLayoutConfig,
  ListAction,
} from '@/types'

const props = defineProps<{
  visible: boolean
  moduleId: string
  title?: string
  initialFilters?: FilterClause[]
}>()

const emit = defineEmits<{
  close: []
}>()

interface PopupLayer {
  moduleId: string
  title: string
  initialFilters?: FilterClause[]
}

const popupStack = ref<PopupLayer[]>([])
const popupDialogTitle = computed(() => {
  if (popupStack.value.length > 0) {
    const top = popupStack.value[popupStack.value.length - 1]
    if (top) return top.title
  }
  return props.title || '查看数据'
})

const activeModuleId = computed(() => {
  if (popupStack.value.length > 0) {
    const top = popupStack.value[popupStack.value.length - 1]
    if (top) return top.moduleId
  }
  return props.moduleId
})

const activeInitialFilters = computed(() => {
  if (popupStack.value.length > 0) {
    const top = popupStack.value[popupStack.value.length - 1]
    if (top) return top.initialFilters
  }
  return props.initialFilters
})

const schema = ref<ModuleSchema | null>(null)
const isSchemaLoading = ref(false)
const schemaError = ref<string | null>(null)

const records = ref<RecordEntity[]>([])
const totalRecords = ref(0)
const isDataLoading = ref(false)

const filters = ref<FilterClause[]>([])
const currentSort = ref<SortParam | null>(null)
const currentPage = ref(1)
const pageSize = ref(20)

const cardIndex = ref(0)

type PopupViewMode = 'list' | 'card'
const viewMode = ref<PopupViewMode>('list')

const localColumns = ref<ColumnConfig[]>([])
const localCardLayout = ref<CardLayoutConfig | null>(null)

const listActions = computed<ListAction[]>(() => {
  return schema.value?.listActions ?? []
})

const aggregationSummary = computed(() => {
  if (!schema.value) return []
  const fields = schema.value.fields.filter(f => {
    const agg = f.aggregation
    return agg === 'sum' || agg === 'average' || agg === 'count' || agg === 'max' || agg === 'min'
  })
  if (fields.length === 0 || records.value.length === 0) return []
  const totalCount = records.value.length
  return fields.map(field => {
    const aggregation = field.aggregation!
    const values = records.value
      .map(r => Number(r.fields[field.key]))
      .filter(v => !isNaN(v))
    let value = 0
    let count = records.value.length
    if (aggregation === 'sum') {
      value = values.reduce((a, b) => a + b, 0)
      count = values.length
    } else if (aggregation === 'average') {
      value = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
      count = values.length
    } else if (aggregation === 'count') {
      value = count
    } else if (aggregation === 'max') {
      value = values.length > 0 ? Math.max(...values) : 0
      count = values.length
    } else if (aggregation === 'min') {
      value = values.length > 0 ? Math.min(...values) : 0
      count = values.length
    }
    return {
      fieldKey: field.key,
      label: field.label,
      type: aggregation,
      value: Math.round(value * 100) / 100,
      count,
      totalCount,
    }
  })
})

const totalAggregationCount = computed(() => {
  return aggregationSummary.value[0]?.totalCount ?? 0
})

function buildDefaultColumns(): ColumnConfig[] {
  if (!schema.value) return []
  // 操作列（type:'action'）为标准数据操作，固定渲染，不参与列设置
  return schema.value.fields
    .filter(f => f.visible !== false && f.type !== 'action')
    .map((f, i) => ({
      field: f.key,
      width: f.width ?? 120,
      visible: true,
      order: i,
      sortable: !!f.sortable,
    }))
}

function buildDefaultCardLayout(): CardLayoutConfig | null {
  if (!schema.value) return null
  const allowedTypes = ['text', 'number', 'boolean', 'select', 'status', 'date', 'currency', 'fk', 'formula', 'phone', 'email', 'url']
  const fields = schema.value.fields
    .filter(f => f.visible !== false && allowedTypes.includes(f.type))
    .map((f, i) => {
      const longTypes = ['text', 'formula', 'url']
      const span = longTypes.includes(f.type) ? 8 : 4
      return { field: f.key, span, order: i }
    })
  if (fields.length === 0) return null
  return { fields, defaultSpan: 4 }
}

const fieldSchemas = computed(() => {
  if (!schema.value) return []
  return schema.value.fields.filter(f => f.visible !== false)
})

function flattenRecords(rows: RecordEntity[]): Record<string, unknown>[] {
  return rows.map(r => flattenRecordRow(r))
}

const tableData = computed(() => flattenRecords(records.value))

const wrapperColumns = computed<WrapperColumn[]>(() => {
  if (!schema.value) return []
  const configMap = new Map(localColumns.value.map(c => [c.field, c]))
  const result: WrapperColumn[] = []
  schema.value.fields.forEach(field => {
    const config = configMap.get(field.key)
    const isAction = field.type === 'action' && !!field.rowAction
    let formatter: ((params: any) => string) | undefined
    if (isAction) {
      formatter = () => field.rowAction?.label || field.label
    } else if (field.type === 'percent') {
      const decimal = field.decimal ?? 0
      const mode = field.decimalMode ?? 'fixed'
      formatter = (params: any) => {
        const v = params.cellValue
        if (v == null || v === '') return ''
        const num = Number(v)
        if (isNaN(num)) return String(v)
        if (mode === 'max') return `${(num * 100).toString()}%`
        return `${(num * 100).toFixed(decimal)}%`
      }
    } else if (field.type === 'money') {
      formatter = (params: any) => {
        const v = params.cellValue
        if (v == null || v === '') return ''
        return formatMoney(v)
      }
    } else if (field.type === 'boolean') {
      formatter = (params: any) => {
        const v = params.cellValue
        if (v == null || v === '') return ''
        const trueLabel = field.trueLabel || '是'
        const falseLabel = field.falseLabel || '否'
        return v ? trueLabel : falseLabel
      }
    }
    const booleanCellClass = field.type === 'boolean'
      ? ({ value }: { value: unknown }) => value ? (field.trueLabelClass || '') : (field.falseLabelClass || '')
      : undefined
    result.push({
      field: field.key,
      title: isAction ? (field.rowAction?.label || field.label) : field.label,
      width: config?.width ?? (isAction ? (field.width ?? 80) : (field.width ?? 120)),
      fixed: config?.fixed ?? field.fixed,
      sortable: isAction ? false : field.sortable,
      visible: config?.visible ?? field.visible,
      align: (field.type === 'number' || field.type === 'currency' || field.type === 'percent' ? 'right' : 'left') as 'left' | 'right' | 'center',
      formatter,
      isAction,
      actionDanger: isAction && field.rowAction?.type === 'delete',
      cellClass: booleanCellClass,
      fieldType: field.type,
      targetModule: field.targetModule,
      quickCreate: field.quickCreate,
      readonly: field.readonly,
      editMode: field.editMode,
      selectOptions: field.options?.map(o => ({ label: o.label, value: o.value })),
      trueLabel: field.trueLabel,
      falseLabel: field.falseLabel,
      highlightStyle: field.highlightStyle,
      decimal: field.decimal,
      decimalMode: field.decimalMode,
      maxDecimal: field.maxDecimal,
    })
  })
  const orderMap = new Map(localColumns.value.map(c => [c.field, c.order]))
  result.sort((a, b) => {
    const oa = orderMap.get(a.field) ?? 999
    const ob = orderMap.get(b.field) ?? 999
    return oa - ob
  })
  return result
})

const currentCardRecord = computed(() => {
  return records.value[cardIndex.value] ?? null
})

const hasRecords = computed(() => records.value.length > 0)

const moduleType = computed(() => schema.value?.moduleType ?? 'list')

function initColumnsFromSchema(): void {
  if (!schema.value) {
    localColumns.value = []
    return
  }
  localColumns.value = buildDefaultColumns()
  localCardLayout.value = buildDefaultCardLayout()
}

async function loadModule(): Promise<void> {
  isSchemaLoading.value = true
  schemaError.value = null
  const modId = activeModuleId.value

  try {
    const res = await schemaService.loadModuleSchema(modId)
    if (modId !== activeModuleId.value) return
    if (res.success) {
      schema.value = res.data
      initColumnsFromSchema()
      viewMode.value = 'list'
      cardIndex.value = 0
      await fetchData()
    } else {
      schemaError.value = res.message || '加载 Schema 失败'
    }
  } catch (err) {
    if (modId !== activeModuleId.value) return
    schemaError.value = err instanceof Error ? err.message : '加载 Schema 失败'
  } finally {
    if (modId === activeModuleId.value) {
      isSchemaLoading.value = false
    }
  }
}

async function fetchData(): Promise<void> {
  if (!schema.value) return
  isDataLoading.value = true
  const modId = activeModuleId.value
  try {
    const res = await recordService.list({
      moduleId: modId,
      filters: filters.value,
      sort: currentSort.value || undefined,
      page: currentPage.value,
      pageSize: pageSize.value,
    })
    if (modId !== activeModuleId.value) return
    if (res.success) {
      records.value = res.data.records
      totalRecords.value = res.data.total
    }
  } catch {
    if (modId === activeModuleId.value) {
      ElMessage.error('加载数据失败')
    }
  } finally {
    if (modId === activeModuleId.value) {
      isDataLoading.value = false
    }
  }
}

watch([currentPage, pageSize, filters, currentSort], () => {
  if (schema.value) fetchData()
})

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

function handlePageChange(payload: { page: number; pageSize: number }): void {
  currentPage.value = payload.page
  pageSize.value = payload.pageSize
}

function handleColumnSettingsSave(columns: ColumnConfig[]): void {
  localColumns.value = [...columns]
}

function handleColumnSettingsReset(): void {
  localColumns.value = buildDefaultColumns()
}

function handleCardLayoutSave(layout: CardLayoutConfig): void {
  localCardLayout.value = { ...layout }
}

function handleCardLayoutReset(): void {
  localCardLayout.value = buildDefaultCardLayout()
}

function handleCardPrev(): void {
  if (cardIndex.value > 0) {
    cardIndex.value--
  }
}

function handleCardNext(): void {
  if (cardIndex.value < records.value.length - 1) {
    cardIndex.value++
  }
}

function handleViewModeChange(mode: PopupViewMode): void {
  viewMode.value = mode
  cardIndex.value = 0
}

function handleClose(): void {
  if (popupStack.value.length > 0) {
    popupStack.value.pop()
    return
  }
  emit('close')
}

function handleCloseAll(): void {
  popupStack.value = []
  emit('close')
}

function handleNestedPopup(action: ListAction): void {
  const target = action.target
  if (!target?.moduleId) return
  const initialFilters: FilterClause[] | undefined = target.filters
    ? target.filters
        .filter(f => f.operator && f.valueSource === 'static')
        .map(f => ({
          field: f.field,
          operator: f.operator as FilterClause['operator'],
          value: f.staticValue,
        }))
    : undefined
  popupStack.value.push({
    moduleId: target.moduleId,
    title: action.label,
    initialFilters,
  })
}

function getDialogZIndex(): number {
  if (popupStack.value.length > 0) {
    return 2100 + popupStack.value.length * 100
  }
  return 2000
}

watch([activeModuleId, activeInitialFilters], () => {
  currentPage.value = 1
  currentSort.value = null
  filters.value = activeInitialFilters.value ?? []
  cardIndex.value = 0
  viewMode.value = 'list'
  loadModule()
})

watch(() => props.visible, (show) => {
  if (show) {
    popupStack.value = []
    currentPage.value = 1
    currentSort.value = null
    filters.value = props.initialFilters ?? []
    cardIndex.value = 0
    viewMode.value = 'list'
    loadModule()
  }
})
</script>

<template>
  <ElDialog
    :model-value="visible"
    :title="popupDialogTitle"
    :width="popupStack.length > 1 ? '88%' : '80%'"
    :close-on-click-modal="false"
    :z-index="getDialogZIndex()"
    top="5vh"
    class="popup-dialog"
    @update:model-value="handleClose"
  >
    <div v-if="schemaError" class="dialog-error">
      <p>{{ schemaError }}</p>
      <ElButton size="small" @click="loadModule">重试</ElButton>
    </div>

    <div v-else class="dialog-body">
      <div class="popup-toolbar">
        <div class="popup-toolbar-left">
          <template v-if="viewMode === 'list'">
            <ColumnSettingsPopover
              v-if="schema"
              :fields="schema.fields"
              :columns="localColumns"
              @save="handleColumnSettingsSave"
              @reset="handleColumnSettingsReset"
            >
              <ElButton size="small">列表设置</ElButton>
            </ColumnSettingsPopover>
          </template>
          <template v-else-if="viewMode === 'card'">
            <CardLayoutSettingsPopover
              v-if="schema"
              :fields="schema.fields"
              :card-layout="localCardLayout"
              @save="handleCardLayoutSave"
              @reset="handleCardLayoutReset"
            >
              <ElButton size="small">卡片设置</ElButton>
            </CardLayoutSettingsPopover>
          </template>
          <ElButton
            v-if="viewMode !== 'list'"
            size="small"
            @click="handleViewModeChange('list')"
          >
            列表界面
          </ElButton>
          <ElButton
            v-if="viewMode !== 'card' && moduleType !== 'list'"
            size="small"
            @click="handleViewModeChange('card')"
          >
            卡片界面
          </ElButton>
        </div>
        <div class="popup-toolbar-right">
          <template v-for="action in listActions" :key="action.id">
            <ElButton size="small" @click="handleNestedPopup(action)">
              {{ action.label }}
            </ElButton>
          </template>
        </div>
      </div>

      <div v-if="viewMode === 'list'" class="popup-list-view">
        <VxeTableWrapper
          v-if="schema"
          :module-id="schema.id"
          :data="tableData"
          :columns="wrapperColumns"
          :loading="isDataLoading || isSchemaLoading"
          :sort-config="currentSort ? { field: currentSort.field, order: currentSort.order } : undefined"
          :filter-clauses="filters"
          @sort-change="handleSortChange"
          @filter-change="(payload: { field: string; clause: FilterClause | null }) => { const next = filters.filter(c => c.field !== payload.field); if (payload.clause) next.push(payload.clause); handleSearch(next) }"
        />
        <div v-if="aggregationSummary.length > 0" class="aggregation-bar">
          <div class="aggregation-item">
            <span class="agg-label">总行数</span>
            <span class="agg-number">{{ totalAggregationCount }}</span>
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
              {{ item.type === 'count' ? item.count : item.value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
            </span>
          </div>
        </div>
      </div>

      <div v-else-if="viewMode === 'card'" class="popup-card-view">
        <div v-if="!hasRecords" class="popup-card-empty">
          <p>暂无记录</p>
        </div>
        <template v-else>
          <div class="popup-card-navigator">
            <ElButton
              size="small"
              :disabled="cardIndex <= 0"
              @click="handleCardPrev"
            >
              上一页
            </ElButton>
            <span class="popup-card-info">
              记录 {{ cardIndex + 1 }} / {{ records.length }}
              <span class="popup-card-total">（共 {{ totalRecords }} 条）</span>
            </span>
            <ElButton
              size="small"
              :disabled="cardIndex >= records.length - 1"
              @click="handleCardNext"
            >
              下一页
            </ElButton>
          </div>
          <SchemaCard
            v-if="currentCardRecord"
            :key="currentCardRecord.id"
            :record="currentCardRecord"
            :field-schemas="fieldSchemas"
            :editable="false"
            :card-layout="localCardLayout"
          />
        </template>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <SchemaPagination
          :page="currentPage"
          :page-size="pageSize"
          :total="totalRecords"
          :loading="isDataLoading"
          @page-change="handlePageChange"
        />
        <div class="dialog-footer-actions">
          <ElButton v-if="popupStack.length > 0" size="small" @click="handleCloseAll">
            关闭全部
          </ElButton>
          <ElButton @click="handleClose">关闭</ElButton>
        </div>
      </div>
    </template>
  </ElDialog>
</template>

<style scoped>
.dialog-error {
  padding: var(--sg-spacing-20);
  text-align: center;
  color: var(--sg-color-danger);
}
.dialog-body {
  min-height: 300px;
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-2);
  flex: 1;
  overflow: hidden;
}
.popup-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sg-spacing-6);
  padding: var(--sg-spacing-1) 0;
  flex-shrink: 0;
  flex-wrap: wrap;
  min-height: 32px;
}
.popup-toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-4);
  flex-shrink: 0;
}
.popup-toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-4);
  flex-shrink: 0;
}
.popup-toolbar-right :deep(.schema-filter-bar) {
  padding: 0;
  border: none;
  background: transparent;
}
.popup-toolbar-right :deep(.filter-bar-header) {
  padding: 0;
  border: none;
  background: transparent;
}
.popup-list-view {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  overflow: hidden;
}
.popup-card-view {
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-6);
  flex: 1;
}
.popup-card-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--sg-text-color-secondary);
}
.popup-card-navigator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sg-spacing-6);
  padding: var(--sg-spacing-4) 0;
  flex-shrink: 0;
}
.popup-card-info {
  font-size: var(--sg-font-size-lg);
  color: var(--sg-text-color-regular);
}
.popup-card-total {
  color: var(--sg-text-color-secondary);
}
.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.dialog-footer-actions {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-4);
}
.aggregation-bar {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-12);
  padding: var(--sg-spacing-4) 0;
  border-top: 1px solid var(--sg-border-color-light);
  font-size: var(--sg-font-size-base);
  flex-shrink: 0;
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
</style>

<style>
.popup-dialog.el-dialog {
  height: 90vh;
  display: flex;
  flex-direction: column;
}
.popup-dialog .el-dialog__body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
