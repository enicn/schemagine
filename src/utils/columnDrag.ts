/**
 * 列拖拽后的新列序重建（docs/19 批次 E4）。
 *
 * vxe-table 的 column-dragend 事件参数不含完整列序（仅 old/new/dragColumn + dragPos），
 * 在拖拽结束后立即读实例列序又会晚于 vxe 内部的 nextTick 重排——
 * 因此由「旧列序 + 拖拽列 + 落点列 + 方位（left/right）」确定性重建。
 */
export function reorderColumnsByDrag(
  order: string[],
  dragField: string | undefined,
  targetField: string | undefined,
  dragPos: 'left' | 'right' | undefined,
): string[] {
  if (!dragField || !targetField || dragField === targetField) return [...order]
  const withoutDrag = order.filter(f => f !== dragField)
  const targetIndex = withoutDrag.indexOf(targetField)
  if (targetIndex < 0) return [...order]
  const insertAt = dragPos === 'right' ? targetIndex + 1 : targetIndex
  withoutDrag.splice(insertAt, 0, dragField)
  return withoutDrag
}
