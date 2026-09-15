import { describe, expect, it } from 'vitest'
import {
  isFilterGroup,
  evaluateConditions,
  flattenFilterConditions,
  removeFieldFromConditions,
  cloneFilterConditions,
  composeBarConditions,
  splitBarConditions,
} from '@/utils/filterConditions'
import type { FilterClause, FilterCondition, FilterGroup } from '@/types'

function clause(field: string, operator: FilterClause['operator'], value?: unknown, values?: unknown[]): FilterClause {
  return { field, operator, value, values }
}

function group(logic: FilterGroup['logic'], conditions: FilterCondition[]): FilterGroup {
  return { type: 'group', logic, conditions }
}

const record = { status: 'active', amount: 100, level: 3 }

describe('filterConditions 组合过滤(docs/19 批次 E2)', () => {
  it('isFilterGroup:按 type 判别字段区分组与叶子', () => {
    expect(isFilterGroup(group('or', [clause('status', 'eq', 'active')]))).toBe(true)
    expect(isFilterGroup(clause('status', 'eq', 'active'))).toBe(false)
  })

  it('顶层隐式 AND', () => {
    const filters = [clause('status', 'eq', 'active'), clause('amount', 'between', undefined, [50, 150])]
    expect(evaluateConditions(filters, record)).toBe(true)
    expect(evaluateConditions([...filters, clause('level', 'eq', 9)], record)).toBe(false)
  })

  it('OR 组:任一命中即通过', () => {
    const filters = [group('or', [clause('status', 'eq', 'disabled'), clause('level', 'eq', 3)])]
    expect(evaluateConditions(filters, record)).toBe(true)
    expect(evaluateConditions([group('or', [clause('status', 'eq', 'disabled'), clause('level', 'eq', 9)])], record)).toBe(false)
  })

  it('嵌套:(A OR B) AND C', () => {
    const filters = [
      group('and', [
        group('or', [clause('status', 'eq', 'disabled'), clause('status', 'eq', 'active')]),
        clause('level', 'eq', 3),
      ]),
    ]
    // and 组内:or 命中 + level 命中 → 通过
    expect(evaluateConditions(filters, record)).toBe(true)
    // or 不命中 → 整体不通过
    const negative = [group('and', [group('or', [clause('status', 'eq', 'disabled')]), clause('level', 'eq', 3)])]
    expect(evaluateConditions(negative, record)).toBe(false)
  })

  it('空组:every 语义视为通过', () => {
    expect(evaluateConditions([group('and', [])], record)).toBe(true)
    expect(evaluateConditions([group('or', [])], record)).toBe(false)
  })

  it('flattenFilterConditions:拍平嵌套组为叶子序列', () => {
    const tree = [
      clause('status', 'eq', 'active'),
      group('or', [clause('a', 'eq', 1), group('and', [clause('b', 'eq', 2), clause('c', 'eq', 3)])]),
    ]
    expect(flattenFilterConditions(tree).map(c => c.field)).toEqual(['status', 'a', 'b', 'c'])
  })

  it('removeFieldFromConditions:移除叶子;组被清空时整组移除;不改入参', () => {
    const tree: FilterCondition[] = [
      clause('status', 'eq', 'active'),
      group('or', [clause('amount', 'eq', 1), clause('level', 'eq', 2)]),
    ]
    const next = removeFieldFromConditions(tree, 'level')
    expect(next).toHaveLength(2)
    expect(isFilterGroup(next[1]!) && (next[1] as FilterGroup).conditions).toHaveLength(1)

    const pruned = removeFieldFromConditions(next, 'amount')
    // or 组只剩空 → 整组移除,仅剩 status 叶子
    expect(pruned).toHaveLength(1)
    expect(pruned[0]).toEqual(clause('status', 'eq', 'active'))
    // 原树不受影响
    expect(tree).toHaveLength(2)
    expect(flattenFilterConditions(tree).map(c => c.field)).toEqual(['status', 'amount', 'level'])
  })

  it('cloneFilterConditions:深拷贝,改副本不影响原树', () => {
    const tree: FilterCondition[] = [group('or', [clause('status', 'eq', 'active')])]
    const copy = cloneFilterConditions(tree)
    const copyGroup = copy[0] as FilterGroup
    copyGroup.logic = 'and'
    copyGroup.conditions[0] = clause('x', 'eq', 1)
    expect((tree[0] as FilterGroup).logic).toBe('or')
    expect((tree[0] as FilterGroup).conditions[0]).toEqual(clause('status', 'eq', 'active'))
  })
})

describe('FilterBar 条件装拆(docs/19 批次 E1/E2)', () => {
  const isManaged = (c: FilterClause) => ['status', 'amount', 'level'].includes(c.field)

  it('compose:全部匹配 → 平铺;任一匹配且 ≥2 条 → 包单个 OR 组', () => {
    const managed = [clause('status', 'eq', 'active'), clause('level', 'eq', 3)]
    const foreign = [clause('other', 'like', 'x')]

    expect(composeBarConditions(foreign, managed, 'all')).toHaveLength(3)

    const anyMode = composeBarConditions(foreign, managed, 'any')
    expect(anyMode).toHaveLength(2)
    const orGroup = anyMode.find(c => isFilterGroup(c)) as FilterGroup
    expect(orGroup.logic).toBe('or')
    expect(orGroup.conditions).toHaveLength(2)
  })

  it('compose:任一匹配但仅 1 条时不包组(退化为平铺)', () => {
    const result = composeBarConditions([], [clause('status', 'eq', 'active')], 'any')
    expect(result).toHaveLength(1)
    expect(isFilterGroup(result[0]!)).toBe(false)
  })

  it('split/compose 往返:拆出受管条件与匹配方式,外来子句保留', () => {
    const committed = composeBarConditions(
      [clause('other', 'like', 'x')],
      [clause('status', 'eq', 'active'), clause('level', 'eq', 3)],
      'any',
    )
    const { foreign, managed, matchType } = splitBarConditions(committed, isManaged)
    expect(matchType).toBe('any')
    expect(managed.map(c => c.field)).toEqual(['status', 'level'])
    expect(foreign.map(c => c.field)).toEqual(['other'])

    // all 模式(平铺)往返
    const flat = composeBarConditions([], managed, 'all')
    const parsed = splitBarConditions(flat, isManaged)
    expect(parsed.matchType).toBe('all')
    expect(parsed.managed).toHaveLength(2)
  })

  it('split:不完整 OR 组(混入非受管字段)整组降级为外来子句,保持 OR 语义不被拆散', () => {
    const mixed = [group('or', [clause('status', 'eq', 'active'), clause('unknown', 'eq', 1)])]
    const { foreign, managed, matchType } = splitBarConditions(mixed, isManaged)
    expect(matchType).toBe('all')
    expect(managed).toEqual([])
    expect(foreign.map(c => c.field)).toEqual(['status', 'unknown'])
  })
})
