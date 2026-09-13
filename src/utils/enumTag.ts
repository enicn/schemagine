import type { SelectOption } from '@/types'

/**
 * 枚举值彩色标签：select / multi-select / status 字段的每个枚举值可声明颜色，
 * 单元格渲染为带色标签（背景/文字/描边三件套），一眼区分不同取值。
 *
 * 颜色声明两处来源（schema 驱动，均可选）：
 * - options[].color：逐选项声明（优先）
 * - 字段级 statusMap：value -> 颜色 的映射表（status 字段惯用）
 * 颜色值支持两种写法：
 * - 语义色调：primary | success | warning | danger | info（对齐 element-plus 浅色标签盘）
 * - 任意 CSS 颜色：#rgb / #rrggbb / #rrggbbaa / rgb() / rgba()，引擎自动衍生浅底与描边
 */

export type EnumTagTone = 'primary' | 'success' | 'warning' | 'danger' | 'info'

/** 中性色调别名：部分 schema 以 default 表达「无强调」，渲染同 info 灰 */
const NEUTRAL_TONE = 'info'

/** 标签三件套：浅色背景 + 同系文字 + 更浅描边（el-tag 浅色变体口径） */
export interface EnumTagStyle {
  background: string
  color: string
  borderColor: string
}

// 标签三件套走 --sg-* token（见 src/styles/tokens.css），宿主换肤自动跟随；
// 浅底/描边取同系 light-8/light-9 档位，对齐 el-tag 浅色变体口径。
const TONE_PRESETS: Record<EnumTagTone, EnumTagStyle> = {
  primary: { background: 'var(--sg-color-primary-light-9)', color: 'var(--sg-color-primary)', borderColor: 'var(--sg-color-primary-light-8)' },
  success: { background: 'var(--sg-color-success-light-9)', color: 'var(--sg-color-success)', borderColor: 'var(--sg-color-success-light-8)' },
  warning: { background: 'var(--sg-color-warning-light-9)', color: 'var(--sg-color-warning)', borderColor: 'var(--sg-color-warning-light-8)' },
  danger: { background: 'var(--sg-color-danger-light-9)', color: 'var(--sg-color-danger)', borderColor: 'var(--sg-color-danger-light-8)' },
  info: { background: 'var(--sg-color-info-light-9)', color: 'var(--sg-color-info)', borderColor: 'var(--sg-color-info-light-8)' },
}

/** 解析 CSS 颜色为 [r, g, b, a]；不支持的颜色写法返回 null */
export function parseCssColor(input: string): [number, number, number, number] | null {
  const value = input.trim().toLowerCase()
  const hex = value.match(/^#([0-9a-f]{3,8})$/)
  if (hex?.[1]) {
    const digits = hex[1]
    const pair = (s: string): number => parseInt(s + s, 16)
    if (digits.length === 3 || digits.length === 4) {
      const chars = digits.split('')
      const r = pair(chars[0] ?? '0')
      const g = pair(chars[1] ?? '0')
      const b = pair(chars[2] ?? '0')
      const a = digits.length === 4 ? pair(chars[3] ?? 'f') / 255 : 1
      return [r, g, b, a]
    }
    if (digits.length === 6 || digits.length === 8) {
      const r = parseInt(digits.slice(0, 2), 16)
      const g = parseInt(digits.slice(2, 4), 16)
      const b = parseInt(digits.slice(4, 6), 16)
      const a = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1
      return [r, g, b, a]
    }
    return null
  }
  const fn = value.match(/^rgba?\(([^)]+)\)$/)
  if (fn?.[1]) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean)
    const rRaw = parts[0]
    const gRaw = parts[1]
    const bRaw = parts[2]
    if (rRaw == null || gRaw == null || bRaw == null) return null
    const chan = (ch: string): number => (ch.endsWith('%') ? (parseFloat(ch) / 100) * 255 : parseFloat(ch))
    const r = chan(rRaw)
    const g = chan(gRaw)
    const b = chan(bRaw)
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null
    let a = 1
    const aRaw = parts[3]
    if (aRaw != null) {
      a = aRaw.endsWith('%') ? parseFloat(aRaw) / 100 : parseFloat(aRaw)
      if (isNaN(a)) return null
    }
    return [Math.round(r), Math.round(g), Math.round(b), a]
  }
  return null
}

function rgba(rgb: [number, number, number], alpha: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

/**
 * 颜色声明 → 标签三件套。语义色调走预设盘；CSS 颜色按透明度衍生
 * （背景 10% / 描边 28% / 文字原色，继承声明自身的 alpha）。
 * 无法识别的写法返回 null（调用方回落默认样式）。
 */
export function resolveEnumTagStyle(color?: string): EnumTagStyle | null {
  if (!color) return null
  const key = color.trim()
  const preset = key === 'default'
    ? TONE_PRESETS[NEUTRAL_TONE]
    : (TONE_PRESETS as Record<string, EnumTagStyle | undefined>)[key]
  if (preset) return { ...preset }
  const parsed = parseCssColor(color)
  if (!parsed) return null
  const [r, g, b, a] = parsed
  const rgb: [number, number, number] = [r, g, b]
  return {
    background: rgba(rgb, 0.1 * a),
    borderColor: rgba(rgb, 0.28 * a),
    color: rgba(rgb, a),
  }
}

/** 枚举取色：options[].color 优先，statusMap 兜底；宽松字符串比较（后端数值/字符串枚举均可命中） */
export function resolveEnumColor(
  value: unknown,
  options: SelectOption[] | undefined,
  statusMap: Record<string, string> | undefined,
): string | undefined {
  if (value == null || value === '') return undefined
  const key = String(value)
  const opt = options?.find(o => o.value === value || String(o.value) === key)
  return opt?.color ?? statusMap?.[key] ?? undefined
}
