/**
 * Condition evaluation: object form (engine `visibleWhen` dialect), triplet form
 * `[field, operator, operand]`, and expression strings — one unified entry.
 */
import type {
  AnyCondition,
  AtomicCondition,
  Condition,
  ConditionOperator,
  ConditionValueRef,
  EvalContext,
} from './types'

export function getPathValue(obj: unknown, path: string): unknown {
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

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

/** Ordered comparison: fall back to string comparison when either side is not numeric. */
function compareOrdered(
  left: unknown,
  right: unknown,
  cmp: (n: number, m: number) => boolean,
  strCmp: (a: string, b: string) => boolean,
): boolean {
  const ln = Number(left)
  const rn = Number(right)
  if (Number.isNaN(ln) || Number.isNaN(rn)) return strCmp(String(left), String(right))
  return cmp(ln, rn)
}

export function compareValues(operator: ConditionOperator, left: unknown, right: unknown): boolean {
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

function resolveRef(ref: ConditionValueRef | undefined, ctx: EvalContext): unknown {
  if (!ref) return undefined
  if ('value' in ref) return ref.value
  if ('record' in ref) return getPathValue(ctx.record, ref.record)
  if ('global' in ref) return getPathValue(ctx.form ?? {}, ref.global)
  return undefined
}

function isConditionValueRef(v: unknown): v is ConditionValueRef {
  return typeof v === 'object' && v !== null && ('value' in v || 'record' in v || 'global' in v)
}

function evalAtomic(cond: AtomicCondition, ctx: EvalContext): boolean {
  const left = resolveRef(cond.left, ctx)
  const right = resolveRef(cond.right, ctx)
  return compareValues(cond.operator, left, right)
}

function evalObjectForm(cond: Condition | undefined, ctx: EvalContext): boolean {
  if (!cond) return true
  if ('and' in cond) return (cond.and ?? []).every(c => evalObjectForm(c, ctx))
  if ('or' in cond) return (cond.or ?? []).some(c => evalObjectForm(c, ctx))
  if ('not' in cond) return !evalObjectForm(cond.not, ctx)
  return evalAtomic(cond as AtomicCondition, ctx)
}

function isTriplet(cond: unknown): cond is [string, ConditionOperator, unknown] {
  return Array.isArray(cond) && cond.length >= 2 && typeof cond[0] === 'string'
}

/**
 * Unified condition entry.
 * - `undefined` passes (empty condition is always true);
 * - string form is evaluated as an expression in the scope built by `buildExpressionScope`
 *   (requires the injected `evaluate`);
 * - triplet form reads `left` from the record, `right` stays a literal unless it is a
 *   `ConditionValueRef` object.
 */
export function evalCondition(
  cond: AnyCondition | undefined,
  ctx: EvalContext,
  evaluate?: (expr: string, scope?: Record<string, unknown>) => unknown,
): boolean {
  if (cond === undefined || cond === null) return true
  if (typeof cond === 'string') {
    if (!evaluate) return false
    const result = evaluate(cond, buildExpressionScope(ctx))
    return Boolean(result)
  }
  if (isTriplet(cond)) {
    const [fieldPath, operator, operand] = cond
    const left = getPathValue(ctx.record, fieldPath)
    const right = isConditionValueRef(operand)
      ? resolveRef(operand as ConditionValueRef, ctx)
      : operand
    return compareValues(operator, left, right)
  }
  return evalObjectForm(cond as Condition, ctx)
}

/**
 * Expression scope: flat record fields, `$new`/`$old`/`$form`/`$scene`/`$flow`
 * context variables, then the merged function table (host functions may be
 * called from expressions, e.g. `qty(x) > 0`).
 */
export function buildExpressionScope(
  ctx: EvalContext,
  functions?: Record<string, unknown>,
  flowScope?: Record<string, unknown>,
): Record<string, unknown> {
  const scope: Record<string, unknown> = {
    ...ctx.record,
    $new: ctx.$new,
    $old: ctx.$old,
    $form: ctx.form,
    $scene: ctx.scene,
    $flow: flowScope,
    ...functions,
  }
  return scope
}
