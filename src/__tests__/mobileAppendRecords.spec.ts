import { describe, it, expect } from 'vitest'
import { createRecordState } from '@/composables/instanceState'
import type { RecordEntity } from '@/types'

function makeRecord(id: string, fields: Record<string, unknown> = {}): RecordEntity {
  return { id, moduleId: 'module-test', fields, version: 1, createdAt: '', updatedAt: '' }
}

describe('触底加载追加原语（移动适配 §3.5）', () => {
  it('appendRecords 接尾追加并更新 total/hasMore', () => {
    const s = createRecordState()
    s.setRecords([makeRecord('1'), makeRecord('2')], 5, true)
    expect(s.records.length).toBe(2)
    expect(s.hasMoreRecords).toBe(true)

    const added = s.appendRecords([makeRecord('3'), makeRecord('4')], 5, true)
    expect(added).toBe(2)
    expect(s.records.map(r => r.id)).toEqual(['1', '2', '3', '4'])
    expect(s.totalRecords).toBe(5)
    expect(s.hasMoreRecords).toBe(true)
  })

  it('按 id 去重：翻页期间后端数据位移造成的重复行不重复追加', () => {
    const s = createRecordState()
    s.setRecords([makeRecord('1'), makeRecord('2')], 4)
    const added = s.appendRecords([makeRecord('2'), makeRecord('3')], 4)
    expect(added).toBe(1)
    expect(s.records.map(r => r.id)).toEqual(['1', '2', '3'])
  })

  it('hasMore 信封缺省时置 null（消费方以 loaded<total 推导兜底）', () => {
    const s = createRecordState()
    s.setRecords([makeRecord('1')], 3)
    expect(s.hasMoreRecords).toBeNull()
    s.setRecords([makeRecord('1')], 3, false)
    expect(s.hasMoreRecords).toBe(false)
  })

  it('$reset 清空 hasMore 标记', () => {
    const s = createRecordState()
    s.setRecords([makeRecord('1')], 2, true)
    s.$reset()
    expect(s.hasMoreRecords).toBeNull()
    expect(s.records.length).toBe(0)
  })

  it('setRecords 整体替换语义不变（筛选/搜索/页签变更路径）', () => {
    const s = createRecordState()
    s.setRecords([makeRecord('1'), makeRecord('2')], 2)
    s.setRecords([makeRecord('9')], 1, false)
    expect(s.records.map(r => r.id)).toEqual(['9'])
    expect(s.totalRecords).toBe(1)
    expect(s.hasMoreRecords).toBe(false)
  })
})
