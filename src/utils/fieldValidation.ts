import type { FieldSchema, RowValidationRule } from '@/types'
import { evaluateCondition } from '@/utils/condition'

/**
 * 字段值/行级校验器(docs/19 批次 D1 + H1/H2):统一求值,供行内编辑、创建视图
 * 保存、快速创建弹窗三个入口共用——同一 schema 三入口同结果。
 *
 * - level='error' 的失败进入 errors(valid=false),'warning' 进入 warnings(不拦截)
 * - field.required 为真时隐式追加 required 检查(消息缺省「请输入{label}」)
 * - custom 规则的 rule.value 约定为函数:(value, field) => true | false | string,
 *   返回 false 用 rule.message,返回字符串则该字符串即错误消息(仅代码内 Schema 可用);
 *   H2 起允许返回 Promise<boolean | string>(如服务端唯一性检查),经
 *   validateFieldValueAsync 在提交链路 await
 * - 行级规则(docs/19 H1):RowValidationRule.when 以整行字段值为 record 上下文
 *   求值(条件系统支持 { record: '字段' } 字段互引,可表达 dateEnd > dateStart)
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
export type CustomRuleResult = true | false | string | Promise<boolean | string>

/**
 * 内置(非 custom)规则单条求值:返回失败消息,通过返回 undefined。
 * 供同步/异步两版校验器共用,避免口径分叉。
 */
function evalBuiltinRule(rule: { type: string; value?: unknown; message?: string }, value: unknown): string | undefined {
  const failMessage = rule.message || `校验未通过: ${rule.type}`
  switch (rule.type) {
    case 'required':
      return isEmptyFieldValue(value) ? failMessage : undefined
    case 'min': {
      const num = Number(value)
      return !Number.isNaN(num) && num < Number(rule.value) ? failMessage : undefined
    }
    case 'max': {
      const num = Number(value)
      return !Number.isNaN(num) && num > Number(rule.value) ? failMessage : undefined
    }
    case 'minLength':
      return String(value).length < Number(rule.value) ? failMessage : undefined
    case 'maxLength':
      return String(value).length > Number(rule.value) ? failMessage : undefined
    case 'pattern': {
      const re = rule.value instanceof RegExp ? rule.value : new RegExp(String(rule.value))
      return !re.test(String(value)) ? failMessage : undefined
    }
    default:
      return undefined
  }
}

function pushResult(result: FieldValidationResult, level: 'error' | 'warning' | undefined, message: string): void {
  if (!message) return
  ;(level === 'warning' ? result.warnings : result.errors).push(message)
}

/** 同步字段校验:custom 仅接受同步返回(Promise 视为未失败,异步口径请走 validateFieldValueAsync) */
export function validateFieldValue(field: FieldSchema, value: unknown): FieldValidationResult {
  const result: FieldValidationResult = { valid: true, errors: [], warnings: [] }

  // field.required 隐式 required(先于显式规则,消息与 QuickCreate 历史口径一致)
  if (field.required && isEmptyFieldValue(value)) {
    result.errors.push(`请输入${field.label}`)
  }

  for (const rule of field.validationRules ?? []) {
    // 空值只由 required 把关,其余规则对空值放行(与表单校验惯例一致)
    if (rule.type !== 'required' && isEmptyFieldValue(value)) continue

    if (rule.type === 'custom') {
      if (typeof rule.value !== 'function') continue
      const r = (rule.value as CustomRuleFn)(value, field)
      if (r === false) pushResult(result, rule.level, rule.message || '')
      else if (typeof r === 'string' && r !== '') pushResult(result, rule.level, r)
      continue
    }
    const failed = evalBuiltinRule(rule, value)
    if (failed) pushResult(result, rule.level, failed)
  }

  result.valid = result.errors.length === 0
  return result
}

/** 异步字段校验(docs/19 H2):custom 可返回 Promise<boolean | string>,提交链路 await */
export async function validateFieldValueAsync(field: FieldSchema, value: unknown): Promise<FieldValidationResult> {
  const result: FieldValidationResult = { valid: true, errors: [], warnings: [] }

  if (field.required && isEmptyFieldValue(value)) {
    result.errors.push(`请输入${field.label}`)
  }

  for (const rule of field.validationRules ?? []) {
    if (rule.type !== 'required' && isEmptyFieldValue(value)) continue

    if (rule.type === 'custom') {
      if (typeof rule.value !== 'function') continue
      const r = await (rule.value as (value: unknown, field: FieldSchema) => CustomRuleResult)(value, field)
      if (r === false) pushResult(result, rule.level, rule.message || '')
      else if (typeof r === 'string' && r !== '') pushResult(result, rule.level, r)
      continue
    }
    const failed = evalBuiltinRule(rule, value)
    if (failed) pushResult(result, rule.level, failed)
  }

  result.valid = result.errors.length === 0
  return result
}

/**
 * 行级校验(docs/19 H1):RowValidationRule[] 以整行字段值为上下文求值,
 * 跨字段规则(如 dateEnd > dateStart)经条件系统的 { record: '字段' } 互引表达。
 * 返回值与字段级校验同构,三入口共用同一口径。
 */
export function validateRecordRow(rules: RowValidationRule[] | undefined, record: Record<string, unknown>): FieldValidationResult {
  const result: FieldValidationResult = { valid: true, errors: [], warnings: [] }
  for (const rule of rules ?? []) {
    const triggered = evaluateCondition(rule.when, { record, global: {} })
    if (!triggered) continue
    pushResult(result, rule.level, rule.message || `校验未通过: ${rule.key}`)
  }
  result.valid = result.errors.length === 0
  return result
}

/**
 * 异步校验竞态闸(docs/19 H2):同一闸顺序发起的多次校验,只有最后一次的结果
 * 会生效;先发起但晚到的结果被丢弃(返回 null),防止旧结果覆盖新输入。
 */
export function createValidationGate() {
  let seq = 0
  return async function run<T>(task: () => Promise<T>): Promise<T | null> {
    const token = ++seq
    const result = await task()
    return token === seq ? result : null
  }
}

/** 汇总为单条人读消息(errors 优先),无消息返回 null */
export function firstValidationMessage(result: FieldValidationResult): string | null {
  return result.errors[0] ?? result.warnings[0] ?? null
}
