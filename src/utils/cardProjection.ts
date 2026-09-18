import type { ModuleSchema, FieldSchema, CardViewConfig } from '@/types'

/**
 * 移动端卡片投影（管理端移动适配 §3.4）：零配置可用是本方案卖点——
 * 规则按 schema 推导默认值，ModuleSchema.cardView 声明的项逐项覆盖。
 */

/** 卡片元字段/标题排除的类型：媒体类出缩略图、动作/关联类在卡片上是噪音 */
const CARD_EXCLUDED_TYPES = new Set<FieldSchema['type']>([
  'action',
  'image',
  'mediaImage',
  'attachment',
  'one-to-many',
  'many-to-many',
  'reverse-ref',
  'json',
])

/** 默认元字段条数（title/status/thumb 之外的补充信息行） */
const DEFAULT_META_FIELD_COUNT = 4

export interface CardProjection {
  /** 卡片标题字段 key；空串时渲染层以 record.id 兜底 */
  titleField: string
  /** 状态标签字段 key；null 不出状态标签 */
  statusField: string | null
  /** 元字段行 key 列表（· 连接，ValueRenderer 渲染） */
  fields: string[]
  /** 缩略图字段 key；null 不出缩略图 */
  thumbField: string | null
}

function visibleFields(schema: ModuleSchema): FieldSchema[] {
  return schema.fields.filter(f => f.visible !== false && f.type !== 'action')
}

function resolveTitleField(schema: ModuleSchema, fields: FieldSchema[]): string {
  if (schema.cardView?.titleField) return schema.cardView.titleField
  // 第一个 text 型字段（标题语义）；无则交由渲染层以 record.id 兜底
  return fields.find(f => f.type === 'text')?.key ?? ''
}

function resolveStatusField(schema: ModuleSchema, fields: FieldSchema[]): string | null {
  if (schema.cardView?.statusField) return schema.cardView.statusField
  const byName = fields.find(
    f => f.key === 'status' && (f.type === 'select' || f.type === 'status'),
  )
  if (byName) return byName.key
  // 兜底：第一个带 options/statusMap 的 select/status 字段
  const firstEnum = fields.find(
    f => (f.type === 'select' || f.type === 'status') && ((f.options?.length ?? 0) > 0 || !!f.statusMap),
  )
  return firstEnum?.key ?? null
}

function resolveThumbField(schema: ModuleSchema, fields: FieldSchema[]): string | null {
  if (schema.cardView?.thumbField) return schema.cardView.thumbField
  const media = fields.find(f => f.type === 'mediaImage' || f.type === 'image')
  return media?.key ?? null
}

function resolveMetaFields(
  schema: ModuleSchema,
  fields: FieldSchema[],
  used: Set<string>,
): string[] {
  if (schema.cardView?.fields?.length) return schema.cardView.fields
  return fields
    .filter(f => !used.has(f.key) && !CARD_EXCLUDED_TYPES.has(f.type))
    .slice(0, DEFAULT_META_FIELD_COUNT)
    .map(f => f.key)
}

/** 由 schema 推导卡片投影；cardView 声明项逐项覆盖推导默认值 */
export function deriveCardProjection(schema: ModuleSchema): CardProjection {
  const fields = visibleFields(schema)
  const config: CardViewConfig = schema.cardView ?? {}

  const titleField = resolveTitleField(schema, fields)
  const statusField = resolveStatusField(schema, fields)
  const thumbField = resolveThumbField(schema, fields)

  const used = new Set<string>()
  if (titleField) used.add(titleField)
  if (statusField) used.add(statusField)
  if (thumbField) used.add(thumbField)

  const metaFields = resolveMetaFields(schema, fields, used)

  return { titleField, statusField, fields: metaFields, thumbField }
}

/**
 * 顶部搜索字段集（§3.6）：schema.searchFields 声明优先（裁掉不存在/不可见字段），
 * 缺省取第一个可见 text 字段；模块无 text 字段返回空数组（搜索框不渲染）。
 */
export function resolveSearchFields(schema: ModuleSchema): string[] {
  const fields = visibleFields(schema)
  if (schema.searchFields?.length) {
    const known = new Set(fields.map(f => f.key))
    const declared = schema.searchFields.filter(k => known.has(k))
    if (declared.length > 0) return declared
  }
  const firstText = fields.find(f => f.type === 'text')
  return firstText ? [firstText.key] : []
}
