/**
 * 键盘网格导航（docs/19 批次 G2）：方向键移动焦点单元格、Enter 进入行内编辑、
 * Esc 退出（退出复用既有编辑器内 keydown.escape，不经此处）。
 *
 * 设计：
 *  - 焦点单元格以 rowKey+field 标识（不用 DOM focus），经 getCellClassName 挂
 *    is-focused-cell 类呈现焦点样式；移动后 scrollIntoView 保证可见；
 *  - 鼠标点击单元格同步焦点（键盘/鼠标同源，读屏与焦点可见一致）；
 *  - 编辑态让位：行内编辑器打开时方向键归输入框，本导航不接管；
 *  - a11y 基线：网格容器 role="grid"+aria-label，焦点单元格样式走
 *    --sg-color-primary 描边（焦点可见）。
 */
import { nextTick, ref } from 'vue'
import type { Ref } from 'vue'
import type { VxeTableInstance } from 'vxe-table'
import type { WrapperColumn } from './wrapperTypes'

export interface FocusedCell {
  rowKeyValue: string
  field: string
}

export interface KeyboardNavDeps {
  tableRef: Ref<VxeTableInstance | null>
  isEditing: () => boolean
  /** 可经键盘进入编辑的列判定（排除操作列/关联列/只读/有限编辑） */
  isEditableCell: (col: WrapperColumn) => boolean
  dataColumns: () => WrapperColumn[]
  data: () => Array<Record<string, unknown>>
  rowKey: () => string
  /** 进入行内编辑（wrapper 的 startEdit） */
  startEdit: (row: Record<string, unknown>, col: WrapperColumn, rowIndex: number) => void
}

export function useKeyboardNav(deps: KeyboardNavDeps) {
  const focusedCell = ref<FocusedCell | null>(null)

  function findRowByKey(rowKeyValue: string): { row: Record<string, unknown>; rowIndex: number } | null {
    const key = deps.rowKey()
    const data = deps.data()
    for (let i = 0; i < data.length; i += 1) {
      if (String(data[i]![key]) === rowKeyValue) return { row: data[i]!, rowIndex: i }
    }
    return null
  }

  function setFocusedCell(row: Record<string, unknown>, field: string): void {
    const key = deps.rowKey()
    const rowKeyValue = row[key]
    if (rowKeyValue == null) return
    focusedCell.value = { rowKeyValue: String(rowKeyValue), field }
    void nextTick(scrollFocusedIntoView)
  }

  function scrollFocusedIntoView(): void {
    const focused = focusedCell.value
    if (!focused) return
    const found = findRowByKey(focused.rowKeyValue)
    if (!found) return
    const cellEl = deps.tableRef.value?.getCellElement(found.row, focused.field) as HTMLElement | null
    // jsdom(组件单测)无 scrollIntoView
    cellEl?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }

  /** 上下移动（行），返回是否移动成功 */
  function moveVertical(delta: 1 | -1): void {
    const focused = focusedCell.value
    if (!focused) return
    const found = findRowByKey(focused.rowKeyValue)
    if (!found) return
    const nextIndex = found.rowIndex + delta
    const data = deps.data()
    if (nextIndex < 0 || nextIndex >= data.length) return
    setFocusedCell(data[nextIndex]!, focused.field)
  }

  /** 左右移动（数据列），跳过不可编辑列仅当目标是进入编辑时；导航本身允许停留任意数据列 */
  function moveHorizontal(delta: 1 | -1): void {
    const focused = focusedCell.value
    if (!focused) return
    const cols = deps.dataColumns()
    const idx = cols.findIndex(c => c.field === focused.field)
    if (idx === -1) return
    const next = cols[idx + delta]
    if (!next) return
    setFocusedCell(findRowByKey(focused.rowKeyValue)!.row, next.field)
  }

  /**
   * 网格键按下：方向键移动焦点，Enter 进入编辑。
   * 编辑态直接放行（输入框自身消费方向键/Esc/Enter）。
   */
  function handleGridKeydown(e: KeyboardEvent): void {
    if (deps.isEditing()) return
    // 编辑器内按键（Enter 确认/Esc 取消后冒泡上来的同一事件）不再进入导航，
    // 否则 confirm 清空编辑态后本处理器会把编辑器立刻重新打开（事件周期竞态）
    const target = e.target as HTMLElement | null
    if (target && typeof target.closest === 'function' && target.closest('.edit-inline')) return
    const focused = focusedCell.value
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'ArrowLeft':
      case 'ArrowRight':
        if (!focused) {
          // 无焦点时首个方向键落到首列首行（或保持列不动）
          const cols = deps.dataColumns()
          const data = deps.data()
          if (cols.length === 0 || data.length === 0) return
          setFocusedCell(data[0]!, cols[0]!.field)
          e.preventDefault()
          return
        }
        e.preventDefault()
        if (e.key === 'ArrowDown') moveVertical(1)
        else if (e.key === 'ArrowUp') moveVertical(-1)
        else if (e.key === 'ArrowLeft') moveHorizontal(-1)
        else moveHorizontal(1)
        return
      case 'Enter': {
        if (!focused) return
        const found = findRowByKey(focused.rowKeyValue)
        if (!found) return
        const col = deps.dataColumns().find(c => c.field === focused.field)
        if (!col || !deps.isEditableCell(col)) return
        e.preventDefault()
        deps.startEdit(found.row, col, found.rowIndex)
        return
      }
      default:
        return
    }
  }

  return {
    focusedCell,
    setFocusedCell,
    handleGridKeydown,
  }
}
