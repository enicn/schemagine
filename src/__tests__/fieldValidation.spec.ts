import { describe, expect, it } from 'vitest'
import { isEmptyFieldValue, validateFieldValue } from '@/utils/fieldValidation'
import type { FieldSchema, ValidationRule } from '@/types'

function makeField(partial: Partial<FieldSchema> & { validationRules?: ValidationRule[] }): FieldSchema {
  return {
    id: 'f',
    name: 'f',
    key: 'f',
    type: 'text',
    label: '测试字段',
    required: false,
    readonly: false,
    order: 0,
    visible: true,
    sortable: false,
    filterable: false,
    ...partial,
  }
}

describe('fieldValidation 共享校验器(docs/19 D1)', () => {
  it('field.required 隐式必填:空值拦截、非空放行', () => {
    const field = makeField({ required: true })
    expect(validateFieldValue(field, '').valid).toBe(false)
    expect(validateFieldValue(field, '   ').valid).toBe(false)
    expect(validateFieldValue(field, null).errors[0]).toBe('请输入测试字段')
    expect(validateFieldValue(field, 'x').valid).toBe(true)
    expect(validateFieldValue(field, 0).valid).toBe(true)
  })

  it('required 规则:空数组也视为空', () => {
    const field = makeField({
      validationRules: [{ type: 'required', message: '必填哦', level: 'error' }],
    })
    expect(validateFieldValue(field, []).errors).toEqual(['必填哦'])
    expect(validateFieldValue(field, ['a']).valid).toBe(true)
  })

  it('min/max:数值比较,非数值放行', () => {
    const field = makeField({
      type: 'number',
      validationRules: [
        { type: 'min', value: 0, message: '不能为负', level: 'error' },
        { type: 'max', value: 100, message: '不能超 100', level: 'error' },
      ],
    })
    expect(validateFieldValue(field, -1).errors).toEqual(['不能为负'])
    expect(validateFieldValue(field, 101).errors).toEqual(['不能超 100'])
    expect(validateFieldValue(field, 50).valid).toBe(true)
    expect(validateFieldValue(field, 'abc').valid).toBe(true)
  })

  it('minLength/maxLength', () => {
    const field = makeField({
      validationRules: [
        { type: 'minLength', value: 2, message: '至少 2 字', level: 'error' },
        { type: 'maxLength', value: 5, message: '至多 5 字', level: 'error' },
      ],
    })
    expect(validateFieldValue(field, 'a').errors).toEqual(['至少 2 字'])
    expect(validateFieldValue(field, 'abcdef').errors).toEqual(['至多 5 字'])
    expect(validateFieldValue(field, 'abc').valid).toBe(true)
  })

  it('pattern:字符串与 RegExp 皆可', () => {
    const field = makeField({
      validationRules: [{ type: 'pattern', value: '^PZ-', message: '编号需以 PZ- 开头', level: 'error' }],
    })
    expect(validateFieldValue(field, 'AB-1').errors).toEqual(['编号需以 PZ- 开头'])
    expect(validateFieldValue(field, 'PZ-001').valid).toBe(true)

    const reField = makeField({
      validationRules: [{ type: 'pattern', value: /^\d+$/, message: '仅数字', level: 'error' }],
    })
    expect(validateFieldValue(reField, '12a').valid).toBe(false)
    expect(validateFieldValue(reField, '123').valid).toBe(true)
  })

  it('custom:函数返回 false 用默认消息,返回字符串即消息', () => {
    const field = makeField({
      validationRules: [
        { type: 'custom', value: (v: unknown) => v !== 'bad', message: '不能用 bad', level: 'error' },
      ],
    })
    expect(validateFieldValue(field, 'bad').errors).toEqual(['不能用 bad'])
    expect(validateFieldValue(field, 'good').valid).toBe(true)

    const msgField = makeField({
      validationRules: [
        { type: 'custom', value: (v: unknown) => (v === 'x' ? '禁止 x' : true), message: 'ignored', level: 'error' },
      ],
    })
    expect(validateFieldValue(msgField, 'x').errors).toEqual(['禁止 x'])
  })

  it('warning 级不拦截(valid=true),消息进 warnings', () => {
    const field = makeField({
      validationRules: [{ type: 'max', value: 10, message: '建议不超 10', level: 'warning' }],
    })
    const result = validateFieldValue(field, 999)
    expect(result.valid).toBe(true)
    expect(result.warnings).toEqual(['建议不超 10'])
  })

  it('空值只由 required 把关,其他规则对空值放行', () => {
    const field = makeField({
      validationRules: [
        { type: 'min', value: 5, message: '太小', level: 'error' },
        { type: 'pattern', value: '^a', message: '需 a 开头', level: 'error' },
      ],
    })
    expect(validateFieldValue(field, '').valid).toBe(true)
  })

  it('多规则:errors 与 warnings 分流互不影响', () => {
    const field = makeField({
      validationRules: [
        { type: 'min', value: 0, message: '不能为负', level: 'error' },
        { type: 'max', value: 10, message: '偏大', level: 'warning' },
      ],
    })
    const negative = validateFieldValue(field, -5)
    expect(negative.valid).toBe(false)
    expect(negative.errors).toEqual(['不能为负'])
    expect(negative.warnings).toEqual([])

    const big = validateFieldValue(field, 999)
    expect(big.valid).toBe(true)
    expect(big.errors).toEqual([])
    expect(big.warnings).toEqual(['偏大'])
  })

  it('isEmptyFieldValue 口径', () => {
    expect(isEmptyFieldValue(null)).toBe(true)
    expect(isEmptyFieldValue(undefined)).toBe(true)
    expect(isEmptyFieldValue('  ')).toBe(true)
    expect(isEmptyFieldValue([])).toBe(true)
    expect(isEmptyFieldValue(0)).toBe(false)
    expect(isEmptyFieldValue(false)).toBe(false)
    expect(isEmptyFieldValue('x')).toBe(false)
  })
})
