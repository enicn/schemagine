import type { Condition, ConditionOperator, ConditionValueRef, FieldSchema } from '@/types'

export interface ConditionEvalContext {
  record: Record<string, unknown>
  global: Record<string, unknown>
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

