import { describe, expect, it } from 'vitest'
import { formatMoney } from '../utils/formatMoney'

describe('formatMoney 金额展示口径（默认两位，超出两位按有效位展示）', () => {
  it('整数/常规值补齐两位', () => {
    expect(formatMoney('77')).toBe('77.00')
    expect(formatMoney('124.00')).toBe('124.00')
    expect(formatMoney('0.1')).toBe('0.10')
    expect(formatMoney(77)).toBe('77.00')
    expect(formatMoney(0)).toBe('0.00')
  })

  it('两位以内正常展示', () => {
    expect(formatMoney('0.0100')).toBe('0.01')
    expect(formatMoney('77.0000')).toBe('77.00')
    expect(formatMoney('96.00')).toBe('96.00')
  })

  it('超出两位的有效小数额外展示（去尾零）', () => {
    expect(formatMoney('22.2500')).toBe('22.25')
    expect(formatMoney('22.2550')).toBe('22.255')
    expect(formatMoney('29.375')).toBe('29.375')
    expect(formatMoney('77.0001')).toBe('77.0001')
    expect(formatMoney('-0.005')).toBe('-0.005')
  })

  it('非数值与空值原样/空串返回', () => {
    expect(formatMoney('')).toBe('')
    expect(formatMoney(null)).toBe('')
    expect(formatMoney(undefined)).toBe('')
    expect(formatMoney('abc')).toBe('abc')
  })
})
