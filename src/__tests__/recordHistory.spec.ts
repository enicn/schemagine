import { describe, it, expect } from 'vitest'
import { createRecordState, createUiState } from '@/composables/instanceState'
import { useRecordHistory } from '@/composables/useRecordHistory'
import type { RecordEntity, FieldChangeSnapshot } from '@/types'

function makeRecord(id: string, fields: Record<string, unknown> = {}, version = 1): RecordEntity {
  return { id, moduleId: 'module-test', fields, version, createdAt: '', updatedAt: '' }
}

function makeChange(overrides: Partial<FieldChangeSnapshot>): FieldChangeSnapshot {
  return {
    recordId: 'r1',
    field: 'status',
    previousValue: 'old',
    newValue: 'new',
    previousVersion: 1,
    newVersion: 2,
    ...overrides,
  }
}

function setup(rows: RecordEntity[]) {
  const recordStore = createRecordState()
  const uiState = createUiState()
  recordStore.setRecords(rows, rows.length)
  const history = useRecordHistory(recordStore, uiState)
  return { recordStore, uiState, history }
}

describe('useRecordHistory(docs/19 H3)', () => {
  it('pushCellEdit → undo 还原值与版本,redo 重放,canUndo/canRedo 联动', () => {
    const { recordStore, history } = setup([makeRecord('r1', { status: 'old' })])
    expect(history.canUndo.value).toBe(false)

    recordStore.updateRecordField('r1', 'status', 'new', 2)
    history.pushCellEdit(makeChange({}))

    expect(history.canUndo.value).toBe(true)
    const undone = history.undo()
    expect(undone?.type).toBe('cell-edit')
    expect(recordStore.getRecordById('r1')?.fields.status).toBe('old')
    expect(recordStore.getRecordById('r1')?.version).toBe(1)
    expect(history.canUndo.value).toBe(false)
    expect(history.canRedo.value).toBe(true)

    const redone = history.redo()
    expect(redone).toBeDefined()
    expect(recordStore.getRecordById('r1')?.fields.status).toBe('new')
    expect(recordStore.getRecordById('r1')?.version).toBe(2)
    expect(history.canRedo.value).toBe(false)
    expect(history.canUndo.value).toBe(true)
  })

  it('批量编辑整批一个条目:一次 undo 还原全部行,一次 redo 重放全部行', () => {
    const { recordStore, history } = setup([
      makeRecord('r1', { status: 'pending' }),
      makeRecord('r2', { status: 'pending' }),
    ])
    history.pushBatchEdit([
      makeChange({ recordId: 'r1', previousValue: 'pending', newValue: 'done', previousVersion: 1, newVersion: 3 }),
      makeChange({ recordId: 'r2', previousValue: 'pending', newValue: 'done', previousVersion: 1, newVersion: 4 }),
    ])

    const undone = history.undo()
    expect(undone?.type).toBe('batch-edit')
    expect(recordStore.getRecordById('r1')?.fields.status).toBe('pending')
    expect(recordStore.getRecordById('r2')?.fields.status).toBe('pending')
    expect(recordStore.getRecordById('r1')?.version).toBe(1)
    expect(recordStore.getRecordById('r2')?.version).toBe(1)

    history.redo()
    expect(recordStore.getRecordById('r1')?.fields.status).toBe('done')
    expect(recordStore.getRecordById('r2')?.fields.status).toBe('done')
    expect(recordStore.getRecordById('r1')?.version).toBe(3)
    expect(recordStore.getRecordById('r2')?.version).toBe(4)
  })

  it('pushBatchEdit 空变更不入栈;undo/redo 空栈返回 undefined', () => {
    const { history } = setup([makeRecord('r1')])
    history.pushBatchEdit([])
    expect(history.canUndo.value).toBe(false)
    expect(history.undo()).toBeUndefined()
    expect(history.redo()).toBeUndefined()
  })

  it('创建入栈:undo 将记录移出列表并扣减 total,redo 按位加回', () => {
    const created = makeRecord('r-new', { name: '新记录' }, 1)
    const { recordStore, history } = setup([makeRecord('r1'), makeRecord('r2')])
    recordStore.insertRecordLocal(created, 1) // 模拟刷新后新记录落在中间位置
    history.pushCreate([created])

    const undone = history.undo()
    expect(undone?.type).toBe('create')
    expect(recordStore.getRecordById('r-new')).toBeUndefined()
    expect(recordStore.totalRecords).toBe(2)

    history.redo()
    expect(recordStore.records.map(r => r.id)).toEqual(['r1', 'r-new', 'r2'])
    expect(recordStore.totalRecords).toBe(3)
  })

  it('创建记录不在实例列表时跳过入栈(FK 快速新建指向其他模块无法回放)', () => {
    const { history } = setup([makeRecord('r1')])
    history.pushCreate([makeRecord('other-module-rec')])
    expect(history.canUndo.value).toBe(false)
  })

  it('撤销后产生新动作使 redo 分支失效', () => {
    const { recordStore, history } = setup([makeRecord('r1', { status: 'old' })])
    recordStore.updateRecordField('r1', 'status', 'new', 2)
    history.pushCellEdit(makeChange({}))

    history.undo()
    expect(history.canRedo.value).toBe(true)

    recordStore.updateRecordField('r1', 'status', 'newest', 5)
    history.pushCellEdit(makeChange({ previousValue: 'old', newValue: 'newest', previousVersion: 1, newVersion: 5 }))

    expect(history.canRedo.value).toBe(false)
    expect(history.redo()).toBeUndefined()
    // 撤销回到的是最新动作的起点
    history.undo()
    expect(recordStore.getRecordById('r1')?.fields.status).toBe('old')
  })

  it('undo/redo 回放经 uiState 提示且记录缺失时静默跳过', () => {
    const { recordStore, uiState, history } = setup([makeRecord('r1', { status: 'old' })])
    recordStore.updateRecordField('r1', 'status', 'new', 2)
    history.pushCellEdit(makeChange({}))

    history.undo()
    expect(uiState.globalMessage).toBe('已撤销：字段编辑')
    expect(uiState.globalMessageType).toBe('success')

    // 记录已被移除(如刷新换页)时回放不抛错
    recordStore.setRecords([], 0)
    expect(() => history.redo()).not.toThrow()
  })

  it('批量创建多条:undo 整批移除,redo 按原位整批加回', () => {
    const a = makeRecord('new-a', {}, 1)
    const b = makeRecord('new-b', {}, 1)
    const { recordStore, history } = setup([makeRecord('r1'), makeRecord('r2')])
    recordStore.insertRecordLocal(a, 1)
    recordStore.insertRecordLocal(b, 2)
    history.pushCreate([a, b])

    history.undo()
    expect(recordStore.records.map(r => r.id)).toEqual(['r1', 'r2'])
    expect(recordStore.totalRecords).toBe(2)

    history.redo()
    expect(recordStore.records.map(r => r.id)).toEqual(['r1', 'new-a', 'new-b', 'r2'])
    expect(recordStore.totalRecords).toBe(4)
  })
})
