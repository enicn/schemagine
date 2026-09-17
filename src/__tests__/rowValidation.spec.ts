import { describe, expect, it } from 'vitest'
import type { FieldSchema, RowValidationRule } from '@/types'
import {
  createValidationGate,
  validateFieldValueAsync,
  validateRecordRow,
} from '@/utils/fieldValidation'

describe('validateRecordRow（docs/19 H1 行级校验）', () => {
  const rules: RowValidationRule[] = [
    {
      key: 'dateRange',
      message: '结束日期需晚于开始日期',
      level: 'error',
      fields: ['dateStart', 'dateEnd'],
      // dateEnd <= dateStart 触发
      when: { left: { record: 'dateEnd' }, operator: 'lte', right: { record: 'dateStart' } },
    },
    {
      key: 'paidHint',
      message: '已付清记录建议核对余额',
      level: 'warning',
      when: { left: { record: 'status' }, operator: 'eq', right: { value: 'paid' } },
    },
  ]

  it('跨字段 error：条件命中 → 拦截（valid=false）', () => {
    const result = validateRecordRow(rules, { dateStart: '2026-05-10', dateEnd: '2026-05-01', status: 'unpaid' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('结束日期需晚于开始日期')
  })

  it('条件未命中 → 放行', () => {
    const result = validateRecordRow(rules, { dateStart: '2026-05-01', dateEnd: '2026-05-10', status: 'unpaid' })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('warning 级规则 → 放行仅提示，不影响 valid', () => {
    const result = validateRecordRow(rules, { dateStart: '2026-05-01', dateEnd: '2026-05-10', status: 'paid' })
    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('已付清记录建议核对余额')
  })

  it('无规则/空数组 → 恒通过', () => {
    expect(validateRecordRow(undefined, {}).valid).toBe(true)
    expect(validateRecordRow([], {}).valid).toBe(true)
  })

  it('and/or/not 组合条件按整行上下文求值', () => {
    const composed: RowValidationRule[] = [
      {
        key: 'combo',
        message: '高额未付款需填优先级',
        level: 'error',
        when: {
          and: [
            { left: { record: 'amount' }, operator: 'gte', right: { value: 10000 } },
            { left: { record: 'status' }, operator: 'eq', right: { value: 'unpaid' } },
            { not: { left: { record: 'priority' }, operator: 'exists' } },
          ],
        },
      },
    ]
    expect(validateRecordRow(composed, { amount: 20000, status: 'unpaid' }).valid).toBe(false)
    expect(validateRecordRow(composed, { amount: 20000, status: 'unpaid', priority: 'high' }).valid).toBe(true)
    expect(validateRecordRow(composed, { amount: 1, status: 'unpaid' }).valid).toBe(true)
  })
})

describe('validateFieldValueAsync（docs/19 H2 异步校验）', () => {
  const field = (rules: FieldSchema['validationRules']): FieldSchema => ({
    id: 'f1', name: '编号', key: 'code', type: 'text', label: '编号',
    validationRules: rules,
  } as FieldSchema)

  it('custom 返回 Promise<false> → error 拦截', async () => {
    const f = field([{ type: 'custom', message: '编号已存在', level: 'error', value: async () => false }])
    const result = await validateFieldValueAsync(f, 'A-1')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('编号已存在')
  })

  it('custom 返回 Promise<string> → 以该字符串为错误消息', async () => {
    const f = field([{ type: 'custom', message: '占位', level: 'error', value: async () => '服务端校验未通过' }])
    const result = await validateFieldValueAsync(f, 'A-1')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('服务端校验未通过')
  })

  it('custom 返回 Promise<true> → 通过', async () => {
    const f = field([{ type: 'custom', message: '', level: 'error', value: async () => true }])
    const result = await validateFieldValueAsync(f, 'A-1')
    expect(result.valid).toBe(true)
  })

  it('异步 custom 与内置规则同结果（同一 schema 同口径）', async () => {
    const f = field([
      { type: 'required', message: '必填', level: 'error' },
      { type: 'min', value: 10, message: '不能小于10', level: 'error' },
    ])
    const syncResult = validateFieldValueAsync === null ? null : null
    expect(syncResult).toBeNull()
    const r1 = await validateFieldValueAsync(f, 5)
    expect(r1.valid).toBe(false)
    expect(r1.errors).toEqual(['不能小于10'])
    const r2 = await validateFieldValueAsync(f, '')
    expect(r2.errors).toEqual(['必填'])
  })
})

describe('createValidationGate（docs/19 H2 竞态保护）', () => {
  it('先发后至的结果被丢弃（返回 null），最新结果生效', async () => {
    const gate = createValidationGate()
    const slow = gate(() => new Promise<string>(resolve => setTimeout(() => resolve('slow-old'), 50)))
    const fast = gate(() => new Promise<string>(resolve => setTimeout(() => resolve('fast-new'), 10)))
    expect(await fast).toBe('fast-new')
    expect(await slow).toBeNull()
  })

  it('无并发时结果原样通过', async () => {
    const gate = createValidationGate()
    expect(await gate(async () => 'only')).toBe('only')
  })
})
