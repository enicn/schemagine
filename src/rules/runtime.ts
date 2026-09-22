/**
 * RulesRuntime: a pure planner. It turns rules and flows into Effect
 * descriptors; all IO (ajax, popups, toasts, navigation, sub-flow execution
 * through host services) is left to the host executor.
 */
import { buildExpressionScope, evalCondition } from './condition'
import { compileModule } from './compile'
import { mergeFunctions } from './functions'
import { interpolateDeep } from './interpolate'
import type {
  ActionContract,
  ActionRule,
  CompiledModule,
  CompileWarning,
  ComputeRule,
  EvalContext,
  FlowDef,
  FlowStep,
  RuntimeOptions,
  RuleEffect,
  RulesModuleSchema,
  ValidateRule,
} from './types'
import { Effect } from './types'

export { Effect }

/** Flow recursion guard: maximum nesting depth of sub-flow invocations. */
export const MAX_FLOW_DEPTH = 8

/** Action kinds a flow step may reference. */
export const FLOW_KIND_WHITELIST = ['frontend', 'api', 'composite'] as const

export type FlowExecutor = (
  step: FlowStep,
  ctx: EvalContext,
) => unknown | Promise<unknown>

export class FlowError extends Error {
  code: string
  path: string
  constructor(code: string, path: string, message: string) {
    super(message)
    this.name = 'FlowError'
    this.code = code
    this.path = path
  }
}

export function createRuntime(options: RuntimeOptions = {}) {
  const evaluate = options.evaluate
  const parse = options.parse
  const functions = mergeFunctions(options.functions)
  const namedFlows = options.flows ?? {}
  const actionDictionary = options.actions ?? {}

  let warnings: CompileWarning[] = []

  const emitWarning = (w: CompileWarning): void => {
    warnings.push(w)
  }

  const scopeOf = (ctx: EvalContext, flowScope?: Record<string, unknown>) =>
    buildExpressionScope(ctx, functions, flowScope)

  const evalExpr = (expr: string, scope: Record<string, unknown>): unknown => {
    if (!evaluate) throw new Error('No evaluator injected: expression features are unavailable.')
    return evaluate(expr, scope)
  }

  const getFn = (name: string): unknown => functions[name]

  /** Collect and clear accumulated compile/eval warnings. */
  const takeWarnings = (): CompileWarning[] => {
    const out = warnings
    warnings = []
    return out
  }

  // ------------------------------------------------------------- computes

  /**
   * Watch-triggered compute chain. Fires rules whose `watch` contains the
   * changed key, then cascades to rules watching fired targets, all in
   * declaration order (a rule may reference targets declared before it).
   * `changedKey === undefined` runs a full pass (initial fill).
   */
  const runComputes = (
    c: CompiledModule,
    ctx: EvalContext,
    changedKey?: string,
  ): RuleEffect[] => {
    const effects: RuleEffect[] = []
    const working: Record<string, unknown> = { ...ctx.record }
    const rules = c.computes.filter(r => r.scope !== 'aggregate') as ComputeRule[]
    const done = new Set<ComputeRule>()
    const hot = new Set<string>(changedKey === undefined ? [] : [changedKey])
    const fullPass = changedKey === undefined

    let progressed = true
    while (progressed) {
      progressed = false
      for (const rule of rules) {
        if (done.has(rule)) continue
        const hit = fullPass || rule.watch.some(w => hot.has(w))
        if (!hit) continue
        done.add(rule)
        progressed = true
        const scopedCtx: EvalContext = { ...ctx, record: working }
        try {
          const value = evalExpr(rule.expr, scopeOf(scopedCtx))
          working[rule.target] = value
          hot.add(rule.target)
          effects.push({
            type: rule.force ? Effect.FORCE : Effect.SET,
            target: rule.target,
            value,
            source: 'compute',
            ruleId: rule.id,
          })
        } catch (err) {
          emitWarning({
            path: `compute:${rule.target}`,
            code: 'EXPR_EVAL',
            message: err instanceof Error ? err.message : 'Expression evaluation failed.',
          })
        }
      }
    }
    return effects
  }

  // ------------------------------------------------------------- validates

  /**
   * Validate rules: `when` is the violation condition. The first failing rule
   * (declaration order) wins. The changed key is tentatively merged into the
   * record scope so conditions can reference the new value directly.
   */
  const runValidates = (
    c: CompiledModule,
    ctx: EvalContext,
    key: string,
    $new: unknown,
    $old: unknown,
  ): { ok: boolean; message?: string; force?: unknown } => {
    // $new/$old are exposed both as context variables and as pseudo fields so
    // triplet conditions like ['$new','lt',0] can reference them.
    const tentative: Record<string, unknown> = { ...ctx.record, [key]: $new, $new, $old }
    const scopedCtx: EvalContext = { ...ctx, record: tentative, $new, $old }
    for (const rule of c.validates as ValidateRule[]) {
      if (!evalCondition(rule.when, scopedCtx, evaluate)) continue
      const scope = scopeOf(scopedCtx)
      return {
        ok: false,
        message: rule.message ? interpolateDeep(rule.message, scope, evaluate) as string : undefined,
        force: 'force' in rule ? rule.force : undefined,
      }
    }
    return { ok: true }
  }

  // ------------------------------------------------------------- actions

  /** Plan an action rule into effects: confirm -> invoke/open/navigate -> toast. */
  const planAction = (rule: ActionRule, ctx: EvalContext): RuleEffect[] => {
    if (rule.when !== undefined && !evalCondition(rule.when, ctx, evaluate)) return []
    const act = rule.act ?? {}
    const scope = scopeOf(ctx)
    const effects: RuleEffect[] = []

    if (act.confirm) {
      const message = typeof act.confirm === 'string' ? act.confirm : act.confirm.message
      effects.push({
        type: Effect.CONFIRM,
        message: interpolateDeep(message, scope, evaluate) as string,
      })
    }
    const params = interpolateDeep(act.params ?? act.body, scope, evaluate)
    if (act.invoke !== undefined) {
      effects.push({ type: Effect.INVOKE, api: act.invoke, params, apply: act.apply })
    }
    if (act.open !== undefined) {
      effects.push({ type: Effect.OPEN, viewRef: act.open, params })
    }
    if (act.navigate !== undefined) {
      effects.push({ type: Effect.NAVIGATE, payload: act.navigate, params })
    }
    if (act.toast) {
      effects.push({
        type: Effect.TOAST,
        message: interpolateDeep(act.toast, scope, evaluate) as string,
      })
    }
    return effects
  }

  // ------------------------------------------------------------- flows

  const resolveStepAction = (
    step: FlowStep,
    path: string,
  ): { contract?: ActionContract; subFlow?: FlowDef } => {
    if (typeof step.action === 'object' && step.action !== null && 'flow' in step.action) {
      const name = (step.action as { flow: string }).flow
      const sub = namedFlows[name]
      if (!sub) {
        throw new FlowError('FLOW_NOT_FOUND', path, `Sub-flow "${name}" is not registered.`)
      }
      return { subFlow: sub }
    }
    const name = String(step.action)
    const contract = actionDictionary[name]
    if (contract) {
      const kind = (contract as { kind?: string }).kind
      if (kind && !(FLOW_KIND_WHITELIST as readonly string[]).includes(kind)) {
        throw new FlowError(
          'FLOW_KIND_REJECTED',
          path,
          `Action "${name}" has kind "${kind}", which is not in the whitelist.`,
        )
      }
      if (kind === 'composite' && contract.flow) {
        const sub = namedFlows[contract.flow]
        if (!sub) {
          throw new FlowError(
            'FLOW_NOT_FOUND',
            path,
            `Composite action "${name}" references flow "${contract.flow}", which is not registered.`,
          )
        }
        return { subFlow: sub }
      }
    }
    return { contract }
  }

  const runFlowInternal = async (
    flow: FlowDef,
    ctx: EvalContext,
    executor: FlowExecutor,
    depth: number,
    stack: Set<string>,
    path: string,
  ): Promise<Record<string, unknown>> => {
    if (depth > MAX_FLOW_DEPTH) {
      throw new FlowError('FLOW_DEPTH_EXCEEDED', path, `Flow nesting exceeds ${MAX_FLOW_DEPTH}.`)
    }
    if (stack.has(flow.name)) {
      throw new FlowError('FLOW_CYCLE', path, `Circular flow reference at "${flow.name}".`)
    }
    stack.add(flow.name)

    const flowScope: Record<string, unknown> = {}
    try {
      const steps = Array.isArray(flow.steps) ? flow.steps : []
      for (const [index, step] of steps.entries()) {
        const stepPath = `${path}.steps[${index}]`
        if (step.when !== undefined) {
          // Step conditions see the record plus the flow scope as `$flow`.
          const scopedCtx: EvalContext = {
            ...ctx,
            record: { ...ctx.record, $flow: flowScope },
          }
          if (!evalCondition(step.when, scopedCtx, evaluate)) continue
        }
        const scope = scopeOf(ctx, flowScope)
        const params = interpolateDeep(step.params, scope, evaluate)

        const { subFlow } = resolveStepAction(step, stepPath)
        let result: unknown
        if (subFlow) {
          result = await runFlowInternal(subFlow, ctx, executor, depth + 1, stack, `${stepPath}(${subFlow.name})`)
        } else {
          // The executor receives the step with interpolated params resolved.
          result = await executor({ ...step, params }, ctx)
        }
        if (typeof step.as === 'string' && step.as !== '') {
          flowScope[step.as] = result
        }
      }
    } finally {
      stack.delete(flow.name)
    }
    return flowScope
  }

  const runFlow = async (
    flow: FlowDef,
    ctx: EvalContext,
    executor: FlowExecutor,
  ): Promise<Record<string, unknown>> => {
    return runFlowInternal(flow, ctx, executor, 1, new Set(), flow.name)
  }

  // ------------------------------------------------------------- public surface

  return {
    compileModule: (schema: RulesModuleSchema | unknown): CompiledModule =>
      compileModule(schema, parse),
    evalCondition: (cond: Parameters<typeof evalCondition>[0], ctx: EvalContext): boolean =>
      evalCondition(cond, ctx, evaluate),
    runComputes,
    runValidates,
    planAction,
    runFlow,
    takeWarnings,
    getFn,
  }
}

export type RulesRuntime = ReturnType<typeof createRuntime>
