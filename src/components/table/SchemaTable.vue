<script setup lang="ts">
import { computed } from 'vue'
import { usePermission } from '@/composables/usePermission'
import VxeTableWrapper from './VxeTableWrapper.vue'
import type { WrapperColumn } from './VxeTableWrapper.vue'
import type { ModuleSchema, FieldSchema, ColumnConfig, RecordEntity, SortParam, FilterClause } from '@/types'
import { relationService } from '@/services/api/relationService'
import { flattenRecordRow } from '@/utils/recordRow'

const props = defineProps<{
  schema: ModuleSchema
  rows: RecordEntity[]
  viewConfig: ColumnConfig[]
  sortState?: SortParam | null
  editable?: boolean
  selectedRowId?: string | null
  loading?: boolean
  height?: string | number
  maxHeight?: string | number
  fixedRowCount?: number
  filterClauses?: FilterClause[]
  /** 是否渲染行首复选框列（批量操作） */
  showSelection?: boolean
}>()

const emit = defineEmits<{
  'sort-change': [payload: { field: string; order: 'asc' | 'desc' | null }]
  'filter-change': [payload: { field: string; clause: FilterClause | null }]
  'cell-edit': [payload: { rowId: string; field: string; value: unknown; oldValue: unknown; mode: string; source: string }]
  'open-quick-create': [payload: { field: string; targetModuleId: string }]
  'row-add': [payload: void]
  'row-remove': [payload: { rowId: string }]
  'lock-column': [payload: { field: string; direction: 'left' | 'right' | 'none' }]
  'formula-detail-open': [payload: { field: string; rowId: string }]
  'column-drag-end': [payload: { columns: any[]; newOrder: string[] }]
  'row-action': [payload: { rowId: string; field: string; actionId: string }]
  'row-click': [payload: { rowId: string }]
  'cell-click': [payload: { field: string; rowId: string | null }]
  'open-relation-editor': [payload: { field: string; fieldSchema: FieldSchema; recordId: string; moduleId: string }]
  'selection-change': [rowIds: string[]]
}>()

const permission = usePermission()

const columns = computed<WrapperColumn[]>(() => {
  const configMap = new Map(props.viewConfig.map(c => [c.field, c]))
  const result: WrapperColumn[] = []

  props.schema.fields.forEach((field: FieldSchema) => {
    const config = configMap.get(field.key)
    const isVisible = permission.isFieldVisible(field.key)
    const isAction = field.type === 'action' && !!field.rowAction
    const isRelation = field.type === 'one-to-many' || field.type === 'many-to-many' || field.type === 'reverse-ref'

    let formatter: ((params: any) => string) | undefined
    if (isAction) {
      formatter = () => field.rowAction?.label || field.label
    } else if (isRelation) {
      formatter = (params: any) => {
        const summary = (params.row as Record<string, unknown>)?.[`__rel_${field.key}`] as string
        return summary || (field.type === 'reverse-ref' ? '📋 无源单据' : '🔗 无关联')
      }
    }

    const booleanCellClass = field.type === 'boolean'
      ? ({ value }: { value: unknown }) => value ? (field.trueLabelClass || '') : (field.falseLabelClass || '')
      : undefined

    result.push({
      field: field.key,
      title: isAction ? (field.rowAction?.label || field.label) : field.label,
      // action 的 width 仅作占位：操作列总宽由 VxeTableWrapper 按按钮实测文本自适应计价，不读本值。
      // 数据列未声明 width 时走 min-width 通道：vxe 只把表格剩余宽度分给带 min-width 的列
      //（仅省略 width 得到 120 默认宽 + 右侧空白），宽表至少声明一个无 width 字段吃满容器
      width: isAction ? (field.width ?? 48) : (config?.width ?? field.width),
      minWidth: !isAction && !(config?.width ?? field.width) ? 120 : undefined,
      fixed: config?.fixed ?? field.fixed,
      sortable: isAction ? false : (field.sortable && config?.sortable !== false),
      visible: isVisible && (config?.visible ?? true),
      align: 'center',
      formatter,
      isAction,
      actionDanger: isAction && (field.rowAction?.type === 'delete' || field.rowAction?.danger === true),
      actionVisibleWhen: field.rowAction?.visibleWhen,
      isRelation,
      cellClass: booleanCellClass,
      fieldType: field.type,
      targetModule: field.targetModule,
      quickCreate: field.quickCreate,
      filterCandidates: field.filterCandidates,
      readonly: field.readonly,
      editMode: field.editMode,
      selectOptions: field.options?.map(o => ({ label: o.label, value: o.value, color: o.color })),
      statusMap: field.statusMap,
      trueLabel: field.trueLabel,
      falseLabel: field.falseLabel,
      trueLabelClass: field.trueLabelClass,
      falseLabelClass: field.falseLabelClass,
      highlightStyle: field.highlightStyle,
      decimal: field.decimal,
      decimalMode: field.decimalMode,
      maxDecimal: field.maxDecimal,
    })
  })
  const orderMap = new Map(props.viewConfig.map(c => [c.field, c.order]))
  result.sort((a, b) => {
    const oa = orderMap.get(a.field) ?? 999
    const ob = orderMap.get(b.field) ?? 999
    return oa - ob
  })
  return result
})

const tableData = computed(() => {
  const relationFields = props.schema.fields.filter(
    f => f.type === 'one-to-many' || f.type === 'many-to-many' || f.type === 'reverse-ref',
  )

  return props.rows.map(r => {
    const row: Record<string, unknown> = flattenRecordRow(r)

    for (const rf of relationFields) {
      const fieldKey = rf.key
      let relations = relationService.getRelations(props.schema.id, r.id, fieldKey)
      if (rf.type === 'reverse-ref') {
        const rfk = rf.reverseRefConfig?.relationFieldKey ?? fieldKey
        relations = relationService.getTargetRelations(props.schema.id, r.id, rfk)
      }

      if (relations.length === 0) {
        row[`__rel_${fieldKey}`] = rf.type === 'reverse-ref' ? '📋 无源单据' : '🔗 无关联'
        continue
      }

      const parts: string[] = []
      for (const rel of relations) {
        if (rf.type === 'reverse-ref') {
          parts.push(rel.sourceRecordId)
        } else {
          const extras = rf.relationConfig?.extraFields?.map(ef => {
            const v = rel.extraFields[ef.key]
            if (ef.type === 'currency' && typeof v === 'number') return `¥${v.toFixed(0)}`
            if (ef.type === 'select') return ef.options?.find(o => o.value === v)?.label ?? String(v ?? '')
            return v != null ? String(v) : ''
          }).filter(Boolean).join(' ') || ''
          parts.push(`${rel.targetRecordId}${extras ? ' ' + extras : ''}`)
        }
      }
      row[`__rel_${fieldKey}`] = `${relations.length}笔: ` + parts.join(', ')
    }

    return row
  })
})

function handleSortChange(payload: { field: string; order: 'asc' | 'desc' | null }): void {
  emit('sort-change', payload)
}

function handleInlineEdit(payload: { row: Record<string, unknown>; field: string; value: unknown; oldValue: unknown }): void {
  const rowId = payload.row._recordId as string
  const val = payload.value
  const old = payload.oldValue
  if (val !== old) {
    emit('cell-edit', {
      rowId,
      field: payload.field,
      value: val,
      oldValue: old,
      mode: 'cell',
      source: 'user',
    })
  }
}

function handleCellDblclick({ column }: { row: Record<string, unknown>; column: any }): void {
  const field = column.field
  const fieldSchema = props.schema.fields.find(f => f.key === field)
  if (!fieldSchema) return

  if (fieldSchema.type === 'fk' && fieldSchema.targetModule) {
    emit('open-quick-create', { field, targetModuleId: fieldSchema.targetModule })
  }
}

function handleRowClick({ row }: { row: Record<string, unknown>; rowIndex: number }): void {
  const rowId = row._recordId as string
  if (!rowId) return
  emit('row-click', { rowId })
}

function handleCellClick(payload: { row: Record<string, unknown>; column: { field: string } }): void {
  emit('cell-click', {
    field: payload.column.field,
    rowId: (payload.row._recordId as string | undefined) ?? null,
  })
}

function handleRelationClick({ row, column }: { row: Record<string, unknown>; column: any }): void {
  const field = column.field
  const fieldSchema = props.schema.fields.find(f => f.key === field)
  if (!fieldSchema) return

  emit('open-relation-editor', {
    field: fieldSchema.key,
    fieldSchema,
    recordId: row._recordId as string,
    moduleId: props.schema.id,
  })
}

function handleRowAction(payload: { row: Record<string, unknown>; actionId: string }): void {
  const rowId = payload.row._recordId as string
  emit('row-action', { rowId, field: payload.actionId, actionId: payload.actionId })
}
</script>

<template>
  <div class="schema-table">
    <VxeTableWrapper
      :module-id="schema.id"
      :data="tableData"
      :columns="columns"
      :loading="loading"
      :height="height"
      :max-height="maxHeight"
      :editable="editable"
      :selected-row-id="selectedRowId"
      :fixed-row-count="fixedRowCount"
      :filter-clauses="filterClauses"
      :show-selection="showSelection"
      :sort-config="sortState ? { field: sortState.field, order: sortState.order } : undefined"
      :column-draggable="true"
      @sort-change="handleSortChange"
      @filter-change="(payload: { field: string; clause: FilterClause | null }) => emit('filter-change', payload)"
      @row-click="handleRowClick"
      @cell-click="handleCellClick"
      @inline-edit="handleInlineEdit"
      @cell-dblclick="handleCellDblclick"
      @relation-click="handleRelationClick"
      @column-drag-end="(payload: { columns: any[]; newOrder: string[] }) => emit('column-drag-end', payload)"
      @row-action="handleRowAction"
      @selection-change="(ids: string[]) => emit('selection-change', ids)"
    />
  </div>
</template>

<style scoped>
.schema-table {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>
