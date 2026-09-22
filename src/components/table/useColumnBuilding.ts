/**
 * 列构建（docs/19 批次 F 前置拆分）：从 VxeTableWrapper 抽出列分组、
 * 操作列计价与插槽名解析，控制单文件复杂度。
 */
import { computed } from 'vue'
import type { Ref } from 'vue'
import type { VxeTableInstance } from 'vxe-table'
import { evaluateCondition } from '@/utils/condition'
import type { WrapperColumn } from './wrapperTypes'

/** useColumnBuilding 依赖的 props 子集（传入组件 reactive props 即可保持响应追踪） */
export interface ColumnBuildingProps {
  columns: WrapperColumn[]
  data: Record<string, unknown>[]
  cellSlots?: Record<string, string>
  headerSlots?: Record<string, string>
}

export function useColumnBuilding(
  props: ColumnBuildingProps,
  tableRef: Ref<VxeTableInstance | null>,
) {
  /** 插槽透传（docs/19 B2）：field → 宿主插槽名 */
  function cellSlotName(col: WrapperColumn): string | undefined {
    return props.cellSlots?.[col.field]
  }
  function headerSlotName(col: WrapperColumn): string | undefined {
    return props.headerSlots?.[col.field]
  }

  const visibleColumns = computed(() => props.columns.filter(c => c.visible))
  const relationColumns = computed(() => visibleColumns.value.filter(c => c.isRelation))
  // 操作列（type:'action'）：独立渲染为固定右侧的标准操作列，不参与排序/隐藏/拖拽
  const opColumns = computed(() => visibleColumns.value.filter(c => c.isAction))
  const dataColumns = computed(() => visibleColumns.value.filter(c => !c.isRelation && !c.isAction))

  /**
   * 操作列宽度 = 两侧留白 + 各按钮实测文本宽之和 + 按钮间距。
   *
   * 历史两版都是静态估算（先 80/按钮，后 48/按钮与字段显式 width 取大），短文案按钮
   * 实际只有 2~4 字，静态值让操作列长期比内容宽出一倍。现按 canvas measureText 以
   * .op-link 实际字体逐按钮测宽（中英混排皆准），字段显式 width 不再参与计价；
   * 行级 visibleWhen 只会隐藏按钮，计价恒按全量按钮集合（最坏行）取值。
   */
  const OP_COLUMN_PADDING = 16
  /** 操作按钮间距 */
  const OP_LINK_GAP = 12
  /** 带图标按钮（行级编辑/删除）的图标+间距占位：图标 13px + 右距 3px */
  const OP_ICON_WIDTH = 16
  /** 与 VxeTableWrapper.opIcon 对应：这两类按钮渲染图标 */
  const opHasIcon = (c: WrapperColumn): boolean => !!c.actionDanger || c.field === '__rowEdit__'

  let opTextCtx: CanvasRenderingContext2D | null | undefined
  /** 以 .op-link 实际字体（token：--sg-font-size-md + --sg-font-family）测按钮文本宽 */
  function measureOpTextWidth(text: string): number {
    if (!text) return 0
    if (opTextCtx === undefined) {
      opTextCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
    }
    if (!opTextCtx) return text.length * 13
    const s = getComputedStyle((tableRef.value?.$el as HTMLElement | undefined) ?? document.documentElement)
    opTextCtx.font = `${s.getPropertyValue('--sg-font-size-md').trim() || '13px'} ${s.getPropertyValue('--sg-font-family').trim() || 'sans-serif'}`
    return opTextCtx.measureText(text).width
  }

  const opColumnWidth = computed(() => {
    const buttons = opColumns.value
    if (buttons.length === 0) return 0
    // 计价取「行内实际同时可见按钮集合」中的最宽者：行级 visibleWhen 让多数行只渲染
    // 全量按钮的子集（如账号行恒为 重置密码+冻结|解冻+解锁、不含解绑微信），按全量
    // 集合计价会让操作列在每行都空出一截。无数据行时回退全量集合（旧的最坏行口径）。
    let priced = buttons
    if (props.data.length > 0) {
      let maxWidth = -1
      for (const row of props.data) {
        const ops = visibleOps(row)
        const width = ops.reduce((s, c) => s + measureOpTextWidth(opPricingLabel(c)) + (opHasIcon(c) ? OP_ICON_WIDTH : 0), 0)
        if (width > maxWidth) {
          maxWidth = width
          priced = ops
        }
      }
      if (priced.length === 0) priced = buttons
    }
    const content = priced.reduce((w, c) => w + measureOpTextWidth(opPricingLabel(c)) + (opHasIcon(c) ? OP_ICON_WIDTH : 0), 0)
    return Math.ceil(OP_COLUMN_PADDING * 2 + OP_LINK_GAP * (priced.length - 1) + content)
  })

  /** 逐行求值操作按钮显隐：声明了 visibleWhen 的按钮按行数据过滤，未声明的恒可见 */
  function visibleOps(row: Record<string, unknown>): WrapperColumn[] {
    return opColumns.value.filter(
      c => !c.actionVisibleWhen || evaluateCondition(c.actionVisibleWhen, { record: row, global: {} }),
    )
  }

  /** 计价文案：title 与 labelWhen 全部候选文案中的最宽者，保证切换文案不溢出 */
  function opPricingLabel(c: WrapperColumn): string {
    let label = c.title
    for (const item of c.actionLabelWhen ?? []) {
      if (item.label.length > label.length) label = item.label
    }
    return label
  }

  return {
    visibleColumns,
    relationColumns,
    opColumns,
    dataColumns,
    opColumnWidth,
    visibleOps,
    cellSlotName,
    headerSlotName,
  }
}
