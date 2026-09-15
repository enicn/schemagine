/**
 * 表格密度（docs/19 批次 F1）：density prop 的三档行高/表头高常量表。
 *
 * 数值是 vxe cell-config.height / header-cell-config.height 与 fixedRowCount
 * 高度测算的唯一数字来源（虚拟滚动要求 vxe 拿到确定数值，不能走 CSS var）；
 * tokens.css 登记同名 token（--sg-table-row-height-* 等）供 CSS 消费与宿主
 * 参考，两处默认值由 tableDensity.spec.ts 钉住，改动须两边同步。
 *
 * default 档取 44/49：与既有 ROW_HEIGHT/HEADER_HEIGHT 常量及虚拟滚动
 * 「行高固定 44px」的前提一致（vxe 裸默认是 48px，此前 fixedRowCount 测算
 * 一直偏矮 4px/行，token 化后回归设计值）。
 */
export type TableDensity = 'compact' | 'default' | 'large'

export interface DensityHeights {
  /** 数据行高（px） */
  row: number
  /** 表头行高（px） */
  header: number
}

export const TABLE_DENSITY_HEIGHTS: Record<TableDensity, DensityHeights> = {
  compact: { row: 36, header: 41 },
  default: { row: 44, header: 49 },
  large: { row: 52, header: 57 },
}

/** 非法值回退 default（宿主传枚举外字符串时不炸、不产生未定义档位） */
export function normalizeDensity(density?: string | null): TableDensity {
  return density === 'compact' || density === 'large' ? density : 'default'
}

export function resolveDensityHeights(density?: string | null): DensityHeights {
  return TABLE_DENSITY_HEIGHTS[normalizeDensity(density)]
}
