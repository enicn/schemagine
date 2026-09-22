// selectedRows.ts —— 选择模式弹窗（FK 弹窗搜索等）的选中行收集。
//
// 选中态以行键 id 集合维护（多选经 checkbox 跨页保留，选中行未必仍在当前页
// 数据里），确认时按 id 从数据行取回 label；label 字段口径与 FK 候选标签一致
// （name → label → title），目标记录不在数据中时以原始 id 兜底，调用方还可
// 传入候选缓存（targetModule 的 CandidateOption 表）二次兜底。

export interface SelectedRow {
  id: string
  label: string
}

/** 候选缓存兜底表：value → label（与 runtimeCacheStore/useFkLabelCache 的缓存形态对齐） */
export type LabelFallback = (id: string) => string | undefined

export function collectSelectedRows(
  rows: Array<Record<string, unknown>>,
  selectedIds: string[],
  rowKey: string,
  fallback?: LabelFallback,
): SelectedRow[] {
  const rowMap = new Map(rows.map(r => [String(r[rowKey] ?? ''), r]))
  const seen = new Set<string>()
  const result: SelectedRow[] = []
  for (const id of selectedIds) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    const row = rowMap.get(id)
    const label = row ? resolveRowLabel(row) : (fallback?.(id) ?? id)
    result.push({ id, label })
  }
  return result
}

/** 行 → 展示标签：与 fk 候选标签同口径（name → label → title），取不到回落 id */
export function resolveRowLabel(row: Record<string, unknown>): string {
  for (const key of ['name', 'label', 'title']) {
    const v = row[key]
    if (typeof v === 'string' && v !== '') return v
  }
  return String(row._recordId ?? '')
}
