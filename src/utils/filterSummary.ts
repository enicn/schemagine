import type { FieldSchema, FilterClause, FilterOperator } from '@/types'
import { getOperatorLabel } from './filterLabels'

/**
 * 筛选条件摘要(docs/19 批次 E):ListView 状态条与 SchemaFilterBar 标签共用的
 * 单一格式化口径——日期格式化、枚举/布尔/外键取标签、between 区间用「~」连接。
 * 之前两处各自实现导致口径漂移(状态条 between 输出逗号连接)。
 */

export interface FilterSummaryItem {
  fieldKey: string
  label: string
  operator: FilterOperator
  operatorLabel: string
  valueLabel: string
}

function formatDateValue(value: unknown, isDateTime: boolean): string {
  if (value == null || value === '') return ''
  const d = value instanceof Date ? value : new Date(String(value))
  if (isNaN(d.getTime())) return String(value)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  if (isDateTime) {
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`
  }
  return `${yyyy}-${mm}-${dd}`
}

function getOptionLabel(field: FieldSchema, value: unknown): string {
  if (!field.options) return String(value ?? '')
  const opt = field.options.find(o => o.value === value)
  return opt ? opt.label : String(value ?? '')
}

export function buildFilterSummaryItems(
  clauses: FilterClause[],
  fields: FieldSchema[],
  resolveFkLabel?: (field: FieldSchema, value: unknown) => string,
): FilterSummaryItem[] {
  const fieldMap = new Map(fields.map(f => [f.key, f]))

  return clauses.map((clause) => {
    const field = fieldMap.get(clause.field)
    const label = field?.label ?? clause.field
    const operator = clause.operator
    const operatorLabel = getOperatorLabel(operator)

    let valueLabel = ''

    if (operator === 'isNull') {
      valueLabel = '空'
    } else if (operator === 'isNotNull') {
      valueLabel = '非空'
    } else if (operator === 'between' || operator === 'notBetween') {
      const vals = (clause.values as [string, string]) || []
      const isDateTime = field?.type === 'datetime'
      valueLabel = `${formatDateValue(vals[0], isDateTime)} ~ ${formatDateValue(vals[1], isDateTime)}`
    } else if (operator === 'in' || operator === 'notIn') {
      const vals = (clause.values as unknown[]) ?? []
      if (field?.type === 'fk' && resolveFkLabel) {
        valueLabel = vals.map(v => resolveFkLabel(field, v)).join(', ')
      } else {
        valueLabel = vals.map(v => String(v ?? '')).join(', ')
      }
    } else {
      if (field?.type === 'select' || field?.type === 'multi-select' || field?.type === 'status') {
        valueLabel = getOptionLabel(field, clause.value)
      } else if (field?.type === 'boolean') {
        valueLabel = clause.value === true ? '是' : '否'
      } else if (field?.type === 'date') {
        valueLabel = formatDateValue(clause.value, false)
      } else if (field?.type === 'datetime') {
        valueLabel = formatDateValue(clause.value, true)
      } else if ((operator === 'like' || operator === 'notLike') && clause.value) {
        valueLabel = String(clause.value)
      } else {
        valueLabel = String(clause.value ?? '')
      }
    }

    return { fieldKey: clause.field, label, operator, operatorLabel, valueLabel }
  })
}
