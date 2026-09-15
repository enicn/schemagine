/**
 * 单元格渲染（docs/19 批次 F 前置拆分）：从 VxeTableWrapper 抽出纯渲染逻辑
 * ——格式化、筛选高亮、枚举彩色标签、布尔状态类——供单元格与截断浮层共用。
 */
import { resolveEnumColor, resolveEnumTagStyle } from '@/utils/enumTag'
import { formatMoney } from '@/utils/formatMoney'
import { getFieldTypeDefinition } from '@/engine/registry/fieldTypeRegistry'
import type { CandidateOption, FilterClause } from '@/types'
import type { WrapperColumn } from './wrapperTypes'

export interface CellRenderingDeps {
  /** FK 候选缓存（useFkOptions）：formatDisplay 的 fk 分支回显 label */
  fkOptionsCache: () => Map<string, CandidateOption[]>
  /** FK 值缺缓存时异步解析 label 并写回缓存（触发重渲染） */
  resolveFkLabel: (targetModule: string, id: string) => Promise<void>
  /** 当前生效的过滤子句（筛选命中单元格高亮用） */
  filterClauses: () => FilterClause[] | undefined
}

export function useCellRendering(deps: CellRenderingDeps) {
  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function getFilterClause(col: WrapperColumn): FilterClause | undefined {
    const clauses = deps.filterClauses()
    if (!clauses) return undefined
    return clauses.find(c => c.field === col.field)
  }

  function hasFilterMatch(col: WrapperColumn): boolean {
    return !!getFilterClause(col)
  }

  function getCellHighlightHtml(value: unknown, col: WrapperColumn): string {
    const clause = getFilterClause(col)
    if (!clause) return escapeHtml(formatDisplay(value, col))

    const textValue = formatDisplay(value, col)
    if (!textValue) return ''

    const defaultStyle = 'background:var(--sg-color-highlight);color:var(--sg-color-on-highlight);font-weight:bold;padding:0 var(--sg-spacing-1);border-radius:var(--sg-radius-xs)'
    const style = col.highlightStyle || defaultStyle
    const escaped = escapeHtml(textValue)

    if (clause.operator === 'like' && clause.value != null) {
      const keyword = String(clause.value)
      if (!keyword) return escaped
      const regex = new RegExp(`(${escapeRegex(keyword)})`, 'gi')
      const html = escaped.replace(regex, (match) => `<span class="filter-match-highlight" style="${style}">${match}</span>`)
      if (html !== escaped) return html
    }

    return `<span class="filter-match-highlight" style="${style}">${escaped}</span>`
  }

  /** boolean 列默认状态配色：是=绿 / 否=红；业务可用 trueLabelClass/falseLabelClass 覆盖（如灰色预设 cell-boolean--neutral） */
  function getBooleanStateClass(value: unknown): string {
    return value ? 'cell-boolean--yes' : 'cell-boolean--no'
  }

  /** select / multi-select / status 三类枚举列（有候选值或 statusMap 才可能出彩色标签） */
  function isEnumColumn(col: WrapperColumn): boolean {
    return (col.fieldType === 'select' || col.fieldType === 'multi-select' || col.fieldType === 'status')
      && (!!col.selectOptions && col.selectOptions.length > 0 || !!col.statusMap)
  }

  /** 任一取值声明了颜色才走彩色标签通道，其余完全回落既有渲染（零声明零变化） */
  function hasEnumTagStyle(value: unknown, col: WrapperColumn): boolean {
    if (value == null || value === '') return false
    const parts = Array.isArray(value) ? value : [value]
    return parts.some(part => resolveEnumColor(part, col.selectOptions, col.statusMap) != null)
  }

  /**
   * 枚举列单元格 HTML：逐值渲染彩色标签（声明了颜色的用取色三件套，
   * 未声明的取值回落默认蓝标签样式类）。
   */
  function getEnumCellHtml(value: unknown, col: WrapperColumn): string {
    const parts = Array.isArray(value) ? value : [value]
    return parts
      .map(part => {
        const label = escapeHtml(formatDisplay(part, col))
        const style = resolveEnumTagStyle(resolveEnumColor(part, col.selectOptions, col.statusMap))
        const css = style
          ? ` style="background:${style.background};color:${style.color};border-color:${style.borderColor}"`
          : ''
        return `<span class="cell-tag"${css}>${label}</span>`
      })
      .join('')
  }

  function formatDisplay(value: unknown, col: WrapperColumn): string {
    // 操作列（type:'action'）没有底层数据值，必须优先用 formatter 渲染动作标签（如「删除」），
    // 否则 value==null 会提前返回空字符串导致单元格空白。
    if (col.formatter) {
      return col.formatter({ cellValue: value })
    }
    if (value == null) return ''
    // 自定义字段类型（docs/19 批次 B1）：命中注册渲染器时按注册渲染（经 v-html 信任输出）
    if (col.fieldType && col.fieldSchema) {
      const customDef = getFieldTypeDefinition(col.fieldType)
      if (customDef?.renderToHtml) {
        return customDef.renderToHtml({ value, field: col.fieldSchema })
      }
    }
    if (col.fieldType === 'boolean') {
      return value ? (col.trueLabel || '是') : (col.falseLabel || '否')
    }
    // money：默认两位小数，源数据存在更高位有效小数时按实际位数展示（口径见 utils/formatMoney）
    if (col.fieldType === 'money') {
      return formatMoney(value)
    }
    if (col.fieldType === 'percent') {
      const num = Number(value)
      const decimal = col.decimal ?? 0
      const mode = col.decimalMode ?? 'fixed'
      if (mode === 'max') {
        return isNaN(num) ? String(value) : `${(num * 100).toString()}%`
      }
      return isNaN(num) ? String(value) : `${(num * 100).toFixed(decimal)}%`
    }
    if (col.fieldType === 'fk' && col.targetModule) {
      const cachedOptions = deps.fkOptionsCache().get(col.targetModule)
      if (cachedOptions) {
        // 统一转 string 比较：后端 FK 字段值可能是 number，而缓存 option.value 是 string
        const idStr = String(value)
        const opt = cachedOptions.find(o => String(o.value) === idStr)
        if (opt) return opt.label
      }
      deps.resolveFkLabel(col.targetModule, String(value))
      return escapeHtml(String(value))
    }
    if (col.selectOptions) {
      if (Array.isArray(value)) {
        return value.map(v => {
          const opt = col.selectOptions!.find(o => o.value === v)
          return opt?.label || String(v)
        }).join(', ')
      }
      const opt = col.selectOptions.find(o => o.value === value)
      return opt?.label || String(value)
    }
    return String(value)
  }

  /** 关联列固定文案：宿主传了 formatter 就用之，否则「查看」 */
  function relationFormatter(col: WrapperColumn): string {
    return col.formatter ? col.formatter({ cellValue: undefined, row: {}, column: col }) : '查看'
  }

  function openImage(src: unknown): void {
    const s = src == null ? '' : String(src)
    if (s) window.open(s, '_blank', 'noopener')
  }

  return {
    escapeHtml,
    getFilterClause,
    hasFilterMatch,
    getCellHighlightHtml,
    getBooleanStateClass,
    isEnumColumn,
    hasEnumTagStyle,
    getEnumCellHtml,
    formatDisplay,
    relationFormatter,
    openImage,
  }
}
