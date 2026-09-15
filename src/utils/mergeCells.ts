/**
 * 相同值单元格合并（docs/19 批次 F5）：按声明列把「相邻同值」的行合并
 * （rowspan 归首行、后续行置 0），产出 vxe span-method。
 *
 * 规则：
 *  - 值相等以 String(v) 严格比较（null/'' 均为字面值，不做归并特判）；
 *  - 未声明 mergeCells 的列不参与合并（返回 undefined → vxe 按默认 1×1）；
 *  - 预计算逐行逐列结果，span-method 调用期零比较。
 */
export interface SpanCellParams {
  row: Record<string, unknown>
  rowIndex: number
  column: { field?: string }
}

export type SpanMethodResult = { rowspan: number; colspan: number }

export function buildSameValueSpanMethod(
  mergeFields: string[],
  rows: Record<string, unknown>[],
): (params: SpanCellParams) => SpanMethodResult | undefined {
  const fieldSet = new Set(mergeFields)
  // spanMap[rowIndex][field] = { rowspan, colspan }
  const spanMap = new Map<number, Map<string, SpanMethodResult>>()

  for (const field of mergeFields) {
    let runStart = 0
    while (runStart < rows.length) {
      const value = rows[runStart]![field]
      const key = String(value)
      let end = runStart + 1
      while (end < rows.length && String(rows[end]![field]) === key) end += 1
      const runLen = end - runStart
      for (let i = runStart; i < end; i += 1) {
        let cellMap = spanMap.get(i)
        if (!cellMap) {
          cellMap = new Map()
          spanMap.set(i, cellMap)
        }
        cellMap.set(field, { rowspan: i === runStart ? runLen : 0, colspan: 1 })
      }
      runStart = end
    }
  }

  return ({ rowIndex, column }) => {
    if (column.field == null || !fieldSet.has(column.field)) return undefined
    return spanMap.get(rowIndex)?.get(column.field)
  }
}
