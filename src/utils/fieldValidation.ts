import type { FieldSchema } from '@/types'

/**
 * 字段值校验器(docs/19 批次 D1):ValidationRule[] + field.required 的统一求值,
 * 供行内编辑、创建视图保存、快速创建弹窗三个入口共用——同一 schema 三入口同结果。
 *
 * - level='error' 的失败进入 errors(valid=false),'warning' 进入 warnings(不拦截)
 * - field.required 为真时隐式追加 required 检查(消息缺省「请输入{label}」)
 * - custom 规则的 rule.value 约定为函数:(value, field) => true | false | string,
 *   返回 false 用 rule.message,返回字符串则该字符串即错误消息(仅代码内 Schema 可用)
 */

export interface FieldValidationResult {
  /** error 级全部通过为 true;warnings 不影响 valid */
  valid: boolean
  errors: string[]
  warnings: string[]
}

export function isEmptyFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string' && value.trim() === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  return false
}

type CustomRuleFn = (value: unknown, field: FieldSchema) => true | false | string

export function validateFieldValue(field: FieldSchema, value: unknown): FieldValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const push = (list: string[], message: string): void => {
    if (message) list.push(message)
  }

  // field.required 隐式 required(先于显式规则,消息与 QuickCreate 历史口径一致)
  if (field.required && isEmptyFieldValue(value)) {
    errors.push(`请输入${field.label}`)
  }

  for (const rule of field.validationRules ?? []) {
    const sink = rule.level === 'warning' ? warnings : errors
    const fail = (message: string): void => push(sink, message || `校验未通过: ${rule.type}`)

    // 空值只由 required 把关,其余规则对空值放行(与表单校验惯例一致)
    if (rule.type !== 'required' && isEmptyFieldValue(value)) continue

    switch (rule.type) {
      case 'required':
        if (isEmptyFieldValue(value)) fail(rule.message)
        break
      case 'min': {
        const num = Number(value)
        if (!Number.isNaN(num) && num < Number(rule.value)) fail(rule.message)
        break
      }
      case 'max': {
        const num = Number(value)
        if (!Number.isNaN(num) && num > Number(rule.value)) fail(rule.message)
        break
      }
      case 'minLength': {
        if (String(value).length < Number(rule.value)) fail(rule.message)
        break
      }
      case 'maxLength': {
        if (String(value).length > Number(rule.value)) fail(rule.message)
        break
      }
      case 'pattern': {
        const re = rule.value instanceof RegExp ? rule.value : new RegExp(String(rule.value))
        if (!re.test(String(value))) fail(rule.message)
        break
      }
      case 'custom': {
        if (typeof rule.value !== 'function') break
        const result = (rule.value as CustomRuleFn)(value, field)
        if (result === false) fail(rule.message)
        else if (typeof result === 'string' && result !== '') fail(result)
        break
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

/** 汇总为单条人读消息(errors 优先),无消息返回 null */
export function firstValidationMessage(result: FieldValidationResult): string | null {
  return result.errors[0] ?? result.warnings[0] ?? null
}
