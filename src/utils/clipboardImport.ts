import type { FieldSchema } from '@/types'

/**
 * Excel 剪贴板导入工具：
 *  1. parseTsvGrid      —— 解析 Excel 复制的 TSV 文本（含引号包裹的换行/Tab 单元格）
 *  2. guessHeaderMapping —— 按第一行猜测各列对应的 Schema 字段
 *  3. convertCellValue   —— 按字段类型把单元格文本转换为草稿字段值
 *  4. isImportableField  —— 过滤不可导入的字段类型
 */

/** 解析 Excel 复制的 TSV 文本为二维网格。自动过滤整行为空的行 */
export function parseTsvGrid(text: string): string[][] {
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
    } else if (ch === '\t') {
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
