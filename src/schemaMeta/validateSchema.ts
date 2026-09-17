import { FIELD_SCHEMA_KEYS } from './fieldMeta'
import { MODULE_SCHEMA_KEYS } from './moduleMeta'

/**
 * 运行时 Schema 诊断（docs/19 批次 I2）：宿主运行时灌入的 JSON 无编译期类型保护,
 * 本校验器给出字段级报错。schemaMeta 的穷举键表（FIELD_SCHEMA_KEYS/MODULE_SCHEMA_KEYS）
 * 提供合法键集合,未知键降级为 warning（对宿主宽松,允许透传自定义数据）。
 *
 * SchemaEngine 在 setSchema 之前调用;DEV 环境 console.warn 分组输出,不阻断加载
 * （引擎对缺失字段均有运行时兜底,报错定位交给宿主修数据）。
 */

export interface SchemaDiagnostic {
  /** error = 建议必须修复（会导致渲染/编辑异常）;warning = 提示性 */
  level: 'error' | 'warning'
  /** 诊断位置,如 `name`、`fields[2].targetModule` */
  path: string
  message: string
}

/** FieldType 联合的运行时清单（types/schema.ts FieldType） */
const FIELD_TYPES: ReadonlySet<string> = new Set([
  'text', 'number', 'date', 'datetime', 'boolean', 'select', 'multi-select', 'status',
  'fk', 'one-to-many', 'many-to-many', 'reverse-ref', 'formula',
  'percent', 'currency', 'money', 'phone', 'email', 'url',
  'image', 'mediaImage', 'attachment', 'json', 'action',
])

const MODULE_KEYS = new Set(Object.keys(MODULE_SCHEMA_KEYS))
const FIELD_KEYS = new Set(Object.keys(FIELD_SCHEMA_KEYS))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 校验模块 Schema,返回诊断列表（合法 schema 返回空数组）。
 * 入参放宽为 unknown——运行时灌入的 JSON 不受编译期类型约束。
 */
export function validateSchema(schema: unknown): SchemaDiagnostic[] {
  const diagnostics: SchemaDiagnostic[] = []
  const push = (level: SchemaDiagnostic['level'], path: string, message: string): void => {
    diagnostics.push({ level, path, message })
  }

  if (!isRecord(schema)) {
    push('error', '', 'Schema 必须是对象')
    return diagnostics
  }

  // ── 模块级必填 ──
  if (typeof schema.id !== 'string' || schema.id === '') {
    push('error', 'id', '缺少模块 id 或不是非空字符串')
  }
  if (typeof schema.name !== 'string' || schema.name === '') {
    push('error', 'name', '缺少模块 name 或不是非空字符串')
  }
  if (!Array.isArray(schema.fields)) {
    push('error', 'fields', 'fields 必须是数组')
    return diagnostics
  }
  if (schema.fields.length === 0) {
    push('error', 'fields', 'fields 不能为空（至少一个字段）')
  }

  // ── 模块级未知键 ──
  for (const key of Object.keys(schema)) {
    if (!MODULE_KEYS.has(key)) {
      push('warning', key, `未知的模块级配置项「${key}」,引擎将忽略（允许透传宿主自定义数据）`)
    }
  }

  // ── 字段级 ──
  const seenKeys = new Set<string>()
  schema.fields.forEach((rawField, index) => {
    const path = `fields[${index}]`
    if (!isRecord(rawField)) {
      push('error', path, '字段必须是对象')
      return
    }

    const label = typeof rawField.label === 'string' ? rawField.label : rawField.key

    if (typeof rawField.key !== 'string' || rawField.key === '') {
      push('error', `${path}.key`, '缺少字段 key 或不是非空字符串')
    } else if (seenKeys.has(rawField.key)) {
      push('error', `${path}.key`, `字段 key「${rawField.key}」重复`)
    } else {
      seenKeys.add(rawField.key)
    }

    if (typeof rawField.name !== 'string' || rawField.name === '') {
      push('error', `${path}.name`, `${label ?? ''} 缺少字段 name 或不是非空字符串`)
    }

    if (typeof rawField.type !== 'string' || !FIELD_TYPES.has(rawField.type)) {
      push('error', `${path}.type`, `${label ?? ''} 字段类型「${String(rawField.type)}」非法`)
    }

    if (typeof rawField.type === 'string') {
      const typeLabel = label ?? ''
      // 各关系类型的归属声明方式不同(fk/one-to-many 顶层 targetModule;
      // many-to-many 用 relationConfig.targetModule;reverse-ref 用 reverseRefConfig.sourceModules)
      if (rawField.type === 'fk' || rawField.type === 'one-to-many') {
        if (typeof rawField.targetModule !== 'string' || rawField.targetModule === '') {
          push('error', `${path}.targetModule`, `${typeLabel} 关系字段（${rawField.type}）缺少 targetModule`)
        }
      } else if (rawField.type === 'many-to-many') {
        const relation = isRecord(rawField.relationConfig) ? rawField.relationConfig : {}
        if (typeof rawField.targetModule !== 'string' && typeof relation.targetModule !== 'string') {
          push('error', `${path}.relationConfig`, `${typeLabel} 多对多字段缺少 relationConfig.targetModule（或顶层 targetModule）`)
        }
      } else if (rawField.type === 'reverse-ref') {
        const ref = isRecord(rawField.reverseRefConfig) ? rawField.reverseRefConfig : {}
        if (!Array.isArray(ref.sourceModules) || ref.sourceModules.length === 0) {
          push('error', `${path}.reverseRefConfig`, `${typeLabel} 反向引用字段缺少 reverseRefConfig.sourceModules`)
        }
      }
    }

    for (const key of Object.keys(rawField)) {
      if (!FIELD_KEYS.has(key)) {
        push('warning', `${path}.${key}`, `未知的字段配置项「${key}」,引擎将忽略（允许透传宿主自定义数据）`)
      }
    }

    if ((rawField.type === 'select' || rawField.type === 'status' || rawField.type === 'multi-select')
      && !Array.isArray(rawField.options)) {
      push('warning', `${path}.options`, `${label ?? ''} 枚举字段未声明 options,将无法渲染枚举标签与候选值`)
    }

    if (rawField.order !== undefined && typeof rawField.order !== 'number') {
      push('warning', `${path}.order`, `${label ?? ''} order 应为数字（列排序依据）`)
    }
  })

  return diagnostics
}

/** 诊断的 console 友好输出（DEV 环境 SchemaEngine 加载前调用） */
export function reportSchemaDiagnostics(moduleId: string, diagnostics: SchemaDiagnostic[]): void {
  if (diagnostics.length === 0) return
  const errors = diagnostics.filter(d => d.level === 'error')
  const warnings = diagnostics.filter(d => d.level === 'warning')
  console.warn(
    `[schemagine] Schema 诊断：模块「${moduleId}」发现 ${errors.length} 个错误、${warnings.length} 个提示\n` +
    diagnostics.map(d => `  [${d.level}] ${d.path}: ${d.message}`).join('\n'),
  )
}
