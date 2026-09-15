/**
 * 分组组行构建（docs/19 批次 F6）：按分组字段把平铺行切组、组间排序，
 * 并在每组前插入携带 组值/条数/组内小计 的组行，供列表渲染分组小计。
 *
 * 口径与聚合统计条（useAggregation）一致：小计 = Number(value) 非 NaN 求和，
 * 结果四舍五入两位小数。
 */
/** 组行标记字段（组行对象上携带 GroupRowMeta） */
export const GROUP_ROW_FLAG = '__sgGroup__'

export interface GroupRowMeta {
  /** 组值（String(字段值)） */
  value: string
  /** 组内条数 */
  count: number
  /** 组内小计：summaryFields 各字段 sum */
  summary: Record<string, number>
}

export type GroupedRow<T extends Record<string, unknown>> = T & { [GROUP_ROW_FLAG]?: GroupRowMeta }

export interface GroupRowsOptions {
  field: string
  direction?: 'asc' | 'desc'
  summaryFields?: string[]
}

export function buildGroupedRows<T extends Record<string, unknown>>(
  rows: T[],
  options: GroupRowsOptions,
): Array<GroupedRow<T>> {
  const direction = options.direction ?? 'asc'
  const summaryFields = options.summaryFields ?? []

  const groups = new Map<string, T[]>()
  const order: string[] = []
  for (const row of rows) {
    const key = String(row[options.field])
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(row)
  }

  order.sort((a, b) => {
    const cmp = a.localeCompare(b, 'zh-Hans-CN')
    return direction === 'desc' ? -cmp : cmp
  })

  const result: Array<GroupedRow<T>> = []
  for (const key of order) {
    const groupRows = groups.get(key)!
    const summary: Record<string, number> = {}
    for (const field of summaryFields) {
      summary[field] = Math.round(groupRows.reduce((sum, r) => {
        const v = Number(r[field])
        return isNaN(v) ? sum : sum + v
      }, 0) * 100) / 100
    }
    const meta: GroupRowMeta = { value: key, count: groupRows.length, summary }
    result.push({ [GROUP_ROW_FLAG]: meta } as GroupedRow<T>)
    for (const row of groupRows) result.push(row)
  }
  return result
}

/** 该行是否为组行 */
export function isGroupRow(row: Record<string, unknown> | undefined | null): boolean {
  return !!row && row[GROUP_ROW_FLAG] != null
}
