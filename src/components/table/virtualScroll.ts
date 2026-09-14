/**
 * 纵向虚拟滚动判定(docs/19 批次 C2)。
 * virtualScroll 显式开启强制启用;否则数据量超过阈值自动开启。
 * gt 之内 vxe 仍整表渲染,超出才进入虚拟滚动(行高固定 44px 的前提下无跳动)。
 */
export const AUTO_VIRTUAL_SCROLL_THRESHOLD = 200
export const VIRTUAL_SCROLL_GT = 100

export function resolveScrollY(virtualScroll: boolean, rowCount: number): { enabled: boolean; gt: number } {
  const enabled = virtualScroll || rowCount > AUTO_VIRTUAL_SCROLL_THRESHOLD
  return { enabled, gt: VIRTUAL_SCROLL_GT }
}
