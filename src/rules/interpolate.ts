/**
 * `{{expr}}` template interpolation for lookup search templates and flow params.
 * Plain paths are resolved without an evaluator; anything else needs the
 * injected `evaluate`.
 */
import { getPathValue } from './condition'

const TEMPLATE_RE = /\{\{([^{}]+)\}\}/g

const PATH_RE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/

export function interpolate(
  template: string,
  scope: Record<string, unknown>,
  evaluate?: (expr: string, scope?: Record<string, unknown>) => unknown,
): string {
  if (!template || typeof template !== 'string') return template
  return template.replace(TEMPLATE_RE, (_match, raw: string) => {
    const expr = String(raw).trim()
    if (PATH_RE.test(expr)) {
      const v = getPathValue(scope, expr)
      return v === undefined || v === null ? '' : String(v)
    }
    if (evaluate) {
      try {
        const v = evaluate(expr, scope)
        return v === undefined || v === null ? '' : String(v)
      } catch {
        return ''
      }
    }
    return ''
  })
}

/** Deep interpolation of params/body payloads (strings inside objects/arrays). */
export function interpolateDeep(
  value: unknown,
  scope: Record<string, unknown>,
  evaluate?: (expr: string, scope?: Record<string, unknown>) => unknown,
): unknown {
  if (typeof value === 'string') return interpolate(value, scope, evaluate)
  if (Array.isArray(value)) return value.map(v => interpolateDeep(v, scope, evaluate))
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = interpolateDeep(v, scope, evaluate)
    return out
  }
  return value
}

/**
 * Lookup key resolution: a non-empty list at the record path `rule.keysFrom`
 * overrides the static `rule.keys` (覆盖回落).
 */
export function resolveLookupKeys(
  rule: { keys?: string[]; keysFrom?: string },
  record: Record<string, unknown>,
): string[] {
  if (rule.keysFrom) {
    const override = getPathValue(record, rule.keysFrom)
    if (Array.isArray(override) && override.length > 0) {
      return override.filter((k): k is string => typeof k === 'string')
    }
  }
  return Array.isArray(rule.keys) ? [...rule.keys] : []
}
