import { describe, expect, it } from 'vitest'
import { createSchemaMetaState } from '@/composables/instanceState'
import { createRulesState } from '@/composables/useRules'
import { Effect } from '@/rules'
import type { ModuleSchema } from '@/types'

function makeSchema(overrides: Partial<ModuleSchema>): ModuleSchema {
  return {
    id: 'module-rules-test',
    name: 'rules-test',
    version: '1.0.0',
    moduleType: 'list',
    fields: [],
    permissions: { view: true, create: true, edit: true, delete: true, export: true, configure: true },
    defaultViewMode: 'list',
    status: 'active',
    ...overrides,
  } as ModuleSchema
}

describe('useRules：编译开关', () => {
  it('无规则 schema 编译为 null（零开销直通）', () => {
    const meta = createSchemaMetaState()
    meta.setSchema(makeSchema({}))
    const state = createRulesState(meta)
    expect(state.hasRules.value).toBe(false)
    expect(state.compiled.value).toBeNull()
  })

  it('模块级或字段级规则任一存在即编译', () => {
    const meta = createSchemaMetaState()
    meta.setSchema(makeSchema({
      fields: [{ key: 'price', rules: [{ type: 'compute', target: 'total', watch: ['price'], expr: 'price * 2' }] }] as never[],
    }))
    const state = createRulesState(meta)
    expect(state.hasRules.value).toBe(true)
    expect(state.compiled.value?.computes).toHaveLength(1)
  })
})

describe('useRules：compute 写回与 validate', () => {
  const meta = createSchemaMetaState()
  meta.setSchema(makeSchema({
    rules: [
      { type: 'compute', target: 'total', watch: ['price', 'quantity'], expr: 'price * quantity' },
      { type: 'compute', target: 'double', watch: ['total'], expr: 'total * 2' },
      { type: 'validate', when: 'price < 0', message: 'price must not be negative' },
      { type: 'validate', when: ['quantity', 'lt', 0], message: 'negative quantity', force: 0 },
    ],
  }))
  const state = createRulesState(meta)

  it('watch 触发 + 级联链写回，effect 携带 oldValue', () => {
    const row: Record<string, unknown> = { price: 10, quantity: 3, total: 0, double: 0 }
    const effects = state.applyComputes(row, 'price')
    expect(row['total']).toBe(30)
    expect(row['double']).toBe(60) // 级联：double 监听 total，本轮连锁
    expect(effects.map(e => e.type)).toEqual([Effect.SET, Effect.SET])
    expect(effects[1]?.oldValue).toBe(0)
  })

  it('validate：拦截与强制值', () => {
    const blocked = state.validateCell({ price: -5, quantity: 1 }, 'price', -5, 1)
    expect(blocked.ok).toBe(false)
    expect(blocked.message).toBe('price must not be negative')
    expect(blocked.force).toBeUndefined()

    const forced = state.validateCell({ price: 1, quantity: -2 }, 'quantity', -2, 1)
    expect(forced.ok).toBe(false)
    expect(forced.force).toBe(0)
  })
})

describe('useRules：动作槽位与派生位', () => {
  const meta = createSchemaMetaState()
  meta.setSchema(makeSchema({
    fields: [{
      key: 'submit',
      type: 'action',
      label: '提交',
      rowAction: {
        type: 'custom',
        label: '提交',
        action: { invoke: 'records/submit', params: { id: '{{id}}' }, apply: 'resp', toast: '已提交 {{id}}' },
        labelWhen: [
          { when: { left: { record: 'status' }, operator: 'eq', right: { value: 1 } }, label: '撤回' },
        ],
      },
    }] as never[],
  }))
  const state = createRulesState(meta)

  it('planRowAction 产出 Effect 并插值 params/toast', () => {
    const field = meta.getField('submit')!
    const effects = state.planRowAction(field, { id: 'r1', status: 0 })
    expect(effects.map(e => e.type)).toEqual(['invoke', 'toast'])
    expect(effects[0]?.params).toEqual({ id: 'r1' })
    expect(effects[1]?.message).toBe('已提交 r1')
    // 无 action 槽位的字段规划为空
    const plain = { ...field, rowAction: { type: 'custom' as const, label: 'x' } }
    expect(state.planRowAction(plain as never, {})).toEqual([])
  })

  it('labelWhen 声明序首中生效，不命中返回 null', () => {
    const field = meta.getField('submit')!
    expect(state.resolveRowActionLabel(field, { status: 1 })).toBe('撤回')
    expect(state.resolveRowActionLabel(field, { status: 0 })).toBeNull()
  })
})

describe('useRules：aggregate 统计', () => {
  it('列值数组入作用域，支持 RecordEntity 与平铺行两形态', () => {
    const meta = createSchemaMetaState()
    meta.setSchema(makeSchema({
      rules: [{ type: 'aggregate', key: 'totalAmount', expr: 'sum(amount)' }],
    }))
    const state = createRulesState(meta)
    const entityRows = [
      { fields: { amount: 10 } },
      { fields: { amount: 25.5 } },
    ] as unknown as Array<Record<string, unknown>>
    expect(state.runAggregates(entityRows)).toEqual([{ key: 'totalAmount', value: 35.5 }])

    const flatRows = [{ amount: 1 }, { amount: 2 }]
    expect(state.runAggregates(flatRows)[0]?.value).toBe(3)
  })
})
