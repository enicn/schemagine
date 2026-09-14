import type { Component } from 'vue'
import type { FieldSchema } from '@/types'

/**
 * 自定义字段类型注册表(docs/19 批次 B1)。
 *
 * 引擎内置 24 种字段类型;宿主可为业务自定义类型(如 'rating'、'color')注册
 * 渲染器与编辑器,引擎在列渲染、表单编辑、行内编辑三处按注册渲染,未注册的
 * 自定义类型回退内置 text 行为。内置类型不允许覆盖。
 *
 * 渲染器输出将被按 v-html 信任,业务数据请自行转义(引擎提供 escapeHtml 导出可用)。
 */

export interface FieldRenderContext {
  /** 单元格原始值 */
  value: unknown
  /** 字段 Schema(含 options/statusMap/decimal 等配置) */
  field: FieldSchema
}

export interface CustomFieldTypeDefinition {
  /** 展示渲染器:输出单元格/卡片 HTML;缺省时按 text 渲染 */
  renderToHtml?: (ctx: FieldRenderContext) => string
  /** 表单/行内编辑器组件:约定 props { value?, modelValue?, fieldSchema, disabled?, readonly? },emit update:model-value */
  editor?: Component
  /** 编辑器值适配:记录值 → 编辑器回显值(缺省原样透传) */
  toEditorValue?: (value: unknown, field: FieldSchema) => unknown
  /** 编辑器值适配:编辑器值 → 记录保存值(缺省原样透传) */
  toRecordValue?: (value: unknown, field: FieldSchema) => unknown
}

const registry = new Map<string, CustomFieldTypeDefinition>()

/** 注册自定义字段类型;type 为空或与内置类型冲突时抛错 */
export function registerFieldType(type: string, definition: CustomFieldTypeDefinition): void {
  if (!type || type.trim() === '') {
    throw new Error('[schemagine] registerFieldType: 字段类型名不能为空')
  }
  if (isBuiltinFieldType(type)) {
    throw new Error(`[schemagine] registerFieldType: 不允许覆盖内置字段类型 "${type}"`)
  }
  if (registry.has(type)) {
    console.warn(`[schemagine] 字段类型 "${type}" 已注册,本次注册将覆盖先前定义`)
  }
  registry.set(type, definition)
}

/** 注销自定义字段类型;内置类型不可注销 */
export function unregisterFieldType(type: string): void {
  if (isBuiltinFieldType(type)) return
  registry.delete(type)
}

export function getFieldTypeDefinition(type: string): CustomFieldTypeDefinition | undefined {
  return registry.get(type)
}

export function isRegisteredFieldType(type: string): boolean {
  return registry.has(type)
}

const BUILTIN_FIELD_TYPES = new Set([
  'text', 'number', 'date', 'datetime', 'boolean', 'select', 'multi-select', 'status',
  'fk', 'one-to-many', 'many-to-many', 'reverse-ref', 'formula', 'percent', 'currency',
  'money', 'phone', 'email', 'url', 'image', 'mediaImage', 'attachment', 'json', 'action',
])

export function isBuiltinFieldType(type: string): boolean {
  return BUILTIN_FIELD_TYPES.has(type)
}
