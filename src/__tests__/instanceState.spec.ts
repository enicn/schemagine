import { describe, it, expect, beforeEach } from 'vitest'
import {
  createSchemaMetaState,
  createRecordState,
  createUiState,
  createRuntimeContextState,
} from '@/composables/instanceState'
import type { ModuleSchema, FieldSchema, RecordEntity, DraftRecord, UndoEntry } from '@/types'

function makeField(overrides: Partial<FieldSchema> = {}): FieldSchema {
  return {
    id: overrides.key ?? 'f',
    name: overrides.key ?? 'f',
    key: 'f',
    type: 'text',
    label: '字段',
    required: false,
    readonly: false,
    order: 0,
    visible: true,
    sortable: false,
    filterable: false,
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
    permissions: { view: true, create: true, edit: true, delete: true, export: true, configure: true },
    defaultViewMode: 'list',
    status: 'active',
    ...overrides,
  } as ModuleSchema
}

function makeRecord(id: string, fields: Record<string, unknown> = {}): RecordEntity {
  return { id, moduleId: 'module-test', fields, version: 1, createdAt: '', updatedAt: '' }
}

beforeEach(() => {
  // instanceState 模块级状态均为工厂函数局部变量，无跨用例共享，此处仅作防御
})

describe('createSchemaMetaState', () => {
  it('初始状态为空且未加载', () => {
    const s = createSchemaMetaState()
    expect(s.schema).toBeNull()
    expect(s.isLoaded).toBe(false)
    expect(s.visibleFields).toEqual([])
  })

  it('visibleFields 过滤隐藏字段并按 order 排序', () => {
    const s = createSchemaMetaState()
    s.setSchema(makeSchema({
      fields: [
        makeField({ key: 'b', order: 2 }),
        makeField({ key: 'a', order: 1 }),
        makeField({ key: 'c', order: 3, visible: false }),
        makeField({ key: 'd', order: 4, permission: { visible: false, editable: false } }),
      ],
    }))
    expect(s.visibleFields.map(f => f.key)).toEqual(['a', 'b'])
  })

  it('$reset 清空全部状态', () => {
    const s = createSchemaMetaState()
    s.setSchema(makeSchema())
    s.setError('oops')
    s.setLoading(true)
    s.$reset()
    expect(s.schema).toBeNull()
    expect(s.loadError).toBeNull()
    expect(s.isLoading).toBe(false)
  })
})

describe('createRecordState', () => {
  it('setRecords 更新记录与分页 total', () => {
    const s = createRecordState()
    s.setRecords([makeRecord('1'), makeRecord('2')], 99)
    expect(s.hasRecords).toBe(true)
    expect(s.totalRecords).toBe(99)
  })

  it('updateRecordField 同步列表与当前记录并写入乐观锁版本号', () => {
    const s = createRecordState()
    const rec = makeRecord('r1', { amount: 1 })
    s.setRecords([rec], 1)
    s.setCurrentRecord(rec)
    s.updateRecordField('r1', 'amount', 42, 7)
    expect(s.getRecordById('r1')?.fields.amount).toBe(42)
    expect(s.getRecordById('r1')?.version).toBe(7)
    expect(s.currentRecord?.fields.amount).toBe(42)
    expect(s.currentRecord?.version).toBe(7)
  })

  it('updateRecordField 对不存在的记录静默忽略', () => {
    const s = createRecordState()
    expect(() => s.updateRecordField('nope', 'x', 1, 2)).not.toThrow()
  })

  it('undo 栈上限 50 条，popUndo 后进先出', () => {
    const s = createRecordState()
    for (let i = 0; i < 55; i++) {
      const entry: UndoEntry = { type: 'cell', recordId: String(i), field: 'f', previousValue: i, timestamp: i }
      s.pushUndo(entry)
    }
    expect(s.undoStack.length).toBe(50)
    const popped = s.popUndo()
    expect(popped?.recordId).toBe('54')
    s.clearUndo()
    expect(s.popUndo()).toBeUndefined()
  })

  it('草稿行增删改与校验标记', () => {
    const s = createRecordState()
    const draft: DraftRecord = { tempId: 't1', fields: { a: 1 }, isValid: true }
    const index = s.addDraftRow(draft)
    expect(index).toBe(0)
    expect(s.hasDrafts).toBe(true)
    s.updateDraftField(index, 'a', 2)
    expect(s.draftRows[0]!.fields.a).toBe(2)
    s.setErrorsForDraft(index, [{ field: 'a', message: '必填', level: 'error' }])
    expect(s.draftRows[0]!.isValid).toBe(false)
    s.removeDraftRow(index)
    expect(s.hasDrafts).toBe(false)
  })

  it('$reset 恢复初始查询状态', () => {
    const s = createRecordState()
    s.setRecords([makeRecord('1')], 1)
    s.setPagination({ page: 3 })
    s.$reset()
    expect(s.records).toEqual([])
    expect(s.currentPage).toBe(1)
    expect(s.totalRecords).toBe(0)
  })
})

describe('createUiState', () => {
  it('isEditing 跟随 editingCell', () => {
    const s = createUiState()
    expect(s.isEditing).toBe(false)
    s.setEditingCell({ rowId: 'r1', field: 'a' })
    expect(s.isEditing).toBe(true)
    s.setEditingCell(null)
    expect(s.isEditing).toBe(false)
  })

  it('行选择 toggle 与清空', () => {
    const s = createUiState()
    s.toggleRowSelection('r1')
    s.toggleRowSelection('r2')
    expect(s.selectedRowIds).toEqual(['r1', 'r2'])
    s.toggleRowSelection('r1')
    expect(s.selectedRowIds).toEqual(['r2'])
    s.clearSelection()
    expect(s.selectedRowIds).toEqual([])
  })

  it('对话框打开 / 关闭', () => {
    const s = createUiState()
    s.openDialog('confirm', { id: 'r1' })
    expect(s.dialogVisible).toBe(true)
    expect(s.dialogType).toBe('confirm')
    s.closeDialog()
    expect(s.dialogVisible).toBe(false)
    expect(s.dialogType).toBeNull()
  })

  it('消息类型默认 info，clearMessage 复位', () => {
    const s = createUiState()
    s.showMessage('hi', 'error')
    expect(s.globalMessage).toBe('hi')
    expect(s.globalMessageType).toBe('error')
    s.clearMessage()
    expect(s.globalMessage).toBeNull()
    expect(s.globalMessageType).toBe('info')
  })
})

describe('createRuntimeContextState', () => {
  it('setGlobal / $reset', () => {
    const s = createRuntimeContextState({ user: 'admin' })
    expect(s.global.user).toBe('admin')
    s.setGlobal({ user: 'guest' })
    expect(s.global.user).toBe('guest')
    s.$reset()
    expect(s.global).toEqual({})
  })
})

describe('多实例隔离', () => {
  it('两个 RecordState 实例互不串扰', () => {
    const a = createRecordState()
    const b = createRecordState()
    a.setRecords([makeRecord('a1')], 1)
    b.setRecords([makeRecord('b1')], 1)
    a.updateRecordField('a1', 'amount', 100, 2)
    expect(a.getRecordById('a1')?.fields.amount).toBe(100)
    expect(b.getRecordById('a1')).toBeUndefined()
    expect(b.records[0]!.id).toBe('b1')
    a.clearDrafts()
    const draft: DraftRecord = { tempId: 't', fields: {}, isValid: true }
    b.addDraftRow(draft)
    expect(a.draftRows.length).toBe(0)
    expect(b.draftRows.length).toBe(1)
  })

  it('两个 UiState 实例互不串扰', () => {
    const a = createUiState()
    const b = createUiState()
    a.setViewMode('create')
    a.openDialog('confirm')
    expect(b.viewMode).toBe('list')
    expect(b.dialogVisible).toBe(false)
  })

  it('两个 SchemaMetaState 实例互不串扰', () => {
    const a = createSchemaMetaState()
    const b = createSchemaMetaState()
    a.setSchema(makeSchema({ id: 'module-a' }))
    expect(b.schema).toBeNull()
    expect(b.isLoaded).toBe(false)
  })
})
