/**
 * Structural validators for rules / flows / dictionaries. Pure and isomorphic
 * (same code runs in browser, Node, and can be mirrored server-side) so hosts
 * can use them as a write-gate before persisting definitions.
 */
import type {
  ActionContract,
  AnyCondition,
  FlowDef,
  Rule,
  ValidationIssue,
  ValidationResult,
} from './types'

const RULE_TYPES = new Set([
  'condition', 'compute', 'map', 'lookup', 'validate', 'action', 'style', 'aggregate',
])

const ACTION_KINDS = new Set(['frontend', 'api', 'composite'])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isConditionForm(v: unknown): v is AnyCondition {
  if (v === undefined || v === null) return false
  if (typeof v === 'string') return true
  if (Array.isArray(v)) return v.length >= 2 && typeof v[0] === 'string'
  if (!isRecord(v)) return false
  if ('and' in v || 'or' in v || 'not' in v) return true
  return 'left' in v && 'operator' in v
}

class Collector {
  issues: ValidationIssue[] = []
  add(path: string, code: string, message: string): void {
    this.issues.push({ path, code, message })
  }
  finish(): ValidationResult {
    return { ok: this.issues.length === 0, issues: this.issues }
  }
}

function validateOneRule(rule: Record<string, unknown>, path: string, c: Collector): void {
  const type = rule.type
  if (!RULE_TYPES.has(String(type))) {
    c.add(`${path}.type`, 'RULE_TYPE_UNKNOWN', `Unknown rule type "${String(type)}".`)
    return
  }
  switch (type) {
    case 'compute': {
      if (typeof rule.target !== 'string' || rule.target === '') {
        c.add(`${path}.target`, 'COMPUTE_TARGET_REQUIRED', 'compute rule requires a non-empty "target".')
      }
      if (!Array.isArray(rule.watch) || rule.watch.length === 0) {
        c.add(`${path}.watch`, 'COMPUTE_WATCH_REQUIRED', 'compute rule requires a non-empty "watch" array.')
      } else if (rule.watch.some(w => typeof w !== 'string')) {
        c.add(`${path}.watch`, 'COMPUTE_WATCH_KEYS', 'compute "watch" entries must be field key strings.')
      }
      if (typeof rule.expr !== 'string' || rule.expr.trim() === '') {
        c.add(`${path}.expr`, 'COMPUTE_EXPR_REQUIRED', 'compute rule requires a non-empty "expr" string.')
      }
      break
    }
    case 'validate': {
      if (!isConditionForm(rule.when)) {
        c.add(`${path}.when`, 'VALIDATE_WHEN_REQUIRED', 'validate rule requires a "when" condition.')
      }
      if (typeof rule.message !== 'string' || rule.message === '') {
        c.add(`${path}.message`, 'VALIDATE_MESSAGE_REQUIRED', 'validate rule requires a non-empty "message".')
      }
      break
    }
    case 'action': {
      const act = rule.act
      if (!isRecord(act)) {
        c.add(`${path}.act`, 'ACTION_ACT_REQUIRED', 'action rule requires an "act" object.')
        break
      }
      if (act.invoke === undefined && act.open === undefined && act.navigate === undefined) {
        c.add(`${path}.act`, 'ACTION_TARGET_REQUIRED', 'action "act" requires one of invoke/open/navigate.')
      }
      if (rule.when !== undefined && !isConditionForm(rule.when)) {
        c.add(`${path}.when`, 'ACTION_WHEN_FORM', 'action "when" must be a condition.')
      }
      break
    }
    case 'map': {
      if (!isRecord(rule.from)) {
        c.add(`${path}.from`, 'MAP_FROM_REQUIRED', 'map rule requires a "from" object of source->target keys.')
      }
      break
    }
    case 'lookup': {
      if (rule.api === undefined && rule.source === undefined) {
        c.add(`${path}.api`, 'LOOKUP_SOURCE_REQUIRED', 'lookup rule requires "api" or "source".')
      }
      if (rule.keys !== undefined && !Array.isArray(rule.keys)) {
        c.add(`${path}.keys`, 'LOOKUP_KEYS_FORM', 'lookup "keys" must be an array of field keys.')
      }
      break
    }
    case 'style': {
      if (!isConditionForm(rule.when)) {
        c.add(`${path}.when`, 'STYLE_WHEN_REQUIRED', 'style rule requires a "when" condition.')
      }
      if (rule.rowClass === undefined && rule.cellClass === undefined && rule.oddClass === undefined) {
        c.add(`${path}`, 'STYLE_CLASS_REQUIRED', 'style rule requires rowClass/cellClass/oddClass.')
      }
      break
    }
    case 'aggregate': {
      if (typeof rule.key !== 'string' || rule.key === '') {
        c.add(`${path}.key`, 'AGGREGATE_KEY_REQUIRED', 'aggregate rule requires a non-empty "key".')
      }
      if (typeof rule.expr !== 'string' || rule.expr.trim() === '') {
        c.add(`${path}.expr`, 'AGGREGATE_EXPR_REQUIRED', 'aggregate rule requires a non-empty "expr" string.')
      }
      break
    }
    case 'condition': {
      if (!isConditionForm(rule.when)) {
        c.add(`${path}.when`, 'CONDITION_WHEN_REQUIRED', 'condition rule requires a "when".')
      }
      break
    }
  }
}

/** Validate an array of rules (field-level or module-level). */
export function validateRules(rules: unknown, path = 'rules'): ValidationResult {
  const c = new Collector()
  if (!Array.isArray(rules)) {
    c.add(path, 'RULES_ARRAY_REQUIRED', 'Rules must be an array.')
    return c.finish()
  }
  rules.forEach((rule, i) => {
    if (!isRecord(rule) || typeof rule.type !== 'string') {
      c.add(`${path}[${i}]`, 'RULE_MALFORMED', 'Rule must be an object with a "type" field.')
      return
    }
    validateOneRule(rule, `${path}[${i}]`, c)
  })
  return c.finish()
}

/**
 * Validate a flow definition. With `env` (registered flows + action dictionary)
 * it also checks recursion statically: cycles, static depth, kind whitelist.
 */
export function validateFlow(
  flow: unknown,
  env?: { flows?: Record<string, FlowDef>; actions?: Record<string, ActionContract>; maxDepth?: number },
): ValidationResult {
  const c = new Collector()
  const path = 'flow'
  if (!isRecord(flow) || typeof flow.name !== 'string' || flow.name === '') {
    c.add(`${path}.name`, 'FLOW_NAME_REQUIRED', 'Flow requires a non-empty "name".')
    return c.finish()
  }
  if (!Array.isArray(flow.steps) || flow.steps.length === 0) {
    c.add(`${path}.steps`, 'FLOW_STEPS_REQUIRED', 'Flow requires a non-empty "steps" array.')
    return c.finish()
  }
  flow.steps.forEach((step, i) => {
    const sp = `${path}.steps[${i}]`
    if (!isRecord(step) || step.action === undefined) {
      c.add(`${sp}.action`, 'FLOW_STEP_ACTION_REQUIRED', 'Flow step requires an "action".')
      return
    }
    const isSubFlowRef = isRecord(step.action) && typeof (step.action as Record<string, unknown>).flow === 'string'
    if (typeof step.action !== 'string' && !isSubFlowRef) {
      c.add(`${sp}.action`, 'FLOW_STEP_ACTION_FORM', 'Flow step "action" must be a name or { flow: name }.')
    }
    if (step.when !== undefined && !isConditionForm(step.when)) {
      c.add(`${sp}.when`, 'FLOW_STEP_WHEN_FORM', 'Flow step "when" must be a condition.')
    }
    if (step.as !== undefined && (typeof step.as !== 'string' || step.as === '')) {
      c.add(`${sp}.as`, 'FLOW_STEP_AS_FORM', 'Flow step "as" must be a non-empty string.')
    }
    if (env?.actions && typeof step.action === 'string') {
      const contract = env.actions[step.action]
      if (contract && !ACTION_KINDS.has(String(contract.kind))) {
        c.add(`${sp}.action`, 'FLOW_KIND_REJECTED', `Action "${step.action}" kind "${String(contract.kind)}" is not in the whitelist.`)
      }
    }
  })

  if (env) {
    const maxDepth = env.maxDepth ?? 8
    const flows = env.flows ?? {}
    const nameOf = (f: unknown): string => (isRecord(f) && typeof f.name === 'string' ? f.name : '')
    const subFlowNames = (f: Record<string, unknown>): string[] => {
      const out: string[] = []
      for (const step of Array.isArray(f.steps) ? f.steps : []) {
        if (!isRecord(step)) continue
        if (isRecord(step.action) && typeof step.action.flow === 'string') {
          out.push(step.action.flow)
        } else if (typeof step.action === 'string') {
          const contract = env.actions?.[step.action]
          if (contract && contract.kind === 'composite' && typeof contract.flow === 'string') {
            out.push(contract.flow)
          }
        }
      }
      return out
    }
    // DFS over the flow graph: cycle detection + static depth.
    const visit = (flowName: string, stack: Set<string>, depth: number, vPath: string): void => {
      if (depth > maxDepth) {
        c.add(vPath, 'FLOW_DEPTH_EXCEEDED', `Flow nesting exceeds ${maxDepth} at "${flowName}".`)
        return
      }
      if (stack.has(flowName)) {
        c.add(vPath, 'FLOW_CYCLE', `Circular flow reference at "${flowName}".`)
        return
      }
      const def = flows[flowName]
      if (!def) return
      const next = new Set(stack)
      next.add(flowName)
      for (const sub of subFlowNames(def as unknown as Record<string, unknown>)) {
        visit(sub, next, depth + 1, `${vPath} -> ${sub}`)
      }
    }
    visit(nameOf(flow), new Set(), 1, path)
  }
  return c.finish()
}

/** Validate a host dictionary: function signature table + action contracts. */
export function validateDictionary(dict: unknown): ValidationResult {
  const c = new Collector()
  if (!isRecord(dict)) {
    c.add('dict', 'DICT_OBJECT_REQUIRED', 'Dictionary must be an object.')
    return c.finish()
  }
  const functions = dict.functions
  if (functions !== undefined) {
    if (!isRecord(functions)) {
      c.add('dict.functions', 'DICT_FUNCTIONS_OBJECT', '"functions" must be a name->signature object.')
    } else {
      for (const [name, sig] of Object.entries(functions)) {
        if (!isRecord(sig)) {
          c.add(`dict.functions.${name}`, 'DICT_SIG_OBJECT', 'Function signature must be an object.')
          continue
        }
        if (sig.params !== undefined && !Array.isArray(sig.params)) {
          c.add(`dict.functions.${name}.params`, 'DICT_SIG_PARAMS', 'Function "params" must be an array of names.')
        }
      }
    }
  }
  const actions = dict.actions
  if (actions !== undefined) {
    if (!isRecord(actions)) {
      c.add('dict.actions', 'DICT_ACTIONS_OBJECT', '"actions" must be a name->contract object.')
    } else {
      for (const [name, contract] of Object.entries(actions)) {
        const p = `dict.actions.${name}`
        if (!isRecord(contract)) {
          c.add(p, 'DICT_CONTRACT_OBJECT', 'Action contract must be an object.')
          continue
        }
        if (!ACTION_KINDS.has(String(contract.kind))) {
          c.add(`${p}.kind`, 'DICT_CONTRACT_KIND', `Action kind must be one of frontend/api/composite, got "${String(contract.kind)}".`)
        }
        if (contract.kind === 'composite' && typeof contract.flow !== 'string') {
          c.add(`${p}.flow`, 'DICT_CONTRACT_FLOW', 'Composite action requires a "flow" name.')
        }
        if ((contract.kind === 'frontend' || contract.kind === 'api') && typeof contract.impl !== 'string') {
          c.add(`${p}.impl`, 'DICT_CONTRACT_IMPL', `${String(contract.kind)} action requires an "impl" binding name.`)
        }
        if (contract.params !== undefined && !isRecord(contract.params)) {
          c.add(`${p}.params`, 'DICT_CONTRACT_PARAMS', 'Action "params" schema must be an object when present.')
        }
        if (contract.result !== undefined && !isRecord(contract.result)) {
          c.add(`${p}.result`, 'DICT_CONTRACT_RESULT', 'Action "result" schema must be an object when present.')
        }
      }
    }
  }
  return c.finish()
}

/** Convenience: validate a rule list typed as Rule[]. */
export function validateRuleList(rules: Rule[]): ValidationResult {
  return validateRules(rules)
}
