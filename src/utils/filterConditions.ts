import type { FilterClause, FilterCondition, FilterGroup } from '@/types'
import { evaluateFilter } from './evaluateFilter'

/**
 * 组合过滤条件求值与树操作（docs/19 批次 E2）。
 *
 * 模型：FilterCondition = FilterClause（叶子）| FilterGroup（分支，logic: and/or，可嵌套）。
 * 顶层列表隐式 AND；OR/嵌套由 FilterGroup 表达。mock 与本地数据源共用本实现保证同口径。
 */

export function isFilterGroup(condition: FilterCondition): condition is FilterGroup {
  return (condition as FilterGroup).type === 'group'
}

/** 单条件求值（叶子转发 evaluateFilter，分支递归） */
export function evaluateCondition(condition: FilterCondition, record: Record<string, unknown>): boolean {
  if (isFilterGroup(condition)) {
    return condition.logic === 'or'
      ? condition.conditions.some(c => evaluateCondition(c, record))
      : condition.conditions.every(c => evaluateCondition(c, record))
  }
  return evaluateFilter(condition, record[condition.field])
}

/** 条件列表求值：顶层隐式 AND */
export function evaluateConditions(conditions: FilterCondition[], record: Record<string, unknown>): boolean {
  return conditions.every(c => evaluateCondition(c, record))
}

/** 拍平为叶子子句（用于展示层摘要、表头筛选状态等只关心字段的场景） */
export function flattenFilterConditions(conditions: FilterCondition[]): FilterClause[] {
  const result: FilterClause[] = []
  for (const c of conditions) {
    if (isFilterGroup(c)) {
      result.push(...flattenFilterConditions(c.conditions))
    } else {
      result.push(c)
    }
  }
  return result
}

/** 按字段 key 移除条件（含嵌套组内）；组被清空时整组移除。返回新数组，不改入参 */
export function removeFieldFromConditions(conditions: FilterCondition[], field: string): FilterCondition[] {
  const result: FilterCondition[] = []
  for (const c of conditions) {
    if (isFilterGroup(c)) {
      const next = removeFieldFromConditions(c.conditions, field)
      if (next.length > 0) {
        result.push({ ...c, conditions: next })
      }
    } else if (c.field !== field) {
      result.push(c)
    }
  }
  return result
}

/** 深拷贝（条件模型为 JSON 安全结构） */
export function cloneFilterConditions(conditions: FilterCondition[]): FilterCondition[] {
  return JSON.parse(JSON.stringify(conditions)) as FilterCondition[]
}

export type FilterMatchType = 'all' | 'any'

/**
 * FilterBar 草稿 → 契约条件列表（docs/19 批次 E1/E2）：
 * 「任一」且受管条件 ≥2 时包成单个 OR 组；其余平铺。
 * foreign 为非本栏管理的条件（如表头筛选产生的其他字段子句），原样保留在顶层。
 */
export function composeBarConditions(
  foreign: FilterClause[],
  managed: FilterClause[],
  matchType: FilterMatchType,
): FilterCondition[] {
  const result: FilterCondition[] = foreign.map(c => ({ ...c }))
  if (matchType === 'any' && managed.length > 1) {
    result.push({ type: 'group', logic: 'or', conditions: managed.map(c => ({ ...c })) })
  } else {
    result.push(...managed.map(c => ({ ...c })))
  }
  return result
}

/**
 * 契约条件列表 → FilterBar 草稿（docs/19 批次 E1/E2）：
 * 拆出本栏受管叶子条件；命中单个 OR 组时匹配方式还原为「任一」。
 */
export function splitBarConditions(
  conditions: FilterCondition[],
  isManaged: (clause: FilterClause) => boolean,
): { foreign: FilterClause[]; managed: FilterClause[]; matchType: FilterMatchType } {
  const foreign: FilterClause[] = []
  const managed: FilterClause[] = []
  let matchType: FilterMatchType = 'all'

  for (const c of conditions) {
    if (isFilterGroup(c)) {
      const leaves = flattenFilterConditions(c.conditions)
      if (c.logic === 'or' && leaves.every(isManaged) && leaves.length > 1) {
        matchType = 'any'
        managed.push(...leaves)
      } else {
        foreign.push(...leaves)
      }
      continue
    }
    if (isManaged(c)) {
      managed.push(c)
    } else {
      foreign.push(c)
    }
  }
  return { foreign, managed, matchType }
}
