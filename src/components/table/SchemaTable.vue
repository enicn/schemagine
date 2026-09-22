<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { usePermission } from '@/composables/usePermission'
import VxeTableWrapper from './VxeTableWrapper.vue'
import type { WrapperColumn } from './VxeTableWrapper.vue'
import type { TableDensity } from './tableDensity'
import type { ModuleSchema, FieldSchema, ColumnConfig, RecordEntity, SortParam, FilterClause, EngineAppearance } from '@/types'
import { relationService } from '@/services/api/relationService'
import { flattenRecordRow } from '@/utils/recordRow'
import { buildRecordTree } from '@/utils/recordTree'
import { buildSameValueSpanMethod } from '@/utils/mergeCells'
import { buildGroupedRows } from '@/utils/recordGroup'
import { t } from '@/locales'

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
  /** 单元格插槽透传（docs/19 B2）：field → 插槽名 */
  cellSlots?: Record<string, string>
  /** 表头插槽透传（docs/19 B2）：field → 插槽名 */
  headerSlots?: Record<string, string>
  /** 密度档位（docs/19 F1）：compact/default/large */
  density?: TableDensity
  /** 外观与格式契约（docs/20）：透传 VxeTableWrapper（边框/值展示），SchemaTable 自身消费 displayStyle 透传 */
  appearance?: EngineAppearance
  /** 行展开插槽名（docs/19 F4）：声明后渲染行首展开列，展开区由宿主同名插槽渲染 */
  expandSlot?: string
  /** 引擎只读形态（SchemaEngine readonly 透传）：内置行级编辑入口随隐藏 */
  readonly?: boolean
  /** 行号续号起点（docs/20 appearance.rowNumbers）：分页场景 (page-1)*pageSize，经 VxeTableWrapper seq-config 续号 */
  rowNumberStart?: number
}>()

const emit = defineEmits<{
  'sort-change': [payload: { field: string; order: 'asc' | 'desc' | null }]
  'filter-change': [payload: { field: string; clause: FilterClause | null }]
  'cell-edit': [payload: { rowId: string; field: string; value: unknown; oldValue: unknown; mode: string; source: string }]
  'open-quick-create': [payload: { field: string; targetModuleId: string }]
  'formula-detail-open': [payload: { field: string; rowId: string }]
  'column-drag-end': [payload: { columns: unknown[]; newOrder: string[] }]
  'row-action': [payload: { rowId: string; field: string; actionId: string }]
  'row-click': [payload: { rowId: string }]
  'cell-click': [payload: { field: string; rowId: string | null }]
  'edit-activated': [payload: { rowId: string; field: string }]
  'edit-closed': [payload: { rowId: string; field: string; value: unknown }]
  'open-relation-editor': [payload: { field: string; fieldSchema: FieldSchema; recordId: string; moduleId: string }]
  'selection-change': [rowIds: string[]]
  'column-width-change': [payload: { field: string; width: number }]
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

    let formatter: ((params: { row?: Record<string, unknown>; cellValue: unknown }) => string) | undefined
    if (isAction) {
      formatter = () => field.rowAction?.label || field.label
    } else if (isRelation) {
      formatter = (params: { row?: Record<string, unknown>; cellValue: unknown }) => {
        const summary = params.row?.[`__rel_${field.key}`] as string
        return summary || (field.type === 'reverse-ref' ? '📋 无源单据' : '🔗 无关联')
      }
    }

    const booleanCellClass = field.type === 'boolean'
      ? ({ value }: { value: unknown }) => value ? (field.trueLabelClass || '') : (field.falseLabelClass || '')
      : undefined

    result.push({
      field: field.key,
      title: isAction ? (field.rowAction?.label || field.label) : field.label,
      fieldOrder: field.order,
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
      actionDanger: isAction && field.rowAction?.type === 'delete',
      rowActionType: isAction ? field.rowAction?.type : undefined,
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
      displayStyle: field.displayStyle,
      trueLabel: field.trueLabel,
      falseLabel: field.falseLabel,
      trueLabelClass: field.trueLabelClass,
      falseLabelClass: field.falseLabelClass,
      highlightStyle: field.highlightStyle,
      decimal: field.decimal,
      decimalMode: field.decimalMode,
      maxDecimal: field.maxDecimal,
      headerGroup: field.group,
      mergeCells: field.mergeCells,
      fieldSchema: field,
    })
  })
  const orderMap = new Map(props.viewConfig.map(c => [c.field, c.order]))
  result.sort((a, b) => {
    // 列序优先级(docs/20):用户列配置 > 字段声明序 fieldOrder > 999(保持 schema 数组序)
    const oa = orderMap.get(a.field) ?? a.fieldOrder ?? 999
    const ob = orderMap.get(b.field) ?? b.fieldOrder ?? 999
    return oa - ob
  })

  // select-then-edit 模式内置行级编辑入口：以保留字段 __rowEdit__ 声明一个操作按钮，
  // 与 schema 声明的 type:'action' 按钮同列渲染（标准操作列）。工具栏「编辑」按钮
  // 已被此行级入口取代——勾选多行再点工具栏编辑语义含糊（只打开第一行），
  // 行级「编辑」逐行直达卡片编辑态。ListView 以 actionId 识别后本地处理，不上抛宿主。
  if (props.schema.listEditMode === 'select-then-edit' && permission.canEdit.value && !props.readonly) {
    result.push({
      field: '__rowEdit__',
      title: t('table.editAction'),
      width: 48,
      sortable: false,
      visible: true,
      align: 'center',
      isAction: true,
    } as WrapperColumn)
  }
  return result
})

// 关联列渲染(IRelationService 读方法异步化后,同步 computed 无法 await):
// 改为 watch 行/-schema 变化异步重建;重建期间沿用上一份 flatRows,完成后原位替换。
const flatRows = ref<Record<string, unknown>[]>([])

async function rebuildFlatRows(): Promise<void> {
  const rows = props.rows
  const relationFields = props.schema.fields.filter(
    f => f.type === 'one-to-many' || f.type === 'many-to-many' || f.type === 'reverse-ref',
  )

  const built = await Promise.all(rows.map(async r => {
    const row: Record<string, unknown> = flattenRecordRow(r)

    for (const rf of relationFields) {
      const fieldKey = rf.key
      const res = rf.type === 'reverse-ref'
        ? await relationService.getTargetRelations(props.schema.id, r.id, rf.reverseRefConfig?.relationFieldKey ?? fieldKey)
        : await relationService.getRelations(props.schema.id, r.id, fieldKey)
      const relations = res.success ? res.data : []

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
  }))

  flatRows.value = built
}

// 行版本签名：undo/redo 回放与批量编辑经 updateRecordField 原地改字段+版本，
// records 数组引用不变（deep:false 的行/-schema watch 不感知）；把版本折进重建
// 触发条件，表格才能同步回放结果（docs/19 H3）。
const rowVersionSignature = computed(() => props.rows.map(r => r.version).join('|'))

watch(
  () => [props.rows, props.schema, rowVersionSignature.value],
  () => { void rebuildFlatRows() },
  { immediate: true, deep: false },
)

const tableData = computed<Record<string, unknown>[]>(() => {
  // 树形数据（docs/19 F2）：schema 声明 parentField 时由平铺行组树（children 挂 childrenField）
  const tree = props.schema.treeConfig
  if (tree?.parentField) {
    return buildRecordTree(flatRows.value, {
      idKey: '_recordId',
      parentField: tree.parentField,
      childrenField: tree.childrenField ?? 'children',
    })
  }
  // 分组小计（docs/19 F6）：声明 groupBy 时插入组行（组值/条数/组内小计）
  const groupBy = props.schema.groupBy
  if (groupBy?.field) {
    return buildGroupedRows(flatRows.value, groupBy)
  }
  return flatRows.value
})

/**
 * 按列 footer 合计（docs/19 F6）：schema 中 aggregation:'sum' 字段的当前结果集合计，
 * 口径与聚合统计条（useAggregation）一致：Number 非 NaN 求和、两位小数舍入。
 */
const footerMethod = computed(() => {
  const sumFields = props.schema.fields.filter(f => f.aggregation === 'sum').map(f => f.key)
  if (sumFields.length === 0) return undefined
  return ({ columns }: { columns: Array<{ field?: string }> }) => {
    let labelPlaced = false
    return [columns.map((c) => {
      if (!c.field) return ''
      if (!labelPlaced) {
        labelPlaced = true
        return t('table.summary.total')
      }
      if (!sumFields.includes(c.field)) return ''
      const sum = flatRows.value.reduce((acc, r) => {
        const v = Number(r[c.field!])
        return isNaN(v) ? acc : acc + v
      }, 0)
      return String(Math.round(sum * 100) / 100)
    })]
  }
})

/**
 * 相同值合并（docs/19 F5）：声明 mergeCells 的字段构建 span-method；
 * 树形模块行集为「可见根行」，与平铺数据语义不同，暂不启用。
 */
const spanMethod = computed(() => {
  const mergeFields = props.schema.fields.filter(f => f.mergeCells).map(f => f.key)
  if (mergeFields.length === 0 || props.schema.treeConfig?.parentField || props.schema.groupBy?.field) return undefined
  return buildSameValueSpanMethod(mergeFields, flatRows.value)
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

function handleCellDblclick({ column }: { row: Record<string, unknown>; column: { field?: string } }): void {
  const field = column.field
  if (!field) return
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

function handleEditActivated(payload: { row: Record<string, unknown>; column: { field: string } }): void {
  emit('edit-activated', {
    rowId: (payload.row._recordId as string | undefined) ?? '',
    field: payload.column.field,
  })
}

function handleEditClosed(payload: { row: Record<string, unknown>; column: { field: string }; value: unknown }): void {
  emit('edit-closed', {
    rowId: (payload.row._recordId as string | undefined) ?? '',
    field: payload.column.field,
    value: payload.value,
  })
}

function handleRelationClick({ row, column }: { row: Record<string, unknown>; column: { field?: string } }): void {
  const field = column.field
  if (!field) return
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

const wrapperRef = ref<InstanceType<typeof VxeTableWrapper> | null>(null)

/** 暴露底层 vxe-table 实例（docs/19 B2） */
defineExpose({
  getTableInstance: () => wrapperRef.value?.getTableInstance() ?? null,
})
</script>

<template>
  <div class="schema-table">
    <VxeTableWrapper
      ref="wrapperRef"
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
      :row-numbers="appearance?.rowNumbers"
      :row-number-start="rowNumberStart"
      :cell-slots="cellSlots"
      :header-slots="headerSlots"
      :density="density"
      :appearance="appearance"
      :expand-slot="expandSlot"
      :span-method="spanMethod"
      :schema-row-rules="schema.rowValidationRules"
      :footer-method="footerMethod"
      :group-by="schema.groupBy"
      :tree-config="schema.treeConfig
        ? { children: schema.treeConfig.childrenField ?? 'children', expandAll: schema.treeConfig.expandAll ?? false }
        : undefined"
      :sort-config="sortState ? { field: sortState.field, order: sortState.order } : undefined"
      :column-draggable="true"
      @sort-change="handleSortChange"
      @column-width-change="(p: { field: string; width: number }) => emit('column-width-change', p)"
      @filter-change="(payload: { field: string; clause: FilterClause | null }) => emit('filter-change', payload)"
      @row-click="handleRowClick"
      @cell-click="handleCellClick"
      @edit-activated="handleEditActivated"
      @edit-closed="handleEditClosed"
      @inline-edit="handleInlineEdit"
      @cell-dblclick="handleCellDblclick"
      @relation-click="handleRelationClick"
      @column-drag-end="(payload: { columns: any[]; newOrder: string[] }) => emit('column-drag-end', payload)"
      @row-action="handleRowAction"
      @selection-change="(ids: string[]) => emit('selection-change', ids)"
    >
      <template v-if="expandSlot" #[expandSlot]="{ row }">
        <slot :name="expandSlot" :row="row" />
      </template>
    </VxeTableWrapper>
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
