/**
 * Module compilation: collect rules from module-level and field-level mounts,
 * group them by kind (declaration order preserved), and syntax-check every
 * expression with the injected `parse` (errors become warnings, never throws).
 */
import type {
  CompileWarning,
  CompiledModule,
  Rule,
  RuleType,
  RulesModuleSchema,
} from './types'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Expressions that should be syntax-checked when a `parse` is injected. */
function expressionPaths(rules: Rule[]): Array<{ path: string; expr: string }> {
  const paths: Array<{ path: string; expr: string }> = []
  rules.forEach((rule, i) => {
    if (rule.type === 'compute') paths.push({ path: `rules[${i}].expr`, expr: rule.expr })
    if (rule.type === 'aggregate') paths.push({ path: `rules[${i}].expr`, expr: rule.expr })
  })
  return paths
}

export function compileModule(
  schema: RulesModuleSchema | unknown,
  parse?: (expr: string) => unknown,
): CompiledModule {
  const warnings: CompileWarning[] = []
  const moduleRules: Rule[] = []
  const fieldRules = new Map<string, Rule[]>()

  const pushModule = (rules: unknown, basePath: string): void => {
    if (!Array.isArray(rules)) return
    rules.forEach((rule, i) => {
      if (isRecord(rule) && typeof rule.type === 'string') {
        moduleRules.push(rule as unknown as Rule)
      } else {
        warnings.push({
          path: `${basePath}[${i}]`,
          code: 'RULE_MALFORMED',
          message: 'Rule must be an object with a known "type" field; skipped.',
        })
      }
    })
  }

  pushModule((schema as RulesModuleSchema)?.rules, 'rules')

  const fields = (schema as RulesModuleSchema)?.fields
  if (Array.isArray(fields)) {
    fields.forEach((field, fi) => {
      const key = typeof field?.key === 'string' ? field.key : `fields[${fi}]`
      if (!Array.isArray(field?.rules)) return
      field.rules.forEach((rule, ri) => {
        if (isRecord(rule) && typeof rule.type === 'string') {
          const list = fieldRules.get(key) ?? []
          list.push(rule as unknown as Rule)
          fieldRules.set(key, list)
        } else {
          warnings.push({
            path: `fields[${fi}](key=${key}).rules[${ri}]`,
            code: 'RULE_MALFORMED',
            message: 'Rule must be an object with a known "type" field; skipped.',
          })
        }
      })
    })
  }

  const allRules = [...moduleRules, ...[...fieldRules.values()].flat()]

  if (parse) {
    for (const { path, expr } of expressionPaths(allRules)) {
      if (typeof expr !== 'string' || expr.trim() === '') continue
      try {
        parse(expr)
      } catch (err) {
        warnings.push({
          path,
          code: 'EXPR_SYNTAX',
          message: err instanceof Error ? err.message : 'Expression syntax check failed.',
        })
      }
    }
  }

  const byType = (type: RuleType): Rule[] => allRules.filter(r => r.type === type)

  const flowsWarnings: CompileWarning[] = []
  const flows = (schema as RulesModuleSchema)?.flows
  if (Array.isArray(flows)) {
    flows.forEach((flow, i) => {
      if (!isRecord(flow) || typeof flow.name !== 'string' || !Array.isArray(flow.steps)) {
        flowsWarnings.push({
          path: `flows[${i}]`,
          code: 'FLOW_MALFORMED',
          message: 'Flow must be an object with "name" and "steps".',
        })
      }
    })
  }

  return {
    moduleRules,
    fieldRules,
    computes: byType('compute') as CompiledModule['computes'],
    validates: byType('validate') as CompiledModule['validates'],
    actions: byType('action') as CompiledModule['actions'],
    conditions: byType('condition') as CompiledModule['conditions'],
    maps: byType('map') as CompiledModule['maps'],
    lookups: byType('lookup') as CompiledModule['lookups'],
    styles: byType('style') as CompiledModule['styles'],
    aggregates: byType('aggregate') as CompiledModule['aggregates'],
    warnings: [...warnings, ...flowsWarnings],
  }
}
