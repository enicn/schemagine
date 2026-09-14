import type { FilterClause } from '@/types'

/**
 * FilterClause 求值（mock 与本地数据源 createLocalRecordService 共用，保证同口径）。
 * 从 mockAdapter 原样提取，行为不得分叉；修改时两处数据源同时生效。
 */
export function evaluateFilter(clause: FilterClause, fieldValue: unknown): boolean {
  const { operator, value, values } = clause

  // 空值运算必须先于空值早退分支判定(此前缺失,isNull/isNotNull 落入 default 放行)
  if (operator === 'isNull') return fieldValue == null
  if (operator === 'isNotNull') return fieldValue != null

  if (fieldValue == null) {
    if (operator === 'neq' || operator === 'notLike' || operator === 'notIn' || operator === 'notBetween') {
      return true
    }
    return false
  }

  const strVal = String(fieldValue).toLowerCase()

  switch (operator) {
    case 'eq':
      return fieldValue === value

    case 'neq':
      return fieldValue !== value

    case 'like': {
      if (typeof value !== 'string') return false
      return strVal.includes(value.toLowerCase())
    }

    case 'notLike': {
      if (typeof value !== 'string') return false
      return !strVal.includes(value.toLowerCase())
    }

    case 'in': {
      if (!Array.isArray(values)) return false
      return values.some(v => fieldValue === v)
    }

    case 'notIn': {
      if (!Array.isArray(values)) return false
      return !values.some(v => fieldValue === v)
    }

    case 'between': {
      if (!Array.isArray(values) || values.length < 2) return false
      const lo = values[0] as string | number
      const hi = values[1] as string | number
      return fieldValue >= lo && fieldValue <= hi
    }

    case 'notBetween': {
      if (!Array.isArray(values) || values.length < 2) return false
      const lo = values[0] as string | number
      const hi = values[1] as string | number
      return fieldValue < lo || fieldValue > hi
    }

    default:
      return true
  }
}

/** 多子句 AND 组合（与 mock list 行为一致） */
export function evaluateAllFilters(clauses: FilterClause[], record: Record<string, unknown>): boolean {
  return clauses.every(clause => evaluateFilter(clause, record[clause.field]))
}
