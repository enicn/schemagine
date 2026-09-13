<script setup lang="ts">
import { ref, computed, reactive, nextTick, onUnmounted } from 'vue'
import { ElButton, ElCheckbox, ElMessage } from 'element-plus'
import { useRecords, useSchemaMeta, useRuntimeContext } from '@/composables/instanceState'
import { useRuntimeCacheStore } from '@/stores/runtimeCacheStore'
import { useDraftLifecycle } from '@/composables/useDraftLifecycle'
import { useFormula } from '@/composables/useFormula'
import { candidateService } from '@/services/api/candidateService'
import FieldEditorFactory from '@/components/field/FieldEditorFactory.vue'
import FormulaDisplay from '@/components/field/FormulaDisplay.vue'
import ColumnSettingsPopover from '@/components/table/ColumnSettingsPopover.vue'
import PasteFromExcelDialog from '@/components/create/PasteFromExcelDialog.vue'
import { useMounted } from '@/composables/useMounted'
import { isFieldEditableInContext, isFieldVisibleInContext } from '@/utils/condition'
import { isImportableField } from '@/utils/clipboardImport'
import type { FieldSchema, DraftRecord, ColumnConfig } from '@/types'

defineProps<{
  submitting?: boolean
}>()

const emit = defineEmits<{
  save: [payload: void]
  'save-and-continue': [payload: void]
  cancel: [payload: void]
  'draft-change': [payload: { drafts: DraftRecord[]; changedIndex?: number }]
  'lock-column': [payload: { field: string; direction: 'left' | 'right' | 'none' }]
}>()

const recordStore = useRecords()
const schemaMeta = useSchemaMeta()
const lifecycle = useDraftLifecycle()
const formula = useFormula()
const { isMounted } = useMounted()
const runtimeContext = useRuntimeContext()

const draftRows = computed(() => recordStore.draftRows)

const columnConditionRecord = computed<Record<string, unknown>>(() => {
  return draftRows.value[0]?.fields ?? {}
})

const fieldSchemas = computed<FieldSchema[]>(() => {
  const ctx = { record: columnConditionRecord.value, global: runtimeContext.global }
  return schemaMeta.visibleFields
    .filter(f => !f.readonly || f.type === 'formula')
    .filter(f => isFieldVisibleInContext(f, ctx))
})

const allFieldSchemas = computed<FieldSchema[]>(() => {
  return schemaMeta.schema?.fields ?? []
})

function buildDefaultColumnConfigs(fields: FieldSchema[]): ColumnConfig[] {
  // 操作列（type:'action'）为标准数据操作，固定渲染，不参与列设置
  return fields.filter(f => f.type !== 'action').map((f, i) => ({
    field: f.key,
    width: f.width || 120,
    visible: true,
    order: i,
    sortable: !!f.sortable,
  }))
}

const columnConfigs = ref<ColumnConfig[]>([])

const unhideableFields = computed<Set<string>>(() => {
  const keys = new Set<string>()
  const fields = schemaMeta.schema?.fields ?? []
  for (const f of fields) {
    if (f.required) {
      keys.add(f.key)
    }
  }
  const configs = formula.formulaConfigs.value
  for (const cfg of configs) {
    keys.add(cfg.fieldKey)
    for (const dep of cfg.dependencies) {
      keys.add(dep)
    }
  }
  return keys
})

const columnConfigMap = computed(() => {
  const map = new Map<string, ColumnConfig>()
  for (const c of columnConfigs.value) {
    map.set(c.field, c)
  }
  return map
})

const displayFields = computed<FieldSchema[]>(() => {
  const base = fieldSchemas.value

  if (columnConfigs.value.length === 0) {
    columnConfigs.value = buildDefaultColumnConfigs(base)
  }

  const configMap = new Map<string, ColumnConfig>()
  for (const c of columnConfigs.value) {
    configMap.set(c.field, c)
  }

  const configs = [...columnConfigs.value].sort((a, b) => a.order - b.order)
  const result: FieldSchema[] = []

  for (const config of configs) {
    if (!config.visible) continue
    const field = base.find(f => f.key === config.field)
    if (field) {
      result.push(field)
    }
  }

  return result
})

function getColumnWidthStyle(fieldKey: string): Record<string, string> {
  const config = columnConfigMap.value.get(fieldKey)
  const w = config?.width ?? 120
  return { width: w + 'px', minWidth: w + 'px' }
}

function handleColumnSettingsSave(columns: ColumnConfig[]): void {
  columnConfigs.value = columns
}

function handleColumnSettingsReset(): void {
  columnConfigs.value = buildDefaultColumnConfigs(fieldSchemas.value)
}

const showFormulaChain = ref(false)

const lockedColumns = reactive(new Set<string>())

const lifecycleContext = computed(() => lifecycle.buildContext(lockedColumns))

const aggregations = computed(() => lifecycle.computeAggregations(lifecycleContext.value))

const totalCount = computed(() => aggregations.value[0]?.totalCount ?? 0)

const selectedIds = ref<Set<string>>(new Set())

const isAllSelected = computed(() => {
  return draftRows.value.length > 0 && draftRows.value.every(d => selectedIds.value.has(d.tempId))
})

const isIndeterminate = computed(() => {
  const someSelected = draftRows.value.some(d => selectedIds.value.has(d.tempId))
  return someSelected && !isAllSelected.value
})

const hasSelection = computed(() => selectedIds.value.size > 0)

function toggleAll(): void {
  if (isAllSelected.value) {
    selectedIds.value.clear()
  } else {
    selectedIds.value = new Set(draftRows.value.map(d => d.tempId))
  }
}

function toggleRow(tempId: string): void {
  const next = new Set(selectedIds.value)
  if (next.has(tempId)) {
    next.delete(tempId)
  } else {
    next.add(tempId)
  }
  selectedIds.value = next
}

async function addRow(): Promise<void> {
  const newDraft: DraftRecord = {
    tempId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fields: {},
    isValid: true,
  }
  const newIndex = recordStore.addDraftRow(newDraft)

  if (lockedColumns.size > 0 && newIndex > 0) {
    const prevRow = recordStore.draftRows[newIndex - 1]
    if (prevRow) {
      for (const fieldKey of lockedColumns) {
        await resolveFkLabel(fieldKey, prevRow.fields[fieldKey])
      }
    }
  }

  lifecycle.applyDefaults(lifecycleContext.value, newIndex)
  lifecycle.evaluateFormulas(lifecycleContext.value, [newIndex])

  emit('draft-change', {
    drafts: recordStore.draftRows,
    changedIndex: newIndex,
  })
}

function removeRow(index: number): void {
  const removed = recordStore.draftRows[index]
  if (removed) {
    selectedIds.value.delete(removed.tempId)
  }
  recordStore.removeDraftRow(index)

  emit('draft-change', {
    drafts: draftRows.value,
  })
}

function batchDelete(): void {
  if (selectedIds.value.size === 0) return

  const remaining = draftRows.value.filter(d => !selectedIds.value.has(d.tempId))
  recordStore.setDraftRows(remaining)
  selectedIds.value.clear()

  emit('draft-change', {
    drafts: draftRows.value,
  })
}

function handleFieldUpdate(index: number, fieldKey: string, value: unknown): void {
  if (lockedColumns.has(fieldKey)) return

  recordStore.updateDraftField(index, fieldKey, value)
  lifecycle.evaluateFormulas(lifecycleContext.value, [index])

  emit('draft-change', {
    drafts: draftRows.value,
    changedIndex: index,
  })
}

function isCellVisible(field: FieldSchema, record: Record<string, unknown>): boolean {
  return isFieldVisibleInContext(field, { record, global: runtimeContext.global })
}

function isCellEditable(field: FieldSchema, record: Record<string, unknown>): boolean {
  return isFieldEditableInContext(field, { record, global: runtimeContext.global })
}

async function toggleLock(fieldKey: string): Promise<void> {
  if (lockedColumns.has(fieldKey)) {
    lockedColumns.delete(fieldKey)
    emit('lock-column', { field: fieldKey, direction: 'none' })
  } else {
    lockedColumns.add(fieldKey)

    const rows = recordStore.draftRows
    for (const row of rows) {
      const value = row?.fields[fieldKey]
      if (value !== null && value !== undefined && value !== '') {
        await resolveFkLabel(fieldKey, value)
        break
      }
    }

    lifecycle.fillLockedValues(lifecycleContext.value)
    lifecycle.evaluateFormulas(lifecycleContext.value)

    emit('lock-column', { field: fieldKey, direction: 'left' })
  }
}

function toggleFormulaChain(): void {
  showFormulaChain.value = !showFormulaChain.value
}

function handleSave(): void {
  if (draftRows.value.length === 0) {
    ElMessage.warning('请至少添加一条记录')
    return
  }
  emit('save')
}

function handleSaveAndContinue(): void {
  if (draftRows.value.length === 0) {
    ElMessage.warning('请至少添加一条记录')
    return
  }
  emit('save-and-continue')
}

function handleCancel(): void {
  recordStore.clearDrafts()
  lockedColumns.clear()
  selectedIds.value.clear()
  emit('cancel')
}

const pasteDialogVisible = ref(false)

const importableFields = computed<FieldSchema[]>(() => fieldSchemas.value.filter(isImportableField))

/** 仅剩一行且全为初始状态（无手填值，只可能有默认值）时，导入直接替换该空行 */
function isPristineSingleRow(): boolean {
  if (draftRows.value.length !== 1) return false
  const row = draftRows.value[0]
  if (!row) return false
  for (const field of fieldSchemas.value) {
    const value = row.fields[field.key]
    if (value === undefined || value === null || value === '') continue
    if (field.defaultValue !== undefined && value === field.defaultValue) continue
    if ((field.type === 'date' || field.type === 'datetime') && field.defaultDateOffset !== undefined) continue
    return false
  }
  return true
}

/** 把粘贴的 fk 文本解析为候选值：label 精确命中取其 value，否则保留原文待用户修正 */
async function resolveFkValue(targetModule: string, label: string): Promise<string> {
  try {
    const res = await candidateService.query({ targetModule, keyword: label, page: 1, pageSize: 50 })
    if (res.success) {
      const hit = res.data.options.find(opt => opt.label === label)
      if (hit) return String(hit.value)
    }
  } catch {
    // 查询失败时保留原文
  }
  return label
}

async function handlePasteImport(payload: { rows: Array<Record<string, unknown>> }): Promise<void> {
  const rows = payload.rows
  if (rows.length === 0) return

  const fkFields = importableFields.value.filter(f => f.type === 'fk' && f.targetModule)
  const resolveCache = new Map<string, string>()
  for (const row of rows) {
    for (const field of fkFields) {
      const raw = row[field.key]
      if (typeof raw !== 'string' || raw === '') continue
      const cacheKey = `${field.targetModule}::${raw}`
      if (!resolveCache.has(cacheKey)) {
        resolveCache.set(cacheKey, await resolveFkValue(field.targetModule as string, raw))
      }
      row[field.key] = resolveCache.get(cacheKey)
    }
  }

  const replaceInitial = isPristineSingleRow()
  const startIndex = replaceInitial ? 0 : recordStore.draftRows.length
  if (replaceInitial) {
    recordStore.setDraftRows([])
    selectedIds.value.clear()
  }

  for (const fields of rows) {
    recordStore.addDraftRow({
      tempId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fields: { ...fields },
      isValid: true,
    })
  }

  const context = lifecycle.buildContext(lockedColumns)
  for (let i = startIndex; i < recordStore.draftRows.length; i++) {
    lifecycle.applyDefaults(context, i)
  }
  for (let i = startIndex; i < recordStore.draftRows.length; i++) {
    for (const field of fkFields) {
      const value = recordStore.draftRows[i]?.fields[field.key]
      if (value !== null && value !== undefined && value !== '') {
        await resolveFkLabel(field.key, value)
      }
    }
  }
  lifecycle.evaluateFormulas(context)

  emit('draft-change', { drafts: draftRows.value })
  ElMessage.success(`已从剪贴板导入 ${rows.length} 行`)
}

const dragAddActive = ref(false)
const dragStartY = ref(0)
const pendingRowsCount = ref(0)
const hasDragged = ref(false)
const actualRowHeight = ref(0)
const DRAG_THRESHOLD = 40

const tableBodyRef = ref<HTMLElement | null>(null)

function measureRowHeight(): void {
  const tbody = tableBodyRef.value
  if (!tbody) return
  const firstRow = tbody.querySelector('tr:not(.skeleton-row)') as HTMLElement | null
  if (firstRow) {
    actualRowHeight.value = firstRow.getBoundingClientRect().height
  }
}

function startDragAdd(event: MouseEvent): void {
  dragAddActive.value = true
  dragStartY.value = event.clientY
  pendingRowsCount.value = 0
  hasDragged.value = false

  nextTick(measureRowHeight)

  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragUp)
}

function onDragMove(event: MouseEvent): void {
  if (!dragAddActive.value) return
  const delta = event.clientY - dragStartY.value
  if (delta >= DRAG_THRESHOLD) {
    hasDragged.value = true
    pendingRowsCount.value = Math.floor(delta / DRAG_THRESHOLD)
  } else {
    pendingRowsCount.value = 0
  }
}

function onDragUp(): void {
  dragAddActive.value = false
  if (hasDragged.value && pendingRowsCount.value > 0) {
    for (let i = 0; i < pendingRowsCount.value; i++) {
      addRow()
    }
  } else if (!hasDragged.value) {
    addRow()
  }
  pendingRowsCount.value = 0
  hasDragged.value = false
  actualRowHeight.value = 0
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragUp)
}

async function resolveFkLabel(fieldKey: string, value: unknown): Promise<void> {
  const field = schemaMeta.getField(fieldKey)
  if (!field || field.type !== 'fk' || !field.targetModule) return
  if (value === null || value === undefined) return

  const cacheStore = useRuntimeCacheStore()
  const targetModule = field.targetModule

  const cached = cacheStore.getCandidates(targetModule, '')
  if (cached && cached.some(opt => opt.value === value)) return

  const res = await candidateService.query({
    targetModule,
    keyword: String(value),
    page: 1,
    pageSize: 50,
  })
  if (!isMounted.value) return
  if (res.success && res.data.options.length > 0) {
    const existing = cacheStore.getCandidates(targetModule, '') || []
    const merged = [...existing]
    for (const opt of res.data.options) {
      if (!merged.some(o => o.value === opt.value)) {
        merged.push(opt)
      }
    }
    cacheStore.setCandidates(targetModule, '', merged)
  }
}

function initializeDrafts(): void {
  if (draftRows.value.length === 0) {
    addRow()
  }
}

initializeDrafts()

onUnmounted(() => {
  if (dragAddActive.value) {
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', onDragUp)
    dragAddActive.value = false
  }
})
</script>

<template>
  <div class="create-view">
    <div class="create-topbar">
      <ElButton
        size="small"
        class="paste-import-btn"
        @click="pasteDialogVisible = true"
      >
        从Excel粘贴
      </ElButton>
      <ColumnSettingsPopover
        :fields="allFieldSchemas"
        :columns="columnConfigs"
        :disabled-fields="unhideableFields"
        @save="handleColumnSettingsSave"
        @reset="handleColumnSettingsReset"
      >
        <ElButton size="small">
          列设置
        </ElButton>
      </ColumnSettingsPopover>
    </div>
    <div class="create-table-wrapper">
      <table class="create-table">
        <thead>
          <tr>
            <th class="row-checkbox">
              <ElCheckbox
                :model-value="isAllSelected"
                :indeterminate="isIndeterminate"
                size="small"
                @change="toggleAll"
              />
            </th>
            <th class="row-index">#</th>
            <th class="row-actions">操作</th>
            <th
              v-for="field in displayFields"
              :key="field.key"
              :class="{ 'lock-column': lockedColumns.has(field.key) }"
              :style="getColumnWidthStyle(field.key)"
            >
              <div class="column-header">
                <span>{{ field.label }}</span>
                <ElButton
                  v-if="field.type === 'formula'"
                  size="small"
                  link
                  :type="showFormulaChain ? 'primary' : 'default'"
                  class="formula-toggle-btn"
                  @click="toggleFormulaChain"
                >
                  {{ showFormulaChain ? '隐藏公式' : '公式' }}
                </ElButton>
                <ElButton
                  v-else
                  size="small"
                  link
                  :type="lockedColumns.has(field.key) ? 'primary' : 'default'"
                  class="lock-btn"
                  @click="toggleLock(field.key)"
                >
                  {{ lockedColumns.has(field.key) ? '已锁定' : '锁定' }}
                </ElButton>
              </div>
            </th>
          </tr>
        </thead>
        <tbody ref="tableBodyRef">
          <tr
            v-for="(draft, index) in draftRows"
            :key="draft.tempId"
            :class="{ 'row-selected': selectedIds.has(draft.tempId) }"
          >
            <td class="row-checkbox">
              <ElCheckbox
                :model-value="selectedIds.has(draft.tempId)"
                size="small"
                @change="toggleRow(draft.tempId)"
              />
            </td>
            <td class="row-index">{{ index + 1 }}</td>
            <td class="row-actions">
              <ElButton
                size="small"
                type="danger"
                link
                :disabled="draftRows.length <= 1"
                @click="removeRow(index)"
              >
                删除
              </ElButton>
            </td>
            <td v-for="field in displayFields" :key="field.key" :style="getColumnWidthStyle(field.key)">
              <template v-if="isCellVisible(field, draft.fields)">
                <div v-if="field.type === 'formula'" class="formula-cell">
                  <FormulaDisplay
                    :field-schema="field"
                    :field-schemas="allFieldSchemas"
                    :model-value="draft.fields[field.key]"
                    :record="draft.fields"
                    :expanded="showFormulaChain"
                  />
                </div>
                <FieldEditorFactory
                  v-else
                  :field-schema="field"
                  :model-value="draft.fields[field.key]"
                  mode="edit"
                  :disabled="!isCellEditable(field, draft.fields)"
                  :readonly="lockedColumns.has(field.key)"
                  @update:model-value="(val: unknown) => handleFieldUpdate(index, field.key, val)"
                />
              </template>
            </td>
          </tr>
          <template v-for="n in pendingRowsCount" :key="'skeleton-' + n">
             <tr v-if="dragAddActive && hasDragged" class="skeleton-row" :style="{ height: actualRowHeight + 'px' }">
               <td class="row-checkbox"></td>
               <td class="row-index"><span class="skeleton-bar skeleton-index"></span></td>
               <td class="row-actions"><span class="skeleton-bar skeleton-btn"></span></td>
               <td v-for="field in displayFields" :key="field.key">
                 <span class="skeleton-bar"></span>
               </td>
             </tr>
           </template>
        </tbody>
        <tfoot>
          <tr>
            <td :colspan="displayFields.length + 3" class="add-row-cell">
              <div
                class="add-row-btn"
                :class="{ 'is-dragging': dragAddActive }"
                @mousedown="startDragAdd"
              >
                <span class="add-row-icon">+</span>
                <span class="add-row-label">
                  <template v-if="dragAddActive && hasDragged">
                    松开添加
                  </template>
                  <template v-else-if="dragAddActive">
                    向下拖动
                  </template>
                  <template v-else>
                    新增行
                  </template>
                </span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="create-toolbar">
      <div class="toolbar-left">
        <ElButton
          v-if="hasSelection"
          size="small"
          type="danger"
          plain
          @click="batchDelete"
        >
          删除选中 ({{ selectedIds.size }})
        </ElButton>
      </div>
      <div class="toolbar-aggregations" v-if="aggregations.length > 0">
        <div class="aggregation-item">
          <span class="agg-label">总行数</span>
          <span class="agg-number">{{ totalCount }}</span>
        </div>
        <div class="aggregation-divider"></div>
        <div class="aggregation-item" v-for="item in aggregations" :key="item.fieldKey">
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
      <div class="toolbar-right">
        <ElButton size="small" @click="handleCancel">取消</ElButton>
        <ElButton
          size="small"
          type="primary"
          :loading="submitting"
          @click="handleSave"
        >
          保存
        </ElButton>
        <ElButton
          size="small"
          type="success"
          :loading="submitting"
          @click="handleSaveAndContinue"
        >
          保存并继续
        </ElButton>
      </div>
    </div>

    <PasteFromExcelDialog
      v-model:visible="pasteDialogVisible"
      :fields="importableFields"
      @confirm="handlePasteImport"
    />
  </div>
</template>

<style scoped>
.create-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--sg-spacing-8);
}
.create-table-wrapper {
  flex: 1;
  overflow: auto;
  border: 1px solid var(--sg-border-color-light);
  border-radius: var(--sg-radius-md);
}
.create-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--sg-font-size-md);
}
.create-table th {
  background-color: var(--sg-fill-color-light);
  padding: var(--sg-spacing-4) var(--sg-spacing-6);
  text-align: left;
  border-bottom: 2px solid var(--sg-border-color-light);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: var(--sg-z-index-base);
}
.create-table th.lock-column {
  background-color: var(--sg-color-primary-light-9);
}
.create-table td {
  padding: var(--sg-spacing-3) var(--sg-spacing-6);
  border-bottom: 1px solid var(--sg-border-color-lighter);
  vertical-align: top;
}
.create-table tr:hover td {
  background-color: var(--sg-fill-color-light);
}
.create-table tr.row-selected td {
  background-color: var(--sg-color-primary-light-9);
}
.row-checkbox {
  width: 40px;
  text-align: center;
}
.row-index {
  width: 40px;
  text-align: center;
  color: var(--sg-text-color-secondary);
}
.row-actions {
  width: 60px;
  text-align: center;
}
.column-header {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
}
.lock-btn {
  font-size: var(--sg-font-size-sm);
}
.formula-toggle-btn {
  font-size: var(--sg-font-size-sm);
}
.formula-cell {
  padding: var(--sg-spacing-2) 0;
}
.add-row-cell {
  padding: 0 !important;
  border-bottom: none;
}
.add-row-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sg-spacing-3);
  padding: var(--sg-spacing-5) 0;
  cursor: pointer;
  color: var(--sg-text-color-secondary);
  border-top: 1px dashed var(--sg-border-color);
  transition: all var(--sg-duration-fast) ease;
  user-select: none;
}
.add-row-btn:hover {
  background-color: var(--sg-color-primary-light-9);
  color: var(--sg-color-primary);
  border-top-color: var(--sg-color-primary);
}
.add-row-btn.is-dragging {
  background-color: var(--sg-color-primary-light-8);
  color: var(--sg-color-primary);
  border-top-color: var(--sg-color-primary);
}
.add-row-icon {
  font-size: var(--sg-font-size-xl);
  font-weight: 700;
  line-height: 1;
}
.add-row-label {
  font-size: var(--sg-font-size-md);
}
.create-toolbar {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-6);
  padding: var(--sg-spacing-4) 0;
  border-top: 1px solid var(--sg-border-color-light);
  flex-shrink: 0;
}
.create-topbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sg-spacing-3);
  padding: 0 0 var(--sg-spacing-4) 0;
  flex-shrink: 0;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-4);
}
.toolbar-aggregations {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-12);
  font-size: var(--sg-font-size-base);
  margin-left: var(--sg-spacing-12);
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-4);
  margin-left: auto;
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
.skeleton-row td {
  padding: 0 var(--sg-spacing-6);
  border-bottom: 1px solid var(--sg-border-color-lighter);
  vertical-align: middle;
  background: var(--sg-fill-color-lighter);
}
.skeleton-bar {
  display: block;
  height: 20px;
  border-radius: var(--sg-radius-md);
  background: linear-gradient(90deg, var(--sg-skeleton-color) 25%, var(--sg-skeleton-highlight) 50%, var(--sg-skeleton-color) 75%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.2s ease-in-out infinite;
}
.skeleton-index {
  width: 20px;
  margin: 0 auto;
}
.skeleton-btn {
  width: 28px;
  margin: 0 auto;
}
@keyframes skeleton-pulse {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
