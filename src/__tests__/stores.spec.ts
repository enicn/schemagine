import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRecordStore } from '@/stores/recordStore'
import { useUiStateStore } from '@/stores/uiStateStore'
import { useRuntimeCacheStore } from '@/stores/runtimeCacheStore'
import type { RecordEntity, DraftRecord, CandidateOption } from '@/types'

function makeRecord(id: string, fields: Record<string, unknown> = {}): RecordEntity {
  return { id, moduleId: 'module-test', fields, version: 1, createdAt: '', updatedAt: '' }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('recordStore', () => {
  it('setRecords 更新记录与 total，getRecordById 按 id 查找', () => {
    const store = useRecordStore()
    store.setRecords([makeRecord('r1'), makeRecord('r2')], 20)
    expect(store.hasRecords).toBe(true)
    expect(store.totalRecords).toBe(20)
    expect(store.getRecordById('r2')?.id).toBe('r2')
    expect(store.getRecordById('nope')).toBeUndefined()
  })

  it('updateRecordField 同步列表与当前记录并更新乐观锁版本', () => {
    const store = useRecordStore()
    const rec = makeRecord('r1', { amount: 1 })
    store.setRecords([rec], 1)
    store.setCurrentRecord(rec)
    store.updateRecordField('r1', 'amount', 42, 7)
    expect(store.getRecordById('r1')?.fields.amount).toBe(42)
    expect(store.currentRecord?.version).toBe(7)
  })

  it('undo 栈上限 50 条', () => {
    const store = useRecordStore()
    for (let i = 0; i < 55; i++) {
      store.pushUndo({ type: 'cell', recordId: String(i), field: 'f', previousValue: i, timestamp: i })
    }
    expect(store.undoStack.length).toBe(50)
    expect(store.popUndo()?.recordId).toBe('54')
  })

  it('草稿行操作与 setErrorsForDraft', () => {
    const store = useRecordStore()
    const draft: DraftRecord = { tempId: 't1', fields: { a: 1 }, isValid: true }
    store.addDraftRow(draft)
    store.updateDraftField(0, 'a', 9)
    expect(store.draftRows[0]!.fields.a).toBe(9)
    store.setErrorsForDraft(0, [{ field: 'a', message: '必填', level: 'error' }])
    expect(store.draftRows[0]!.isValid).toBe(false)
    store.clearDrafts()
    expect(store.hasDrafts).toBe(false)
  })
})

describe('uiStateStore', () => {
  it('视图模式切换与编辑态', () => {
    const store = useUiStateStore()
    expect(store.viewMode).toBe('list')
    store.setViewMode('create')
    expect(store.viewMode).toBe('create')
    store.setEditingCell({ rowId: 'r1', field: 'a' })
    expect(store.isEditing).toBe(true)
  })

  it('行选择 toggle', () => {
    const store = useUiStateStore()
    store.toggleRowSelection('r1')
    store.toggleRowSelection('r1')
    expect(store.selectedRowIds).toEqual([])
    store.setSelectedRows(['r2', 'r3'])
    expect(store.selectedRowIds).toEqual(['r2', 'r3'])
  })

  it('对话框状态', () => {
    const store = useUiStateStore()
    store.openDialog('confirm', { id: 'r1' })
    expect(store.dialogVisible).toBe(true)
    expect(store.dialogType).toBe('confirm')
    store.closeDialog()
    expect(store.dialogVisible).toBe(false)
  })
})

describe('runtimeCacheStore', () => {
  it('候选值缓存按 模块:关键词 隔离并可按模块失效', () => {
    const store = useRuntimeCacheStore()
    const opts: CandidateOption[] = [{ value: 'a', label: 'A' }]
    store.setCandidates('module-ap', 'foo', opts)
    store.setCandidates('module-voucher', 'bar', opts)
    expect(store.getCandidates('module-ap', 'foo')).toEqual(opts)
    expect(store.getCandidates('module-ap', '')).toBeNull()
    store.invalidateCandidateCache('module-ap')
    expect(store.getCandidates('module-ap', 'foo')).toBeNull()
    expect(store.getCandidates('module-voucher', 'bar')).toEqual(opts)
    store.invalidateCandidateCache()
    expect(store.getCandidates('module-voucher', 'bar')).toBeNull()
  })

  it('公式结果缓存与失效', () => {
    const store = useRuntimeCacheStore()
    store.setFormulaResult('r1:total', 123)
    expect(store.getFormulaResult('r1:total')).toBe(123)
    store.invalidateFormulaCache()
    expect(store.getFormulaResult('r1:total')).toBeNull()
  })

  it('会话快照保存与清除', () => {
    const store = useRuntimeCacheStore()
    store.saveSnapshot({ a: 1 })
    expect(store.getSnapshot()).toEqual({ a: 1 })
    store.clearSnapshot()
    expect(store.getSnapshot()).toBeNull()
  })

  it('$reset 清空全部缓存', () => {
    const store = useRuntimeCacheStore()
    store.setCandidates('m', 'k', [])
    store.setFormulaResult('k', 1)
    store.saveSnapshot({ x: 1 })
    store.$reset()
    expect(store.getCandidates('m', 'k')).toBeNull()
    expect(store.getFormulaResult('k')).toBeNull()
    expect(store.getSnapshot()).toBeNull()
  })
})

describe('Pinia 多实例隔离', () => {
  it('不同 Pinia 实例间的 recordStore 互不串扰', () => {
    const storeA = useRecordStore()
    storeA.setRecords([makeRecord('a1')], 1)

    setActivePinia(createPinia())
    const storeB = useRecordStore()
    storeB.setRecords([makeRecord('b1')], 1)

    expect(storeB.getRecordById('a1')).toBeUndefined()
    expect(storeA.getRecordById('b1')).toBeUndefined()
  })
})
