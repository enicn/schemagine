import { describe, expect, it } from 'vitest'
// Host-side injection in the engine is exactly this mathjs/number pair.
import { evaluate as mathEvaluate, parse as mathParse } from 'mathjs/number'
import {
  Effect,
  createRuntime,
  interpolate,
  resolveLookupKeys,
  validateDictionary,
  validateFlow,
  validateRules,
} from '@/rules'
import type { ActionRule, EvalContext, FlowDef } from '@/rules'

const evaluate = (expr: string, scope?: Record<string, unknown>) => mathEvaluate(expr, scope)

function makeCtx(record: Record<string, unknown>, extra: Partial<EvalContext> = {}): EvalContext {
  return { record, ...extra }
}

describe('rules/condition: triplet, object and expression forms', () => {
  const runtime = createRuntime({ evaluate })

  const cases: Array<[Parameters<typeof runtime.evalCondition>[0], Record<string, unknown>, boolean]> = [
    [['status', 'eq', 1], { status: 1 }, true],
    [['status', 'neq', 1], { status: 1 }, false],
    [['quantity', 'gt', 0], { quantity: 0.5 }, true],
    [['price', 'lte', 100], { price: 100 }, true],
    [['tags', 'contains', 'a'], { tags: ['a', 'b'] }, true],
    [['name', 'startsWith', 'A'], { name: 'A100' }, true],
    [['remark', 'isEmpty'], { remark: '' }, true],
    [['deletedAt', 'notExists'], { deletedAt: undefined }, true],
    [['total', 'gte', { value: 10 }], { total: 12 }, true],
  ]
  it.each(cases)('triplet %j -> %j', (cond, record, expected) => {
    expect(runtime.evalCondition(cond, makeCtx(record))).toBe(expected)
  })

  it('supports object form (and/or/not) and expression strings', () => {
    const ctx = makeCtx({ price: 20, quantity: 6, withTax: 1 })
    expect(runtime.evalCondition(
      { and: [{ left: { record: 'price' }, operator: 'gt', right: { value: 10 } }, { left: { record: 'quantity' }, operator: 'gte', right: { value: 6 } }] },
      ctx,
    )).toBe(true)
    expect(runtime.evalCondition(
      { or: [{ left: { record: 'price' }, operator: 'lt', right: { value: 5 } }, { left: { record: 'quantity' }, operator: 'gt', right: { value: 100 } }] },
      ctx,
    )).toBe(false)
    expect(runtime.evalCondition({ not: { left: { record: 'price' }, operator: 'gt', right: { value: 10 } } }, ctx)).toBe(false)
    expect(runtime.evalCondition('price * quantity > 100', ctx)).toBe(true)
    expect(runtime.evalCondition(undefined, ctx)).toBe(true)
  })
})

describe('rules/compute: ordered chain referencing prior targets', () => {
  const runtime = createRuntime({ evaluate, parse: mathParse })
  const compiled = runtime.compileModule({
    fields: [
      {
        key: 'total',
        rules: [
          { type: 'compute', id: 'c-total', target: 'total', watch: ['price', 'quantity'], expr: 'price * quantity' },
          { type: 'compute', id: 'c-tax', target: 'tax', watch: ['price', 'taxRate', 'withTax'], expr: 'withTax > 0 ? price * taxRate : 0' },
          { type: 'compute', id: 'c-after', target: 'after', watch: ['price', 'tax'], expr: 'price - tax' },
        ],
      },
    ],
  })

  it('a watch hit fires the rule and cascades down the declaration chain', () => {
    const effects = runtime.runComputes(
      compiled,
      makeCtx({ price: 100, quantity: 2, taxRate: 0.1, withTax: 1 }),
      'price',
    )
    const byTarget = Object.fromEntries(effects.map(e => [e.target, e.value]))
    expect(byTarget['total']).toBe(200)
    expect(byTarget['tax']).toBe(10)
    // "after" watches price and tax; it sees the fresh tax computed in this pass.
    expect(byTarget['after']).toBe(90)
    expect(effects.every(e => e.type === Effect.SET)).toBe(true)
  })

  it('switching withTax off zeroes the tax and cascades into dependents', () => {
    const effects = runtime.runComputes(
      compiled,
      makeCtx({ price: 100, quantity: 2, taxRate: 0.1, withTax: 0, tax: 10 }),
      'withTax',
    )
    const byTarget = Object.fromEntries(effects.map(e => [e.target, e.value]))
    expect(byTarget['tax']).toBe(0)
    // "after" watches the tax target fired in this pass, so it recomputes: 100 - 0.
    expect(byTarget['after']).toBe(100)
  })

  it('unrelated changed keys trigger nothing; full pass evaluates all', () => {
    expect(runtime.runComputes(compiled, makeCtx({ remark: 'x' }), 'remark')).toHaveLength(0)
    const all = runtime.runComputes(compiled, makeCtx({ price: 1, quantity: 1, taxRate: 0, withTax: 0 }))
    expect(all.length).toBe(3)
  })

  it('force rules emit FORCE effects; eval failures become warnings', () => {
    const compiled2 = runtime.compileModule({
      rules: [
        { type: 'compute', target: 'locked', watch: ['a'], expr: 'a * 2', force: true },
        { type: 'compute', target: 'broken', watch: ['a'], expr: 'a * nope()' },
      ],
    })
    const effects = runtime.runComputes(compiled2, makeCtx({ a: 3 }), 'a')
    expect(effects[0]).toMatchObject({ type: Effect.FORCE, target: 'locked', value: 6 })
    const warns = runtime.takeWarnings()
    expect(warns.some(w => w.code === 'EXPR_EVAL' && w.path.includes('broken'))).toBe(true)
  })

  it('compileModule collects syntax warnings through the injected parse', () => {
    const bad = runtime.compileModule({ rules: [{ type: 'compute', target: 'x', watch: ['a'], expr: 'a +* 1' }] })
    expect(bad.warnings.some(w => w.code === 'EXPR_SYNTAX')).toBe(true)
    // compile warnings live on the compiled module; takeWarnings() is eval-time only.
    expect(runtime.takeWarnings()).toHaveLength(0)
  })
})

describe('rules/functions: precision built-ins', () => {
  const runtime = createRuntime({ evaluate })
  const compiled = runtime.compileModule({
    rules: [
      { type: 'compute', target: 'boxesCeil', watch: ['pieces'], expr: 'ceilTo(pieces / d, 0)' },
      { type: 'compute', target: 'ratioRound', watch: ['pieces'], expr: 'roundTo(pieces / d, 2)' },
    ],
  })

  it('ceilTo rounds up, roundTo rounds half up at given decimals', () => {
    const effects = runtime.runComputes(compiled, makeCtx({ pieces: 3, d: 2 }), undefined)
    const byTarget = Object.fromEntries(effects.map(e => [e.target, e.value]))
    expect(byTarget['boxesCeil']).toBe(2) // ceil(1.5) = 2
    expect(byTarget['ratioRound']).toBe(1.5)
  })

  it('generic built-ins behave', () => {
    const fn = (name: string) => runtime.getFn(name) as (...args: unknown[]) => unknown
    expect(fn('sum')(1, 2, 3)).toBe(6)
    expect(fn('count')([1, 2, 3])).toBe(3)
    expect(fn('min')([3, 1, 2])).toBe(1)
    expect(fn('max')([3, 1, 2])).toBe(3)
    expect(fn('abs')(-4)).toBe(4)
    expect(fn('now')()).toBeTypeOf('number')
  })
})

describe('rules/lookup helpers: search interpolation and keysFrom override', () => {
  it('interpolates plain paths and expressions; leaves unresolved parts empty', () => {
    // interpolate() consumes the same flat scope shape as expressions.
    const scope = { name: 'abc', owner: 'ada' }
    expect(interpolate('q={{name}}&by={{owner}}', scope)).toBe('q=abc&by=ada')
    expect(interpolate('total={{price * 2}}', { price: 5 }, evaluate)).toBe('total=10')
    expect(interpolate('missing={{nope}}', scope)).toBe('missing=')
  })

  it('keysFrom overrides keys, falls back when empty or missing', () => {
    expect(resolveLookupKeys({ keys: ['a'], keysFrom: 'extraKeys' }, { extraKeys: ['b', 'c'] })).toEqual(['b', 'c'])
    expect(resolveLookupKeys({ keys: ['a'], keysFrom: 'extraKeys' }, {})).toEqual(['a'])
    expect(resolveLookupKeys({ keys: ['a'], keysFrom: 'extraKeys' }, { extraKeys: [] })).toEqual(['a'])
    expect(resolveLookupKeys({}, {})).toEqual([])
  })
})

describe('rules/validate rules: intercept and forced value', () => {
  const runtime = createRuntime({ evaluate })
  const compiled = runtime.compileModule({
    rules: [
      { type: 'validate', when: 'quantity == 0', message: 'quantity must not be zero' },
      { type: 'validate', when: ['$new', 'lt', 0], message: 'negative not allowed', force: 0 },
    ],
  })

  it('returns the first violation with its message', () => {
    const r = runtime.runValidates(compiled, makeCtx({ quantity: 0 }), 'quantity', 0, 3)
    expect(r.ok).toBe(false)
    expect(r.message).toBe('quantity must not be zero')
  })

  it('a rule with force reports the forced value instead of a hard block', () => {
    const r = runtime.runValidates(compiled, makeCtx({ quantity: 1 }), 'quantity', -5, 1)
    expect(r.ok).toBe(false)
    expect(r.force).toBe(0)
  })

  it('passes when no violation condition holds', () => {
    expect(runtime.runValidates(compiled, makeCtx({ quantity: 4 }), 'quantity', 4, 1).ok).toBe(true)
  })
})

describe('rules/action planning', () => {
  const runtime = createRuntime({ evaluate })
  const rule: ActionRule = {
    type: 'action' as const,
    label: 'Submit',
    when: ['status', 'eq', 0],
    act: {
      invoke: 'records/submit',
      params: { id: '{{id}}' },
      apply: 'resp',
      confirm: 'Sure to submit?',
      toast: 'Submitted {{id}}',
    },
  }

  it('plans confirm -> invoke -> toast with interpolated params', () => {
    const effects = runtime.planAction(rule, makeCtx({ id: 'r1', status: 0 }))
    expect(effects.map(e => e.type)).toEqual([Effect.CONFIRM, Effect.INVOKE, Effect.TOAST])
    const invoke = effects.find(e => e.type === Effect.INVOKE)
    expect(invoke?.api).toBe('records/submit')
    expect(invoke?.params).toEqual({ id: 'r1' })
    expect(invoke?.apply).toBe('resp')
    const toast = effects.find(e => e.type === Effect.TOAST)
    expect(toast?.message).toBe('Submitted r1')
  })

  it('a false when plans nothing; open/navigate variants produce OPEN/NAVIGATE', () => {
    expect(runtime.planAction(rule, makeCtx({ id: 'r1', status: 1 }))).toHaveLength(0)
    const openRule: ActionRule = { type: 'action', act: { open: 'detail-popup', params: { a: 1 } } }
    const navRule: ActionRule = { type: 'action', act: { navigate: 'home' } }
    expect(runtime.planAction(openRule, makeCtx({}))[0]?.type).toBe(Effect.OPEN)
    expect(runtime.planAction(navRule, makeCtx({}))[0]?.type).toBe(Effect.NAVIGATE)
  })
})

describe('rules/flow: steps, as-mounting, guards', () => {
  const executed: string[] = []
  const executor = (step: { action: unknown }) => {
    executed.push(String(step.action))
    return `done:${String(step.action)}`
  }
  const ctx = makeCtx({ who: 'ada' })

  it('runs a three-step pure data flow and mounts results with as', async () => {
    const runtime = createRuntime({
      evaluate,
      actions: {
        reserve: { name: 'reserve', kind: 'api', impl: 'hostReserve' },
        notify: { name: 'notify', kind: 'frontend', impl: 'hostNotify' },
      },
      flows: {
        enrich: { name: 'enrich', steps: [{ action: 'reserve', as: 'mid' }] },
      },
    })
    const main: FlowDef = {
      name: 'main',
      steps: [
        { action: 'reserve', params: { who: '{{who}}' }, when: ['who', 'notEmpty'], as: 'first' },
        { action: { flow: 'enrich' }, as: 'final' },
        { action: 'notify', when: ['$flow.final', 'notEmpty'] },
      ],
    }
    const scope = await runtime.runFlow(main, ctx, executor)
    expect(scope['first']).toBe('done:reserve')
    expect(scope['final']).toBeTypeOf('object')
    // The last step ran because $flow.final was mounted by the previous one.
    expect(executed).toEqual(['reserve', 'reserve', 'notify'])
  })

  it('rejects unknown sub-flows, over-deep nesting and cycles', async () => {
    const runtime = createRuntime({ flows: { lone: { name: 'lone', steps: [{ action: 'x' }] } } })
    await expect(runtime.runFlow({ name: 'bad', steps: [{ action: { flow: 'ghost' } }] }, ctx, executor))
      .rejects.toMatchObject({ code: 'FLOW_NOT_FOUND' })

    const chain: Record<string, FlowDef> = {}
    for (let i = 0; i < 10; i++) {
      chain[`f${i}`] = { name: `f${i}`, steps: [{ action: { flow: `f${i + 1}` } }] }
    }
    const deep = createRuntime({ flows: chain })
    const entry = chain['f0']
    if (!entry) throw new Error('missing chain entry')
    await expect(deep.runFlow(entry, ctx, executor)).rejects.toMatchObject({ code: 'FLOW_DEPTH_EXCEEDED' })

    const cyclic = createRuntime({ flows: {
      a: { name: 'a', steps: [{ action: { flow: 'b' } }] },
      b: { name: 'b', steps: [{ action: { flow: 'a' } }] },
    } })
    await expect(cyclic.runFlow({ name: 'a', steps: [{ action: { flow: 'b' } }] }, ctx, executor))
      .rejects.toMatchObject({ code: 'FLOW_CYCLE' })
  })

  it('enforces the action kind whitelist from the dictionary', async () => {
    const runtime = createRuntime({
      actions: { rogue: { name: 'rogue', kind: 'weird' as unknown as 'api', impl: 'x' } },
    })
    await expect(runtime.runFlow({ name: 'm', steps: [{ action: 'rogue' }] }, ctx, executor))
      .rejects.toMatchObject({ code: 'FLOW_KIND_REJECTED' })
  })
})

describe('rules/validators: reject bad dictionaries, flows and rules', () => {
  it('validateRules', () => {
    expect(validateRules([{ type: 'compute', target: 't', watch: ['a'], expr: 'a * 2' }]).ok).toBe(true)
    expect(validateRules([
      { type: 'nope' },
      { type: 'compute', target: '', watch: [], expr: '' },
      { type: 'validate', when: 'a > 0', message: '' },
      'junk',
    ]).issues.length).toBeGreaterThanOrEqual(4)
    expect(validateRules('not-an-array').ok).toBe(false)
  })

  it('validateFlow', () => {
    const flow = { name: 'm', steps: [{ action: 'reserve', as: 'r' }] }
    expect(validateFlow(flow).ok).toBe(true)
    expect(validateFlow({ name: '', steps: [] }).ok).toBe(false)
    expect(validateFlow({ name: 'm', steps: [{ action: 42 }] }).ok).toBe(false)
    const flows = {
      a: { name: 'a', steps: [{ action: { flow: 'b' } }] },
      b: { name: 'b', steps: [{ action: { flow: 'a' } }] },
    }
    const cyc = validateFlow(flows['a'], { flows })
    expect(cyc.ok).toBe(false)
    expect(cyc.issues.some(i => i.code === 'FLOW_CYCLE')).toBe(true)
  })

  it('validateDictionary', () => {
    expect(validateDictionary({
      functions: { qty: { params: ['x'], returns: 'number' } },
      actions: { reserve: { name: 'reserve', kind: 'api', impl: 'hostReserve' } },
    }).ok).toBe(true)

    const bad = validateDictionary({
      functions: { qty: { params: 'x' } },
      actions: {
        a1: { name: 'a1', kind: 'weird' },
        a2: { name: 'a2', kind: 'composite' },
        a3: { name: 'a3', kind: 'frontend' },
      },
    })
    expect(bad.ok).toBe(false)
    expect(bad.issues.map(i => i.code)).toEqual(expect.arrayContaining([
      'DICT_SIG_PARAMS', 'DICT_CONTRACT_KIND', 'DICT_CONTRACT_FLOW', 'DICT_CONTRACT_IMPL',
    ]))
  })
})
