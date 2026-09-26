import type { Condition, ConditionOperator, ConditionValueRef, FieldSchema } from '@/types'

export interface ConditionEvalContext {
  record: Record<string, unknown>
  global: Record<string, unknown>
}

/**
 * 条件表达式求值接缝（宿主注入）：引擎表格路径的条件求值（rowAction.visibleWhen、
 * labelWhen、rowValidationRules、行内编辑 editableWhen）不经 rules runtime——
 * 字符串（表达式串）与三段形条件需要宿主提供求值器与函数词典。宿主在安装引擎
 * 环境时调用 registerConditionEvaluator（与 rules 包 buildExpressionScope 同构：
 * 平铺行字段 + $form + 函数表），未注册时字符串条件恒 false（fail-closed）。
 */
type ConditionExpressionEvaluator = (expr: string, scope: Record<string, unknown>) => unknown
let conditionEvaluator: ConditionExpressionEvaluator | null = null
let conditionFunctions: Record<string, unknown> = {}
const warnedExpressions = new Set<string>()

export function registerConditionEvaluator(options: { evaluate?: ConditionExpressionEvaluator, functions?: Record<string, unknown> }): void {
  if (options.evaluate) conditionEvaluator = options.evaluate
  if (options.functions) conditionFunctions = options.functions
}

/** 表达式串作用域：平铺行字段 + $form(=ctx.global) + 宿主函数（与 rules 包同构） */
function buildExpressionScope(ctx: ConditionEvalContext): Record<string, unknown> {
  return { ...ctx.record, $form: ctx.global, ...conditionFunctions }
}

function isConditionValueRef(v: unknown): v is ConditionValueRef {
  return typeof v === 'object' && v !== null && ('value' in v || 'record' in v || 'global' in v)
}

function isTripletCondition(v: unknown): v is [string, ConditionOperator, unknown?] {
  return Array.isArray(v) && v.length >= 2 && typeof v[0] === 'string'
}

function getPathValue(obj: unknown, path: string): unknown {
  if (!path) return undefined
  const segments = path.split('.').filter(Boolean)
  let cur: unknown = obj
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

function resolveValueRef(ref: ConditionValueRef | undefined, ctx: ConditionEvalContext): unknown {
  if (!ref) return undefined
  if ('value' in ref) return ref.value
  if ('record' in ref) return getPathValue(ctx.record, ref.record)
  if ('global' in ref) return getPathValue(ctx.global, ref.global)
  return undefined
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

/** 数值比较:任一侧转不成数字(如 ISO 日期字符串)时回落字符串比较 */
function compareOrdered(left: unknown, right: unknown, cmp: (n: number, m: number) => boolean, strCmp: (a: string, b: string) => boolean): boolean {
  const ln = Number(left)
  const rn = Number(right)
  if (Number.isNaN(ln) || Number.isNaN(rn)) return strCmp(String(left), String(right))
  return cmp(ln, rn)
}

function compare(operator: ConditionOperator, left: unknown, right: unknown): boolean {
  switch (operator) {
    case 'eq':
      return left === right
    case 'neq':
      return left !== right
    case 'gt':
      return compareOrdered(left, right, (a, b) => a > b, (a, b) => a > b)
    case 'gte':
      return compareOrdered(left, right, (a, b) => a >= b, (a, b) => a >= b)
    case 'lt':
      return compareOrdered(left, right, (a, b) => a < b, (a, b) => a < b)
    case 'lte':
      return compareOrdered(left, right, (a, b) => a <= b, (a, b) => a <= b)
    case 'in':
      return Array.isArray(right) ? right.includes(left as never) : false
    case 'notIn':
      return Array.isArray(right) ? !right.includes(left as never) : false
    case 'contains':
      if (typeof left === 'string' && typeof right === 'string') return left.includes(right)
      if (Array.isArray(left)) return left.includes(right as never)
      return false
    case 'startsWith':
      return typeof left === 'string' && typeof right === 'string' ? left.startsWith(right) : false
    case 'endsWith':
      return typeof left === 'string' && typeof right === 'string' ? left.endsWith(right) : false
    case 'isEmpty':
      return isEmptyValue(left)
    case 'notEmpty':
      return !isEmptyValue(left)
    case 'exists':
      return left !== undefined
    case 'notExists':
      return left === undefined
    default:
      return false
  }
}

export function evaluateCondition(condition: Condition | undefined, ctx: ConditionEvalContext): boolean {
  if (!condition) return true

  if (typeof condition === 'string') {
    if (!conditionEvaluator) {
      if (!warnedExpressions.has('#no-evaluator')) {
        warnedExpressions.add('#no-evaluator')
        console.warn('[schemagine] 字符串条件缺少求值器：请先 registerConditionEvaluator（恒按 false 处理）')
      }
      return false
    }
    try {
      return Boolean(conditionEvaluator(condition, buildExpressionScope(ctx)))
    } catch (error) {
      if (!warnedExpressions.has(condition)) {
        warnedExpressions.add(condition)
        console.warn(`[schemagine] 条件表达式求值失败（按 false 处理）：${condition}`, error)
      }
      return false
    }
  }

  if (isTripletCondition(condition)) {
    const [fieldPath, operator, operand] = condition
    const left = getPathValue(ctx.record, fieldPath)
    const right = isConditionValueRef(operand) ? resolveValueRef(operand, ctx) : operand
    return compare(operator, left, right)
  }

  if ('and' in condition) {
    const list = condition.and ?? []
    return list.every(c => evaluateCondition(c, ctx))
  }
  if ('or' in condition) {
    const list = condition.or ?? []
    return list.some(c => evaluateCondition(c, ctx))
  }
  if ('not' in condition) {
    return !evaluateCondition(condition.not, ctx)
  }

  const left = resolveValueRef(condition.left, ctx)
  const right = resolveValueRef(condition.right, ctx)
  return compare(condition.operator, left, right)
}

export function isFieldVisibleInContext(field: FieldSchema, ctx: ConditionEvalContext): boolean {
  if (field.visible === false) return false
  if (field.permission && field.permission.visible === false) return false
  return evaluateCondition(field.visibleWhen, ctx)
}

export function isFieldEditableInContext(field: FieldSchema, ctx: ConditionEvalContext): boolean {
  if (field.readonly) return false
  if (field.permission && field.permission.editable === false) return false
  return evaluateCondition(field.editableWhen, ctx)
}

