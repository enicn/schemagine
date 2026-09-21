/**
 * 截断单元格内容查看浮层（docs/19 批次 F 前置拆分）：从 VxeTableWrapper 抽出
 * 单击省略单元格原地弹出完整内容的浮层状态机——溢出判定、锚点定位、复制与
 * 各类全局监听下的收起。
 *
 * 动机：列宽不足时长值被省略，原生 title 悬停提示慢且不可复制；原地展开会撑开行高，
 * 且仍受列宽约束。自管浮层（Teleport+fixed 定位）以单元格为锚，开关只由 cellDetail
 * 单一状态机决定——不用 el-popover 的 trigger/click-outside 机制：换格点击时旧弹层的
 * 外点关闭会在新弹层打开后再次触发，把刚打开的弹层秒关（事件周期冲突）。
 */
import { nextTick, onUnmounted, ref, watch } from 'vue'
import type { VxeTableDefines } from 'vxe-table'
import type { Ref } from 'vue'
import type { VxeTableInstance } from 'vxe-table'
import { t } from '@/locales'
import type { WrapperColumn } from './wrapperTypes'

const CELL_DETAIL_GAP = 6

export interface CellDetailDeps {
  tableRef: Ref<VxeTableInstance | null>
  rowKey: () => string
  /** 该格是否处于行内编辑态（编辑态不弹浮层） */
  isEditing: (rowId: string, field: string) => boolean
  /** 单元格全文（与列渲染同口径） */
  getCellDetailText: (row: Record<string, unknown>, col: WrapperColumn) => string
}

export function useCellDetail(deps: CellDetailDeps) {
  const cellDetail = ref<{
    visible: boolean
    triggerEl: HTMLElement | null
    title: string
    content: string
  }>({ visible: false, triggerEl: null, title: '', content: '' })
  const cellDetailPanelRef = ref<HTMLDivElement | null>(null)
  const cellDetailPos = ref<{ left: number; top: number }>({ left: 0, top: 0 })

  function closeCellDetail(): void {
    cellDetail.value = { visible: false, triggerEl: null, title: '', content: '' }
  }

  /** 渲染后按锚单元格定位：贴下方起始，空间不足翻到上方，左右夹在视口内 */
  function positionCellDetailPanel(): void {
    const el = cellDetail.value.triggerEl
    const panel = cellDetailPanelRef.value
    if (!el || !panel) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const pw = panel.offsetWidth
    const ph = panel.offsetHeight
    const left = Math.min(Math.max(r.left, 8), Math.max(8, vw - pw - 8))
    let top = r.bottom + CELL_DETAIL_GAP
    if (top + ph > vh - 8) {
      top = r.top - ph - CELL_DETAIL_GAP
      if (top < 8) top = Math.max(8, vh - ph - 8)
    }
    cellDetailPos.value = { left: Math.round(left), top: Math.round(top) }
  }

  /** 溢出判定：裁剪可能发生在 .vxe-cell 或其带 ellipsis 的后代（如 .cell-value span）上，须逐层检查 */
  function isContentTruncated(root: HTMLElement | null): boolean {
    if (!root) return false
    if (root.scrollWidth > root.clientWidth + 1) return true
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
      if (el.scrollWidth > el.clientWidth + 1) return true
    }
    return false
  }

  /** 单击单元格时尝试打开内容浮层：仅当内容真的被省略（横向溢出）时弹出 */
  function maybeOpenCellDetail(params: VxeTableDefines.CellClickEventParams, col: WrapperColumn): void {
    // 媒体/图片单元格无可省略文本；编辑态单元格交给行内编辑器
    if (col.isAction || col.fieldType === 'mediaImage' || col.fieldType === 'image' || col.fieldType === 'attachment') return
    if (deps.isEditing(params.row[deps.rowKey()], col.field)) return
    const cellEl = (deps.tableRef.value?.getCellElement(params.row, params.column) as HTMLElement | null) ?? null
    // 再点同一格 → 收起（点外部/其他格的收起走 onCellDetailOutsidePointerDown，不与此处竞争）
    if (cellDetail.value.visible && cellDetail.value.triggerEl && cellDetail.value.triggerEl === cellEl) {
      closeCellDetail()
      return
    }
    const inner = cellEl?.querySelector('.vxe-cell') as HTMLElement | null
    const text = deps.getCellDetailText(params.row, col)
    if (!text || !isContentTruncated(inner)) {
      closeCellDetail()
      return
    }
    cellDetail.value = { visible: true, triggerEl: cellEl, title: col.title, content: text }
    void nextTick(positionCellDetailPanel)
  }

  async function copyCellDetail(): Promise<void> {
    const text = cellDetail.value.content
    if (!text) return
    const { ElMessage } = await import('element-plus')
    try {
      await navigator.clipboard.writeText(text)
      ElMessage.success(t('table.detail.copied'))
    } catch {
      // 非安全上下文（http 内网部署）无 navigator.clipboard，回落隐藏 textarea + execCommand
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        if (document.execCommand('copy')) {
          ElMessage.success(t('table.detail.copied'))
        } else {
          ElMessage.error(t('table.detail.copyFailed'))
        }
      } catch {
        ElMessage.error(t('table.detail.copyFailed'))
      } finally {
        ta.remove()
      }
    }
  }

  function onCellDetailKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') closeCellDetail()
  }

  // 浮层打开期间的点外部收起：面板内部与锚单元格自身的 pointerdown 忽略
  // （锚单元格忽略是为了让单击切换语义完整到达 maybeOpenCellDetail 的同格判断）
  function onCellDetailOutsidePointerDown(e: PointerEvent): void {
    const target = e.target as Node | null
    if (!target) return
    if (cellDetailPanelRef.value?.contains(target)) return
    if (cellDetail.value.triggerEl?.contains(target)) return
    closeCellDetail()
  }

  // 任意容器滚动（表体/页面容器）都可能让锚易位或错位，统一收起；面板内部滚动除外
  function onCellDetailScroll(e: Event): void {
    const target = e.target as Node | null
    if (target && cellDetailPanelRef.value?.contains(target)) return
    closeCellDetail()
  }

  function onCellDetailResize(): void {
    closeCellDetail()
  }

  watch(() => cellDetail.value.visible, (v) => {
    if (v) {
      window.addEventListener('keydown', onCellDetailKeydown, true)
      window.addEventListener('pointerdown', onCellDetailOutsidePointerDown, true)
      window.addEventListener('scroll', onCellDetailScroll, true)
      window.addEventListener('resize', onCellDetailResize)
    } else {
      window.removeEventListener('keydown', onCellDetailKeydown, true)
      window.removeEventListener('pointerdown', onCellDetailOutsidePointerDown, true)
      window.removeEventListener('scroll', onCellDetailScroll, true)
      window.removeEventListener('resize', onCellDetailResize)
    }
  })

  // 组件卸载时若浮层仍开着，摘除全部 window 监听
  onUnmounted(() => {
    window.removeEventListener('keydown', onCellDetailKeydown, true)
    window.removeEventListener('pointerdown', onCellDetailOutsidePointerDown, true)
    window.removeEventListener('scroll', onCellDetailScroll, true)
    window.removeEventListener('resize', onCellDetailResize)
  })

  return {
    cellDetail,
    cellDetailPanelRef,
    cellDetailPos,
    closeCellDetail,
    maybeOpenCellDetail,
    copyCellDetail,
  }
}
