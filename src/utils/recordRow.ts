// recordRow.ts —— RecordEntity → 表格行的拍平与时间元数据回填。
//
// 背景：created_at / updated_at 是引擎保留的实体级元数据（RecordEntity.createdAt/
// updatedAt）。宿主侧 record adapter 的惯例是把入库时间从 fields 抽到实体元数据，
// 直接 `...r.fields` 拍平会让「模块显式声明了 created_at/updated_at 字段」的场景
// （时间列展示、时间段筛选）拿不到行值。统一在这里回填，行/卡/弹窗共用。
import type { RecordEntity } from '@/types'

export function flattenRecordRow(r: RecordEntity): Record<string, unknown> {
  const row: Record<string, unknown> = {
    _recordId: r.id,
    _version: r.version,
    ...r.fields,
  }
  // 元数据回填：仅当模块声明了该字段且 fields 里没有同键值（宿主未抽走的情形以 fields 为准）
  if (!('created_at' in row) && r.createdAt) row.created_at = r.createdAt
  if (!('updated_at' in row) && r.updatedAt) row.updated_at = r.updatedAt
  // id 同为实体级元数据：宿主 adapter 惯例把 id 抽到 RecordEntity.id（fields 里剥掉），
  // 而模块显式声明 id 列（商户 ID/账号 ID 等）时靠这里回填，行/弹窗共用。
  if (!('id' in row) && r.id != null && r.id !== '') row.id = r.id
  return row
}

// formatDateTimeCell 日期/时间单元格显示：ISO（RFC3339，Go time.Time JSON 序列化）
// → 人读格式；date 只出日期，datetime 出 日期 + 时分；不可解析的原样透出。
export function formatDateTimeCell(value: unknown, type: 'date' | 'datetime'): string {
  if (value === null || value === undefined || value === '') return ''
  const raw = String(value)
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  const p = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  if (type === 'date') return date
  return `${date} ${p(d.getHours())}:${p(d.getMinutes())}`
}
