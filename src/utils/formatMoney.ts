/**
 * 金额展示口径（全站统一）：默认保留两位小数；源数据在第 2 位之后还存在
 * 有效小数（去掉尾零后非空）时，按实际位数展示。例：
 *   77      → 77.00
 *   0.0100  → 0.01
 *   22.2500 → 22.250
 *   29.375  → 29.375
 * 非数值输入原样返回；空值返回空串（由调用方决定占位符）。
 */
export function formatMoney(value: unknown): string {
  const raw = typeof value === 'number' ? String(value) : String(value ?? '').trim()
  if (raw === '') return ''
  const num = Number(raw)
  if (Number.isNaN(num)) return String(value)
  const dot = raw.indexOf('.')
  const dec = dot >= 0 ? raw.slice(dot + 1) : ''
  const extra = dec.length > 2 ? dec.slice(2).replace(/0+$/, '') : ''
  return num.toFixed(2 + extra.length)
}
