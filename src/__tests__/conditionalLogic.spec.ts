import { describe, it, expect } from 'vitest'
import { evaluate as mangoEvaluate } from 'mathjs/number'
import { evaluateCondition, registerConditionEvaluator } from '@/utils/condition'
import type { Condition } from '@/types'

describe('条件表达式求值', () => {
  it('应支持 record 字段比较（neq）', () => {
    const condition: Condition = {
      left: { record: 'currency' },
      operator: 'neq',
      right: { value: 'CNY' },
    }
    expect(evaluateCondition(condition, { record: { currency: 'CNY' }, global: {} })).toBe(false)
    expect(evaluateCondition(condition, { record: { currency: 'USD' }, global: {} })).toBe(true)
  })

  it('应支持与/或组合', () => {
    const condition: Condition = {
      and: [
        { left: { record: 'amount' }, operator: 'gt', right: { value: 0 } },
        {
          or: [
            { left: { record: 'currency' }, operator: 'eq', right: { value: 'CNY' } },
            { left: { record: 'currency' }, operator: 'eq', right: { value: 'USD' } },
          ],
        },
      ],
    }

    expect(evaluateCondition(condition, { record: { amount: 1, currency: 'CNY' }, global: {} })).toBe(true)
    expect(evaluateCondition(condition, { record: { amount: 1, currency: 'EUR' }, global: {} })).toBe(false)
    expect(evaluateCondition(condition, { record: { amount: 0, currency: 'CNY' }, global: {} })).toBe(false)
  })

  it('应支持 global 上下文取值', () => {
    const condition: Condition = {
      left: { global: 'settings.defaultCurrency' },
      operator: 'eq',
      right: { value: 'CNY' },
    }

    expect(evaluateCondition(condition, { record: {}, global: { settings: { defaultCurrency: 'CNY' } } })).toBe(true)
    expect(evaluateCondition(condition, { record: {}, global: { settings: { defaultCurrency: 'USD' } } })).toBe(false)
  })

  it('应支持 in / contains / isEmpty', () => {
    const inCondition: Condition = {
      left: { record: 'currency' },
      operator: 'in',
      right: { value: ['CNY', 'USD'] },
    }
    expect(evaluateCondition(inCondition, { record: { currency: 'CNY' }, global: {} })).toBe(true)
    expect(evaluateCondition(inCondition, { record: { currency: 'EUR' }, global: {} })).toBe(false)

    const containsCondition: Condition = {
      left: { record: 'tags' },
      operator: 'contains',
      right: { value: 'hot' },
    }
    expect(evaluateCondition(containsCondition, { record: { tags: ['hot', 'new'] }, global: {} })).toBe(true)
    expect(evaluateCondition(containsCondition, { record: { tags: ['new'] }, global: {} })).toBe(false)

    const emptyCondition: Condition = {
      left: { record: 'note' },
      operator: 'isEmpty',
    }
    expect(evaluateCondition(emptyCondition, { record: { note: '' }, global: {} })).toBe(true)
    expect(evaluateCondition(emptyCondition, { record: { note: 'x' }, global: {} })).toBe(false)
  })
})


describe('表达式串/三段形条件（宿主求值接缝）', () => {
  const flag = (v: unknown) => (v as number) >> 0

  it('未注册求值器时字符串条件恒 false', () => {
    expect(evaluateCondition('flag(is_checked) == 0', { record: { is_checked: 0 }, global: {} })).toBe(false)
  })

  it('注册后字符串条件按宿主函数与行字段求值', () => {
    registerConditionEvaluator({
      evaluate: (expr, scope) => mangoEvaluate(expr, scope),
      functions: { flag, mod: () => true },
    })
    const ctx = { record: { is_checked: 1, is_suspended: 0 }, global: {} }
    expect(evaluateCondition('flag(is_checked) == 1 and flag(is_suspended) == 0', ctx)).toBe(true)
    expect(evaluateCondition('flag(is_checked) == 0', ctx)).toBe(false)
    // 语法错误 fail-closed 且不抛出
    expect(evaluateCondition('flag(is_checked) >>', ctx)).toBe(false)
  })

  it('三段形条件无需求值器即可用', () => {
    expect(evaluateCondition(['is_checked', 'eq', 1], { record: { is_checked: 1 }, global: {} })).toBe(true)
    expect(evaluateCondition(['is_checked', 'eq', { record: 'mirror' }] as unknown as Condition, { record: { is_checked: 1, mirror: 1 }, global: {} })).toBe(true)
    expect(evaluateCondition(['amount', 'gt', 10], { record: { amount: 5 }, global: {} })).toBe(false)
  })

  it('对象形条件不受接缝影响', () => {
    const condition: Condition = { left: { record: 'a' }, operator: 'eq', right: { value: 1 } }
    expect(evaluateCondition(condition, { record: { a: 1 }, global: {} })).toBe(true)
  })
})
