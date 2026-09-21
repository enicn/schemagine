/**
 * 表格导出通道（docs/19 批次 G4）：CSV 与 xlsx 共用的矩阵构建 + 下载。
 *
 * - 矩阵：schema 字段 × 行 → 表头/字符串二维表（单元格文本化与列表渲染同口径：
 *   外键取关联名、枚举取 label、布尔取是/否）；
 * - CSV：BOM + 公式注入防护（=+-@ 前置 '）；
 * - xlsx：可选 peer 依赖 `xlsx`，未安装时返回 missing-peer，由调用方决定回退
 *   CSV 或提示（引擎不捆绑，避免体积强加给宿主）。
 */
import type { FieldSchema } from '@/types'

export interface ExportMatrix {
  headers: string[]
  rows: string[][]
}

/** 单元格文本化：外键取关联名标签；枚举取 options 标签；布尔取是/否；结构化值 JSON 化 */
export function exportCellText(field: FieldSchema, row: Record<string, unknown>): string {
  const raw = row[`${field.key}_label`] ?? row[field.key]
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'boolean') return raw ? '是' : '否'
  if ((field.type === 'select' || field.type === 'status') && field.options?.length) {
    const opt = field.options.find(o => String(o.value) === String(raw))
    if (opt) return String(opt.label)
  }
  if (Array.isArray(raw) || typeof raw === 'object') return JSON.stringify(raw)
  return String(raw)
}

export function buildExportMatrix(fields: FieldSchema[], rows: Array<Record<string, unknown>>): ExportMatrix {
  return {
    headers: fields.map(f => f.label),
    rows: rows.map(row => fields.map(f => exportCellText(f, row))),
  }
}

/** CSV 单元格转义：防公式注入（=+-@ 开头前置 '）与引号/换行 */
export function csvEscapeCell(text: string): string {
  let v = text
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`
  if (/[",\n\r]/.test(v)) v = `"${v.replace(/"/g, '""')}"`
  return v
}

export function exportTimestamp(): string {
  const d = new Date()
  const p = (n: number): string => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

/** CSV 下载：BOM 头保证 Excel 直开不乱码 */
export function downloadCsvFile(baseName: string, matrix: ExportMatrix): void {
  const lines = [matrix.headers.map(csvEscapeCell).join(',')]
  for (const row of matrix.rows) {
    lines.push(row.map(csvEscapeCell).join(','))
  }
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `${baseName}_${exportTimestamp()}.csv`)
}

export type XlsxExportResult = 'ok' | 'missing-peer'

/** xlsx 下载：peer 依赖 `xlsx` 动态加载，未安装返回 missing-peer（调用方回退/提示） */
export async function downloadXlsxFile(baseName: string, matrix: ExportMatrix, colWidths?: Array<number | undefined>): Promise<XlsxExportResult> {
  let XLSX: typeof import('xlsx')
  try {
    XLSX = await import('xlsx')
  } catch {
    return 'missing-peer'
  }
  const ws = XLSX.utils.aoa_to_sheet([matrix.headers, ...matrix.rows])
  // 列宽(docs/20)：声明了界面列宽(px)则按比例换算(wch ≈ px/7)，未声明的列按表头/内容粗略自适应
  const widthByCol = matrix.headers.map((h, i) => {
    const px = colWidths?.[i]
    if (px && px > 0) return { wch: Math.min(60, Math.max(8, Math.round(px / 7))) }
    let w = String(h).length
    for (const row of matrix.rows) w = Math.max(w, (row[i] ?? '').length)
    return { wch: Math.min(40, Math.max(10, w + 2)) }
  })
  ws['!cols'] = widthByCol
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  triggerDownload(blob, `${baseName}_${exportTimestamp()}.xlsx`)
  return 'ok'
}
