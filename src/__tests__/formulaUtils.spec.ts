import { describe, it, expect } from 'vitest'
import { detectCycle, topologicalSort } from '@/editor/components/formulaUtils'
import type { FormulaFieldConfig } from '@/types'
import { evaluate } from 'mathjs/number'

describe('detectCycle', () => {
  it('returns false for configs without cycles', () => {
    const configs: FormulaFieldConfig[] = [
      { fieldKey: 'taxAmount', expression: 'amount * taxRate', dependencies: ['amount', 'taxRate'], resultType: 'number' },
    ]
    const result = detectCycle('taxAmount', configs)
    expect(result.hasCycle).toBe(false)
    expect(result.cyclePath).toEqual([])
  })

  it('detects direct self-cycle', () => {
    const configs: FormulaFieldConfig[] = [
      { fieldKey: 'a', expression: 'a + 1', dependencies: ['a'], resultType: 'number' },
    ]
    const result = detectCycle('a', configs)
    expect(result.hasCycle).toBe(true)
    expect(result.cyclePath.length).toBeGreaterThanOrEqual(2)
  })

  it('detects indirect cycle (a -> b -> a)', () => {
    const configs: FormulaFieldConfig[] = [
      { fieldKey: 'a', expression: 'b + 1', dependencies: ['b'], resultType: 'number' },
      { fieldKey: 'b', expression: 'a + 1', dependencies: ['a'], resultType: 'number' },
    ]
    const result = detectCycle('a', configs)
    expect(result.hasCycle).toBe(true)
    expect(result.cyclePath.length).toBeGreaterThanOrEqual(3)
  })

  it('detects indirect cycle (a -> b -> c -> a)', () => {
    const configs: FormulaFieldConfig[] = [
      { fieldKey: 'a', expression: 'b + 1', dependencies: ['b'], resultType: 'number' },
      { fieldKey: 'b', expression: 'c + 1', dependencies: ['c'], resultType: 'number' },
      { fieldKey: 'c', expression: 'a + 1', dependencies: ['a'], resultType: 'number' },
    ]
    const result = detectCycle('a', configs)
    expect(result.hasCycle).toBe(true)
  })

  it('handles non-formula dependency fields (no cycle)', () => {
    const configs: FormulaFieldConfig[] = [
      { fieldKey: 'taxAmount', expression: 'amount * taxRate', dependencies: ['amount', 'taxRate'], resultType: 'number' },
      { fieldKey: 'balance', expression: 'amount - paidAmount', dependencies: ['amount', 'paidAmount'], resultType: 'number' },
    ]
    const resultA = detectCycle('taxAmount', configs)
    expect(resultA.hasCycle).toBe(false)

    const resultB = detectCycle('balance', configs)
    expect(resultB.hasCycle).toBe(false)
  })
})

describe('topologicalSort', () => {
  it('returns empty array for empty configs', () => {
    const result = topologicalSort([])
    expect(result).toEqual([])
  })

  it('returns single config when no dependencies are formula fields', () => {
    const configs: FormulaFieldConfig[] = [
      { fieldKey: 'taxAmount', expression: 'amount * taxRate', dependencies: ['amount', 'taxRate'], resultType: 'number' },
    ]
    const result = topologicalSort(configs)
    expect(result).toHaveLength(1)
    expect(result[0]!.fieldKey).toBe('taxAmount')
  })

  it('sorts chained dependencies correctly', () => {
    const configs: FormulaFieldConfig[] = [
      { fieldKey: 'c', expression: 'b + 1', dependencies: ['b'], resultType: 'number' },
      { fieldKey: 'a', expression: 'amount', dependencies: ['amount'], resultType: 'number' },
      { fieldKey: 'b', expression: 'a + 1', dependencies: ['a'], resultType: 'number' },
    ]
    const result = topologicalSort(configs)
    const order = result.map(c => c.fieldKey)
    const idxA = order.indexOf('a')
    const idxB = order.indexOf('b')
    const idxC = order.indexOf('c')
    expect(idxA).toBeLessThan(idxB)
    expect(idxB).toBeLessThan(idxC)
  })

  it('all independent configs are still included', () => {
    const configs: FormulaFieldConfig[] = [
      { fieldKey: 'x', expression: 'amount * taxRate', dependencies: ['amount', 'taxRate'], resultType: 'number' },
      { fieldKey: 'y', expression: 'amount - paidAmount', dependencies: ['amount', 'paidAmount'], resultType: 'number' },
    ]
    const result = topologicalSort(configs)
    expect(result).toHaveLength(2)
    const keys = result.map(c => c.fieldKey)
    expect(keys).toContain('x')
    expect(keys).toContain('y')
  })
})

describe('Math.js evaluate precision', () => {
  it('99 * 0.13 should equal 12.87 without floating point noise', () => {
    const result = evaluate('amount * taxRate', { amount: 99, taxRate: 0.13 })
    const clean = Math.round((result as number) * 1e10) / 1e10
    expect(clean).toBe(12.87)
    expect(String(clean)).not.toContain('000000001')
  })

  it('100 * 0.13 should equal 13 exactly', () => {
    const result = evaluate('amount * taxRate', { amount: 100, taxRate: 0.13 })
    const clean = Math.round((result as number) * 1e10) / 1e10
    expect(clean).toBe(13)
  })

  it('supports complex expressions with multiple operators', () => {
    const result = evaluate('amount - paidAmount', { amount: 50000, paidAmount: 50000 }) as number
    expect(result).toBe(0)
  })

  it('supports chained expressions', () => {
    const result = evaluate('(amount + tax) * rate', { amount: 100, tax: 13, rate: 0.1 }) as number
    const clean = Math.round(result * 1e10) / 1e10
    expect(clean).toBe(11.3)
  })

  it('handles division without precision loss', () => {
    const result = evaluate('a / b', { a: 10, b: 3 }) as number
    const clean = Math.round(result * 1e10) / 1e10
    expect(clean).toBeCloseTo(3.3333333333, 10)
  })
})
