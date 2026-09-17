import type { FieldSchema } from '@/types'
import { validateFieldValue } from '@/utils/fieldValidation'

/**
 * 表格数据导入工具（docs/19 批次 H5；剪贴板粘贴与文件导入共用）：
 *  1. parseTsvGrid      —— 解析 Excel 复制的 TSV 文本（含引号包裹的换行/Tab 单元格）
 *  2. parseCsvGrid      —— 解析 CSV 文件文本（BOM、引号转义、分隔符嗅探 , ; Tab）
 *  3. parseXlsxGrid     —— 解析 xlsx 文件二进制（可选 peer 依赖 xlsx，与 G4 导出共用）
 *  4. guessHeaderMapping —— 按第一行猜测各列对应的 Schema 字段
 *  5. convertCellValue   —— 按字段类型把单元格文本转换为草稿字段值
 *  6. precheckImportRows —— 行级预检：逐行逐字段报错（行号定位），错误行可跳过或中止
 *  7. isImportableField  —— 过滤不可导入的字段类型
 */

/** 解析 Excel 复制的 TSV 文本为二维网格。自动过滤整行为空的行 */
export function parseTsvGrid(text: string): string[][] {
  return parseDelimitedGrid(text, '\t')
}

/** 按指定分隔符解析引号感知的二维网格。自动过滤整行为空的行 */
export function parseDelimitedGrid(text: string, delimiter: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const flushCell = (): void => {
    row.push(cell)
    cell = ''
  }

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      flushCell()
    } else if (ch === '\n') {
      flushCell()
      rows.push(row)
      row = []
    } else {
      cell += ch
    }
  }
  flushCell()
  // 末尾无换行时收尾行；仅剩一个空单元格说明是结尾分隔符，丢弃
  if (row.length > 1 || row[0] !== '') {
    rows.push(row)
  }

  return rows.filter(r => r.some(c => c.trim() !== ''))
}

/** CSV 分隔符候选：取首行出现次数最多者（欧洲 locale 分号、Excel 另存制表符均兼容） */
function sniffDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  let best = ','
  let bestCount = -1
  for (const d of [',', ';', '\t']) {
    const count = firstLine.split(d).length - 1
    if (count > bestCount) {
      best = d
      bestCount = count
    }
  }
  return best
}

/** 解析 CSV 文件文本：去 BOM、嗅探分隔符、引号转义。自动过滤整行为空的行 */
export function parseCsvGrid(text: string): string[][] {
  const stripped = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
  return parseDelimitedGrid(stripped, sniffDelimiter(stripped))
}

export type XlsxParseResult =
  | { grid: string[][] }
  | { error: 'missing-peer' | 'parse-failed'; message?: string }

/**
 * 解析 xlsx/xls 文件二进制为二维网格（单元格取格式化文本）。
 * 依赖可选 peer `xlsx`（与导出通道共用，docs/19 G4），未安装返回 missing-peer。
 */
export async function parseXlsxGrid(data: ArrayBuffer): Promise<XlsxParseResult> {
  let XLSX: typeof import('xlsx')
  try {
    XLSX = await import('xlsx')
  } catch {
    return { error: 'missing-peer' }
  }
  try {
    const wb = XLSX.read(data, { type: 'array', cellDates: false })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) return { grid: [] }
    const sheet = wb.Sheets[sheetName]!
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
    return { grid: rows.map(row => row.map(cell => String(cell ?? ''))) }
  } catch (err) {
    return { error: 'parse-failed', message: err instanceof Error ? err.message : String(err) }
  }
}

function normalizeHeaderText(text: string): string {
  return text.trim().toLowerCase().replace(/[\s_—·（）()【】\]-]+/g, '')
}

/**
 * 按第一行猜测各列对应的字段。匹配优先级：
 *  1. label / name / key 精确相等
 *  2. 归一化（去空白、下划线、连字符、括号，忽略大小写）后相等
 * 每个字段最多被一列占用；未匹配列返回 null
 */
export function guessHeaderMapping(firstRow: string[], fields: FieldSchema[]): Array<FieldSchema | null> {
  const used = new Set<string>()
  const result: Array<FieldSchema | null> = []

  for (const cell of firstRow) {
    const text = cell.trim()
    let hit: FieldSchema | undefined
    if (text !== '') {
      hit = fields.find(f => !used.has(f.key) && (f.label === text || f.name === text || f.key === text))
    }
    result.push(hit ?? null)
    if (hit) used.add(hit.key)
  }

  for (let i = 0; i < firstRow.length; i++) {
    if (result[i]) continue
    const text = normalizeHeaderText(firstRow[i] ?? '')
    if (text === '') continue
    const hit = fields.find(f =>
      !used.has(f.key) &&
      (normalizeHeaderText(f.label) === text ||
       normalizeHeaderText(f.name) === text ||
       normalizeHeaderText(f.key) === text)
    )
    if (hit) {
      result[i] = hit
      used.add(hit.key)
    }
  }

  return result
}

/** 第一行是否已全部（非空表头单元格）自动匹配成功 */
export function isHeaderFullyMatched(firstRow: string[], mapping: Array<FieldSchema | null>): boolean {
  return firstRow.every((cell, i) => cell.trim() === '' || mapping[i] != null)
}

/** 公式/操作列/关联集合/媒体类字段不支持从文本导入 */
const NON_IMPORTABLE_TYPES = new Set([
  'formula',
  'action',
  'one-to-many',
  'many-to-many',
  'reverse-ref',
  'image',
  'mediaImage',
  'attachment',
])

export function isImportableField(field: FieldSchema): boolean {
  return !NON_IMPORTABLE_TYPES.has(field.type) && !field.readonly
}

function parseNumericText(text: string): number | undefined {
  let t = text.replace(/[¥￥$€£\s,，]/g, '')
  let negative = false
  if (/^\(.*\)$/.test(t)) {
    negative = true
    t = t.slice(1, -1)
  }
  if (t.endsWith('%')) t = t.slice(0, -1)
  const n = Number(t)
  if (t === '' || !Number.isFinite(n)) return undefined
  return negative ? -n : n
}

function parsePercentText(text: string): number | undefined {
  const hasPercent = text.includes('%')
  const n = parseNumericText(text)
  if (n === undefined) return undefined
  return hasPercent ? n / 100 : n
}

const TRUE_TEXTS = ['true', 'yes', 'y', '1', '✓', '✔', '√', '对', '是']
const FALSE_TEXTS = ['false', 'no', 'n', '0', '×', '✗', '错', '否']

function parseBooleanText(text: string, field: FieldSchema): boolean | undefined {
  const lower = text.toLowerCase()
  const trueLabel = (field.trueLabel || '是').toLowerCase()
  const falseLabel = (field.falseLabel || '否').toLowerCase()
  if (lower === trueLabel || TRUE_TEXTS.includes(lower)) return true
  if (lower === falseLabel || FALSE_TEXTS.includes(lower)) return false
  return undefined
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function buildDateText(
  y: number, m: number, d: number,
  hh?: number, mm?: number, ss?: number,
): string | undefined {
  const probe = new Date(y, m - 1, d)
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return undefined
  const datePart = `${y}-${pad2(m)}-${pad2(d)}`
  if (hh === undefined) return datePart
  return `${datePart} ${pad2(hh)}:${pad2(mm ?? 0)}:${pad2(ss ?? 0)}`
}

function normalizeDateText(text: string, type: 'date' | 'datetime'): string {
  // 2026-09-13 / 2026/9/13 / 2026.9.13 / 2026年9月13日（+ 可选 HH:mm[:ss]）
  const ymd = text.match(/^(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})日?(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (ymd) {
    const built = buildDateText(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]), ymd[4] !== undefined ? Number(ymd[4]) : undefined, ymd[5] !== undefined ? Number(ymd[5]) : undefined, ymd[6] !== undefined ? Number(ymd[6]) : undefined)
    if (built) return finalizeDateText(built, type)
  }
  // 9/13/2026（美式 M/D/YYYY，+ 可选时间）
  const mdy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (mdy) {
    const built = buildDateText(Number(mdy[3]), Number(mdy[1]), Number(mdy[2]), mdy[4] !== undefined ? Number(mdy[4]) : undefined, mdy[5] !== undefined ? Number(mdy[5]) : undefined, mdy[6] !== undefined ? Number(mdy[6]) : undefined)
    if (built) return finalizeDateText(built, type)
  }
  return text
}

function finalizeDateText(built: string, type: 'date' | 'datetime'): string {
  if (type === 'date') return built.slice(0, 10)
  return built
}

function mapOptionValue(text: string, field: FieldSchema): unknown {
  const options = field.options ?? []
  const byLabel = options.find(o => o.label === text)
  if (byLabel) return byLabel.value
  const byValue = options.find(o => String(o.value) === text)
  if (byValue) return byValue.value
  return text
}

/** 把单元格文本按字段类型转换为草稿字段值；无法解析/空单元格返回 undefined（保留 schema 默认值通道） */
export function convertCellValue(rawText: string, field: FieldSchema): unknown {
  const text = rawText.trim()
  if (text === '') return undefined

  switch (field.type) {
    case 'number':
    case 'currency':
    case 'money':
      return parseNumericText(text)
    case 'percent':
      return parsePercentText(text)
    case 'date':
    case 'datetime':
      return normalizeDateText(text, field.type)
    case 'boolean':
      return parseBooleanText(text, field)
    case 'select':
    case 'status':
      return mapOptionValue(text, field)
    case 'multi-select':
      return text
        .split(/[、，,;；|/\n]+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => mapOptionValue(s, field))
    default:
      // text / phone / email / url / json / fk（fk 的 label→值解析由调用方异步完成）
      return text
  }
}

/** 行级预检问题(docs/19 H5):rowIndex 为数据行号(1 起,不含表头),供导入向导定位展示 */
export interface ImportRowIssue {
  rowIndex: number
  fieldKey: string | null
  fieldLabel: string | null
  message: string
}

/** 类型中文名,用于"无法解析"类预检提示 */
const FIELD_TYPE_LABELS: Record<string, string> = {
  number: '数字', currency: '金额', money: '金额', percent: '百分比',
  date: '日期', datetime: '日期时间', boolean: '布尔',
}

/**
 * 行级预检(docs/19 H5):按列映射逐行逐字段求值,给出带行号的错误清单。
 * 口径:原始文本非空但类型转换失败 → 解析错误;转换结果过 validateFieldValue
 * (required/validationRules,与保存链路同源)。整行映射列全空的行跳过(导入时本就丢弃)。
 */
export function precheckImportRows(
  dataRows: string[][],
  columnFields: Array<FieldSchema | null>,
): ImportRowIssue[] {
  const issues: ImportRowIssue[] = []

  dataRows.forEach((row, rowIdx) => {
    let hasAnyValue = false
    const rowIssues: ImportRowIssue[] = []

    columnFields.forEach((field, colIdx) => {
      if (!field) return
      const raw = (row[colIdx] ?? '').trim()
      if (raw !== '') hasAnyValue = true

      const converted = convertCellValue(raw, field)
      if (raw !== '' && converted === undefined) {
        const typeLabel = FIELD_TYPE_LABELS[field.type] ?? field.type
        rowIssues.push({
          rowIndex: rowIdx + 1,
          fieldKey: field.key,
          fieldLabel: field.label,
          message: `「${raw}」无法解析为${typeLabel}类型`,
        })
        return
      }
      const result = validateFieldValue(field, converted)
      for (const message of result.errors) {
        rowIssues.push({ rowIndex: rowIdx + 1, fieldKey: field.key, fieldLabel: field.label, message })
      }
    })

    if (hasAnyValue) issues.push(...rowIssues)
  })

  return issues
}
