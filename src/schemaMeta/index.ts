export type {
  EnumValueMeta,
  MetaGroup,
  MetaKind,
  MetaSurface,
  PropertyMeta,
} from './types'
export {
  FIELD_META,
  FIELD_SCHEMA_KEYS,
  FIELD_TYPE_VALUES,
} from './fieldMeta'
export { MODULE_META, MODULE_SCHEMA_KEYS } from './moduleMeta'
import type { FieldType } from '@/types'
import type { MetaGroup, MetaKind, MetaSurface, PropertyMeta } from './types'
import { FIELD_META } from './fieldMeta'
import { MODULE_META } from './moduleMeta'

export const META_GROUP_LABELS: Record<MetaGroup, string> = {
  basic: '基础',
  display: '展示',
  edit: '编辑',
  filter: '筛选',
  condition: '条件与权限',
  relation: '关系',
  formula: '公式',
}

export const META_GROUP_ORDER: MetaGroup[] = [
  'basic', 'display', 'edit', 'filter', 'condition', 'relation', 'formula',
]

export const META_SURFACE_LABELS: Record<MetaSurface, string> = {
  render: '列表渲染',
  'inline-edit': '行内编辑',
  filter: '列头筛选',
  form: '表单(新建/编辑)',
  card: '卡片视图',
}

export const META_KIND_LABELS: Record<MetaKind, string> = {
  string: '字符串',
  number: '数字',
  boolean: '布尔',
  enum: '枚举',
  'string[]': '字符串数组',
  unknown: '任意值',
  options: '选项数组',
  rules: '校验规则数组',
  object: '对象',
  condition: '条件表达式',
  none: '结构性',
}

/** 取适用于指定字段类型的属性元数据(模块属性请用 getModuleProperties) */
export function getFieldProperties(type: FieldType): PropertyMeta[] {
  return FIELD_META.filter(m => m.appliesTo === 'all' || m.appliesTo.includes(type))
}

/** 取模块顶层属性元数据 */
export function getModuleProperties(): PropertyMeta[] {
  return MODULE_META
}

/** 关键词搜索(命中 key/label/description),可选限定字段类型 */
export function searchMeta(keyword: string, fieldType?: FieldType): PropertyMeta[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) {
    return fieldType ? getFieldProperties(fieldType) : [...FIELD_META, ...MODULE_META]
  }
  const pool = fieldType ? getFieldProperties(fieldType) : [...FIELD_META, ...MODULE_META]
  return pool.filter(m =>
    m.key.toLowerCase().includes(kw)
    || m.label.toLowerCase().includes(kw)
    || m.description.toLowerCase().includes(kw),
  )
}

/** 按属性 key 精确查找 */
export function findMeta(key: string, target: PropertyMeta['target']): PropertyMeta | undefined {
  const pool = target === 'field' ? FIELD_META : MODULE_META
  return pool.find(m => m.key === key)
}

/** 按编辑分组聚合(保持 META_GROUP_ORDER 顺序) */
export function groupProperties(metas: PropertyMeta[]): Array<{ group: MetaGroup; items: PropertyMeta[] }> {
  return META_GROUP_ORDER
    .map(group => ({ group, items: metas.filter(m => m.group === group) }))
    .filter(g => g.items.length > 0)
}
