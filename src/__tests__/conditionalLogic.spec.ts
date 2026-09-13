import { describe, it, expect } from 'vitest'
import { evaluateCondition } from '@/utils/condition'
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

