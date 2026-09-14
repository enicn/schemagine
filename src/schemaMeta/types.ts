import type { FieldType } from '@/types'

/**
 * Schema 属性元数据 —— Playground 文档/表单生成与文档导出的单一事实来源。
 * 新增 ModuleSchema/FieldSchema 属性时必须同步登记,防漏机制见 index.ts 的
 * FIELD_SCHEMA_KEYS / MODULE_SCHEMA_KEYS 穷举键表与 schemaMeta.spec.ts。
 */

/** 编辑分组(文档表格与编辑表单共用) */
export type MetaGroup =
  | 'basic'
  | 'display'
  | 'edit'
  | 'filter'
  | 'condition'
  | 'relation'
  | 'formula'

/** 生效面:属性在引擎的哪个环节起作用 */
export type MetaSurface =
  | 'render'
  | 'inline-edit'
  | 'filter'
  | 'form'
  | 'card'

/** 值形态,决定编辑模式渲染何种控件 */
export type MetaKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'string[]'
  | 'unknown'
  | 'options'
  | 'rules'
  | 'object'
  | 'condition'
  /** 结构性属性:仅在文档中说明,不提供编辑控件(如 FieldSchema.id、migrations) */
  | 'none'

export interface EnumValueMeta {
  value: string
  label: string
  desc?: string
}

export interface PropertyMeta {
  /** 属性名(与 TS 类型字段名一致) */
  key: string
  target: 'field' | 'module'
  /** 中文显示名 */
  label: string
  group: MetaGroup
  /** 仅 target='field' 有意义;'all' 表示适用全部字段类型 */
  appliesTo: FieldType[] | 'all'
  kind: MetaKind
  /** kind='enum' 时的取值及中文说明 */
  enumValues?: EnumValueMeta[]
  /** 缺省值(按类型声明或引擎行为) */
  default?: unknown
  /** TS 类型中的必填属性 */
  required?: boolean
  /** 引入版本(如 '2.0') */
  since?: string
  /** 生效面;结构性/预留属性为空数组 */
  surfaces: MetaSurface[]
  /** 行为说明:以当前代码实际消费为准;未消费的属性明确标注「预留」 */
  description: string
  /** 示例值,可一键应用到编辑表单 */
  example?: unknown
  /** 相关联的属性 key */
  related?: string[]
}
