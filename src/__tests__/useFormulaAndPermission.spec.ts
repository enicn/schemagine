import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFormula } from '@/composables/useFormula'
import { usePermission } from '@/composables/usePermission'
import { createSchemaMetaState } from '@/composables/instanceState'
import { useRecordStore } from '@/stores/recordStore'
import type { ModuleSchema, FieldSchema, FormulaFieldConfig, RecordEntity } from '@/types'

beforeEach(() => {
  setActivePinia(createPinia())
})

const PERMS = { view: true, create: true, edit: true, delete: true, export: true, configure: true }

function makeField(key: string, overrides: Partial<FieldSchema> = {}): FieldSchema {
  return {
    id: key, name: key, key, type: 'text', label: key,
    required: false, readonly: false, order: 0, visible: true,
    sortable: false, filterable: false,
    ...overrides,
  } as FieldSchema
}

function makeSchema(overrides: Partial<ModuleSchema> = {}): ModuleSchema {
  return {
    id: 'module-test',
    name: '测试模块',
    version: '1.0.0',
    moduleType: 'both',
    fields: [],
    permissions: { ...PERMS },
    defaultViewMode: 'list',
    status: 'active',
    ...overrides,
  } as ModuleSchema
}

function makeMetaWithFormula(config: FormulaFieldConfig[]): ModuleSchema {
  return makeSchema({ formulaConfig: { enabled: true, fields: config, maxDepth: 8, circularDependencyCheck: true } })
}

function makeRecordsStub(store?: ReturnType<typeof useRecordStore>) {
  return {
    getRecordById: (id: string) => store?.getRecordById(id),
  } as never
}

function makeFormula(fields: Partial<Record<string, unknown>>): Record<string, unknown> {
  return fields
}

describe('useFormula', () => {
  it('基础四则运算求值', () => {
    const meta = createSchemaMetaState()
    meta.setSchema(makeMetaWithFormula([
      { fieldKey: 'total', expression: 'amount * price', dependencies: ['amount', 'price'], resultType: 'number' },
    ]))
    const f = useFormula(makeRecordsStub(), meta as never)
    const result = f.evaluateFormula('total', makeFormula({ amount: 3, price: 25 }))
    expect(result.success).toBe(true)
    expect(result.value).toBe(75)
  })

  it('依赖缺失返回 missing_dependency', () => {
    const meta = createSchemaMetaState()
    meta.setSchema(makeMetaWithFormula([
      { fieldKey: 'total', expression: 'a + b', dependencies: ['a', 'b'], resultType: 'number' },
    ]))
    const f = useFormula(makeRecordsStub(), meta as never)
    const result = f.evaluateFormula('total', makeFormula({ a: 1 }))
    expect(result.success).toBe(false)
    expect(result.errorType).toBe('missing_dependency')
  })

  it('表达式错误返回 eval 错误', () => {
    const meta = createSchemaMetaState()
    meta.setSchema(makeMetaWithFormula([
      { fieldKey: 'bad', expression: 'a +', dependencies: ['a'], resultType: 'number' },
    ]))
    const f = useFormula(makeRecordsStub(), meta as never)
    const result = f.evaluateFormula('bad', makeFormula({ a: 1 }))
    expect(result.success).toBe(false)
    expect(result.errorType).toBe('eval')
  })

  it('检测到循环依赖时返回 circular', () => {
    const meta = createSchemaMetaState()
    meta.setSchema(makeMetaWithFormula([
      { fieldKey: 'a', expression: 'b + 1', dependencies: ['b'], resultType: 'number' },
      { fieldKey: 'b', expression: 'a + 1', dependencies: ['a'], resultType: 'number' },
    ]))
    const f = useFormula(makeRecordsStub(), meta as never)
    const result = f.evaluateFormula('a', makeFormula({ a: 1, b: 2 }))
    expect(result.success).toBe(false)
    expect(result.errorType).toBe('circular')
    expect(result.errorMessage).toContain('循环依赖')
  })

  it('evaluateAllFormulas 按拓扑序求值并把结果回填依赖链', () => {
    const meta = createSchemaMetaState()
    meta.setSchema(makeMetaWithFormula([
      { fieldKey: 'total', expression: 'subtotal * taxRate', dependencies: ['subtotal', 'taxRate'], resultType: 'number' },
      { fieldKey: 'subtotal', expression: 'price * qty', dependencies: ['price', 'qty'], resultType: 'number' },
    ]))
    const f = useFormula(makeRecordsStub(), meta as never)
    const fields = makeFormula({ price: 10, qty: 2, taxRate: 0.1 })
    const results = f.evaluateAllFormulas(fields)
    expect(results.get('subtotal')?.value).toBe(20)
    expect(results.get('total')?.value).toBe(2)
    expect(fields.subtotal).toBe(20)
  })

  it('公式未启用时返回空配置', () => {
    const meta = createSchemaMetaState()
    meta.setSchema(makeSchema({ formulaConfig: { enabled: false, fields: [], maxDepth: 8, circularDependencyCheck: true } }))
    const f = useFormula(makeRecordsStub(), meta as never)
    expect(f.formulaConfigs.value).toEqual([])
  })

  it('getDependentFields 返回反向依赖', () => {
    const meta = createSchemaMetaState()
    meta.setSchema(makeMetaWithFormula([
      { fieldKey: 'total', expression: 'price * qty', dependencies: ['price', 'qty'], resultType: 'number' },
    ]))
    const f = useFormula(makeRecordsStub(), meta as never)
    expect(f.getDependentFields('price')).toEqual(['total'])
    expect(f.getDependentFields('nobody')).toEqual([])
  })

  it('浮点精度清洗', () => {
    const meta = createSchemaMetaState()
    meta.setSchema(makeMetaWithFormula([
      { fieldKey: 'x', expression: '0.1 + 0.2', dependencies: [], resultType: 'number' },
    ]))
    const f = useFormula(makeRecordsStub(), meta as never)
    const result = f.evaluateFormula('x', makeFormula({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(0.3)
  })

  it('text 类型结果转为字符串', () => {
    const meta = createSchemaMetaState()
    meta.setSchema(makeMetaWithFormula([
      { fieldKey: 'label', expression: 'a + b', dependencies: ['a', 'b'], resultType: 'text' },
    ]))
    const f = useFormula(makeRecordsStub(), meta as never)
    const result = f.evaluateFormula('label', makeFormula({ a: 1, b: 2 }))
    expect(result.value).toBe('3')
  })
})

describe('usePermission', () => {
  it('权限计算属性映射 permissions', () => {
    const state = createSchemaMetaState()
    state.setSchema(makeSchema())
    state.setPermissions({ ...PERMS, edit: false, delete: false })
    const p = usePermission(state as never)
    expect(p.canView.value).toBe(true)
    expect(p.canEdit.value).toBe(false)
    expect(p.canDelete.value).toBe(false)
    expect(p.canConfigure.value).toBe(true)
  })

  it('canDeleteRecords 需要权限与 operations 配置双重门控', () => {
    const stateNoOp = createSchemaMetaState()
    stateNoOp.setSchema(makeSchema()) // 未配置 operations.delete
    stateNoOp.setPermissions({ ...PERMS })
    const p1 = usePermission(stateNoOp as never)
    expect(p1.canDeleteRecords.value).toBe(false)

    const stateAll = createSchemaMetaState()
    stateAll.setSchema(makeSchema({ operations: { delete: { enabled: true, batch: true } } }))
    stateAll.setPermissions({ ...PERMS })
    const p2 = usePermission(stateAll as never)
    expect(p2.canDeleteRecords.value).toBe(true)
    expect(p2.canBatchDeleteRecords.value).toBe(true)

    const stateNoPerm = createSchemaMetaState()
    stateNoPerm.setSchema(makeSchema({ operations: { delete: { enabled: true, batch: true } } }))
    stateNoPerm.setPermissions({ ...PERMS, delete: false })
    const p3 = usePermission(stateNoPerm as never)
    expect(p3.canDeleteRecords.value).toBe(false)
  })

  it('isFieldVisible 过滤不可见与无权限字段', () => {
    const state = createSchemaMetaState()
    state.setSchema(makeSchema({
      fields: [
        makeField('a'),
        makeField('b', { visible: false }),
        makeField('c', { permission: { visible: false, editable: true } }),
      ],
    }))
    const p = usePermission(state as never)
    expect(p.isFieldVisible('a')).toBe(true)
    expect(p.isFieldVisible('b')).toBe(false)
    expect(p.isFieldVisible('c')).toBe(false)
    expect(p.isFieldVisible('missing')).toBe(false)
    expect(p.filterVisibleFields([{ key: 'a' }, { key: 'b' }, { key: 'c' }])).toEqual([{ key: 'a' }])
  })

  it('isFieldEditable 综合只读、字段权限与模块权限', () => {
    const state = createSchemaMetaState()
    state.setSchema(makeSchema({
      fields: [
        makeField('a'),
        makeField('b', { readonly: true }),
        makeField('c', { permission: { visible: true, editable: false } }),
      ],
      permissions: { ...PERMS, edit: false },
    }))
    const p = usePermission(state as never)
    expect(p.isFieldEditable('a')).toBe(false) // 模块级 edit=false
    expect(p.isFieldEditable('b')).toBe(false)
    expect(p.isFieldEditable('c')).toBe(false)
  })
})

describe('乐观锁场景（recordStore × useFormula）', () => {
  it('记录版本更新后公式依赖取到最新值', () => {
    const store = useRecordStore()
    const rec: RecordEntity = { id: 'r1', moduleId: 'm', fields: { price: 10, qty: 2 }, version: 1, createdAt: '', updatedAt: '' }
    store.setRecords([rec], 1)
    store.updateRecordField('r1', 'qty', 5, 2)

    const meta = createSchemaMetaState()
    meta.setSchema(makeMetaWithFormula([
      { fieldKey: 'total', expression: 'price * qty', dependencies: ['price', 'qty'], resultType: 'number' },
    ]))
    const f = useFormula(makeRecordsStub(store), meta as never)
    const result = f.evaluateFormula('total', store.getRecordById('r1')!.fields)
    expect(result.success).toBe(true)
    expect(result.value).toBe(50)
    expect(store.getRecordById('r1')?.version).toBe(2)
  })
})
