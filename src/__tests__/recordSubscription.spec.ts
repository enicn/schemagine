import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRecordState, createUiState } from '@/composables/instanceState'
import { useRecordSubscription } from '@/composables/useRecordSubscription'
import { createMockRecordSubscription } from '@/services/mock/mockAdapter'
import { writeStorage, readStorage } from '@/services/mock/mockStorage'
import type { RecordEntity } from '@/types'

function makeRecord(id: string, fields: Record<string, unknown> = {}, version = 1): RecordEntity {
  return { id, moduleId: 'module-test', fields, version, createdAt: '', updatedAt: `2026-01-0${version}` }
}

function setup(rows: RecordEntity[] = []) {
  const recordStore = createRecordState()
  const uiState = createUiState()
  recordStore.setRecords(rows, rows.length)
  const { mergeRemoteChange } = useRecordSubscription(recordStore, uiState)
  return { recordStore, uiState, mergeRemoteChange }
}

describe('RecordState.mergeRemoteRecord(docs/19 I1)', () => {
  it('存在的行整体替换 fields/version/updatedAt 并同步 currentRecord', () => {
    const s = createRecordState()
    const rec = makeRecord('r1', { status: 'old' }, 1)
    s.setRecords([rec], 1)
    s.setCurrentRecord(rec)

    const result = s.mergeRemoteRecord(makeRecord('r1', { status: 'new' }, 5))
    expect(result).toBe('updated')
    expect(s.getRecordById('r1')?.fields.status).toBe('new')
    expect(s.getRecordById('r1')?.version).toBe(5)
    expect(s.currentRecord?.fields.status).toBe('new')
    expect(s.currentRecord?.version).toBe(5)
    expect(s.totalRecords).toBe(1)
  })

  it('不存在的行追加并递增 total', () => {
    const s = createRecordState()
    s.setRecords([makeRecord('r1')], 1)
    const result = s.mergeRemoteRecord(makeRecord('r2', { name: 'x' }, 1))
    expect(result).toBe('added')
    expect(s.records.map(r => r.id)).toEqual(['r1', 'r2'])
    expect(s.totalRecords).toBe(2)
  })
})

describe('useRecordSubscription 增量合并(docs/19 I1)', () => {
  it('upserts 合并 + deletes 移除', () => {
    const { recordStore, mergeRemoteChange } = setup([makeRecord('r1', { a: 1 }), makeRecord('r2')])

    mergeRemoteChange({
      moduleId: 'module-test',
      upserts: [makeRecord('r1', { a: 2 }, 3), makeRecord('r3')],
      deletes: ['r2'],
    })

    expect(recordStore.getRecordById('r1')?.fields.a).toBe(2)
    expect(recordStore.getRecordById('r1')?.version).toBe(3)
    expect(recordStore.getRecordById('r2')).toBeUndefined()
    expect(recordStore.getRecordById('r3')).toBeDefined()
    expect(recordStore.totalRecords).toBe(2)
  })

  it('正在编辑的行跳过合并并提示冲突', () => {
    const { recordStore, uiState, mergeRemoteChange } = setup([makeRecord('r1', { a: 1 }), makeRecord('r2', { a: 1 })])
    uiState.setEditingCell({ rowId: 'r1', field: 'a' })

    mergeRemoteChange({
      moduleId: 'module-test',
      upserts: [makeRecord('r1', { a: 999 }, 7), makeRecord('r2', { a: 2 }, 2)],
      deletes: ['r1'],
    })

    // 编辑中的行保持原值,另一行正常合并
    expect(recordStore.getRecordById('r1')?.fields.a).toBe(1)
    expect(recordStore.getRecordById('r1')?.version).toBe(1)
    expect(recordStore.getRecordById('r2')?.fields.a).toBe(2)
    expect(uiState.globalMessage).toContain('正在编辑的行')
    expect(uiState.globalMessageType).toBe('warning')
  })

  it('无冲突的推送静默合并(不产生消息)', () => {
    const { uiState, mergeRemoteChange } = setup([makeRecord('r1')])
    mergeRemoteChange({ moduleId: 'module-test', upserts: [makeRecord('r1', { a: 9 }, 2)] })
    expect(uiState.globalMessage).toBeNull()
  })

  it('空载荷安全处理', () => {
    const { mergeRemoteChange } = setup([makeRecord('r1')])
    expect(() => mergeRemoteChange({ moduleId: 'module-test' })).not.toThrow()
  })
})

describe('createMockRecordSubscription 轮询示例(docs/19 I1)', () => {
  const MODULE_ID = 'module-sub-test'
  // 与 mockAdapter.getRecordsKey 同前缀(mock 存储键无 schemagine: 应用前缀)
  const KEY = `records:${MODULE_ID}`

  beforeEach(() => {
    vi.useFakeTimers()
    writeStorage(KEY, [makeRecord('r1', { n: 1 }), makeRecord('r2', { n: 1 })])
  })

  afterEach(() => {
    vi.useRealTimers()
    writeStorage(KEY, [])
  })

  function readSnapshot(): RecordEntity[] {
    return readStorage<RecordEntity[]>(KEY, [])
  }

  it('存储变化后按间隔 diff 推送 upserts/deletes,退订后停止', () => {
    const sub = createMockRecordSubscription({ intervalMs: 1000 })
    const received: { upserts?: string[]; deletes?: string[] } = {}
    const unsubscribe = sub.subscribeRecords(MODULE_ID, (change) => {
      received.upserts = (change.upserts ?? []).map(r => r.id)
      received.deletes = change.deletes ?? []
    })

    // 无变化不推送
    vi.advanceTimersByTime(2500)
    expect(received.upserts).toBeUndefined()

    // 更新一行 + 删除一行 + 新增一行 → 一次 diff 推送
    writeStorage(KEY, [
      makeRecord('r1', { n: 2 }, 2),
      makeRecord('r3', { n: 1 }),
    ])
    vi.advanceTimersByTime(1500)
    expect(received.upserts?.sort()).toEqual(['r1', 'r3'])
    expect(received.deletes).toEqual(['r2'])

    // 退订后不再推送
    unsubscribe()
    writeStorage(KEY, [makeRecord('r9')])
    vi.advanceTimersByTime(3000)
    expect(received.upserts).toEqual(['r1', 'r3'])
  })

  it('diff 只含变化的行(未变化行不进 upserts)', () => {
    const sub = createMockRecordSubscription({ intervalMs: 1000 })
    const upserts: string[][] = []
    const unsubscribe = sub.subscribeRecords(MODULE_ID, (change) => {
      upserts.push((change.upserts ?? []).map(r => r.id))
    })
    vi.advanceTimersByTime(1500)
    expect(readSnapshot().length).toBe(2)

    writeStorage(KEY, [makeRecord('r1', { n: 1 }), makeRecord('r2', { n: 2 }, 2)])
    vi.advanceTimersByTime(1500)
    expect(upserts[0]).toEqual(['r2'])
    unsubscribe()
  })
})
