import { describe, it, expect } from 'vitest'
import { validateSchema } from '@/schemaMeta/validateSchema'
import { voucherSchema, apSchema, emptyModuleSchema, userSchema } from '@/services/mock/sampleSchemas'

function makeSchema(overrides: Record<string, unknown>, fields: Array<Record<string, unknown>> = []): unknown {
  return {
    id: 'module-x',
    name: '测试模块',
    version: '1.0.0',
    moduleType: 'list',
    fields,
    ...overrides,
  }
}

function makeField(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: overrides.key ?? 'f',
    name: overrides.key ?? 'f',
    key: overrides.key ?? 'f',
    type: 'text',
    label: overrides.key ?? 'f',
    required: false,
    readonly: false,
    order: 0,
    visible: true,
    sortable: false,
    filterable: false,
    ...overrides,
  }
}

function errorsOf(diagnostics: ReturnType<typeof validateSchema>) {
  return diagnostics.filter(d => d.level === 'error')
}

describe('validateSchema 运行时诊断(docs/19 I2)', () => {
  it('演示模块 schema 全部合法(零报错零警告)', () => {
    for (const schema of [voucherSchema, apSchema, emptyModuleSchema, userSchema]) {
      expect(validateSchema(schema)).toEqual([])
    }
  })

  it('非对象输入报错', () => {
    expect(errorsOf(validateSchema(null))).toHaveLength(1)
    expect(errorsOf(validateSchema('str'))).toHaveLength(1)
    expect(errorsOf(validateSchema([1, 2]))).toHaveLength(1)
  })

  it('缺模块 name / 空 fields 各自报错', () => {
    const noName = validateSchema(makeSchema({ name: undefined }))
    expect(noName.map(d => d.path)).toContain('name')

    const emptyFields = validateSchema(makeSchema({}, []))
    expect(emptyFields.map(d => d.path)).toContain('fields')
  })

  it('字段缺 name / key 重复 / 类型非法 各自报错并定位', () => {
    const diagnostics = validateSchema(makeSchema({}, [
      makeField({ key: 'a', name: undefined }),
      makeField({ key: 'a' }),
      makeField({ key: 'b', type: 'not-a-type' }),
    ]))
    const errors = errorsOf(diagnostics)
    expect(errors.some(d => d.path === 'fields[0].name')).toBe(true)
    expect(errors.some(d => d.message.includes('「a」重复'))).toBe(true)
    expect(errors.some(d => d.path === 'fields[2].type' && d.message.includes('not-a-type'))).toBe(true)
    expect(errors.filter(d => d.path.endsWith('.key'))).toHaveLength(1)
  })

  it('关系字段缺归属声明各自报错(fk/reverse-ref/many-to-many)', () => {
    const diagnostics = validateSchema(makeSchema({}, [
      makeField({ key: 'dept', type: 'fk' }),
      makeField({ key: 'ref', type: 'reverse-ref' }),
      makeField({ key: 'shops', type: 'many-to-many' }),
    ]))
    const errors = errorsOf(diagnostics)
    expect(errors.some(d => d.path === 'fields[0].targetModule')).toBe(true)
    expect(errors.some(d => d.path === 'fields[1].reverseRefConfig')).toBe(true)
    expect(errors.some(d => d.path === 'fields[2].relationConfig')).toBe(true)
  })

  it('关系字段归属声明齐全不报错(各类型按各自声明方式)', () => {
    const diagnostics = validateSchema(makeSchema({}, [
      makeField({ key: 'dept', type: 'fk', targetModule: 'module-dept' }),
      makeField({ key: 'shops', type: 'many-to-many', relationConfig: { targetModule: 'module-workshop' } }),
      makeField({ key: 'refs', type: 'reverse-ref', reverseRefConfig: { sourceModules: ['module-a'], relationFieldKey: 'k' } }),
    ]))
    expect(errorsOf(diagnostics)).toHaveLength(0)
  })

  it('未知模块级/字段级键降级为 warning', () => {
    const diagnostics = validateSchema(makeSchema({ hostExtension: { x: 1 } }, [
      makeField({ key: 'a', hostFieldFlag: true }),
    ]))
    expect(errorsOf(diagnostics)).toHaveLength(0)
    const warnings = diagnostics.filter(d => d.level === 'warning')
    expect(warnings.some(d => d.path === 'hostExtension')).toBe(true)
    expect(warnings.some(d => d.path === 'fields[0].hostFieldFlag')).toBe(true)
  })

  it('枚举字段缺 options 给 warning', () => {
    const diagnostics = validateSchema(makeSchema({}, [
      makeField({ key: 's', type: 'select' }),
    ]))
    expect(errorsOf(diagnostics)).toHaveLength(0)
    expect(diagnostics.some(d => d.path === 'fields[0].options' && d.level === 'warning')).toBe(true)
  })
})
