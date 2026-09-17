import { describe, it, expect } from 'vitest'
import { executeBatchPatch, survivingChanges } from '@/utils/batchPatch'
import { resolveDataOperations } from '@/utils/dataOperations'
import type { BatchPatchEvent } from '@/types'
import type { ModuleSchema, ModulePermissions } from '@/types'

/** 假 patchField:按 recordId 固定失败,其余成功并返回 version+1;补偿阶段(revertFailIds)可固定失败 */
function makePatchField(failIds: string[] = [], revertFailIds: string[] = []) {
  const appliedVersions = new Map<string, number>()
  const patchField = async (params: { recordId: string; value: unknown; expectedVersion: number }) => {
    if (!appliedVersions.has(params.recordId)) {
      // 首次提交
      if (failIds.includes(params.recordId)) {
        return { success: false as const }
      }
      appliedVersions.set(params.recordId, params.expectedVersion + 1)
      return { success: true as const, data: { version: params.expectedVersion + 1 } }
    }
    // 补偿回写:expectedVersion 必须是提交成功返回的版本
    if (revertFailIds.includes(params.recordId)) {
      return { success: false as const }
    }
    return { success: true as const, data: { version: params.expectedVersion + 1 } }
  }
  return { patchField }
}

function makeGetRecord(rows: Array<{ id: string; status: unknown; version: number }>) {
  const map = new Map(rows.map(r => [r.id, { fields: { status: r.status }, version: r.version }]))
  return (id: string) => map.get(id)
}

describe('executeBatchPatch(docs/19 H4 批量事务语义)', () => {
  it('全部成功:逐条以当前版本提交,结果集含值与版本双快照', async () => {
    const { patchField } = makePatchField()
    const outcome = await executeBatchPatch({
      ids: ['r1', 'r2'],
      field: 'status',
      value: 'done',
      getRecord: makeGetRecord([
        { id: 'r1', status: 'pending', version: 3 },
        { id: 'r2', status: 'pending', version: 5 },
      ]),
      patchField,
    })
    expect(outcome.rolledBack).toBe(false)
    expect(outcome.failed).toEqual([])
    expect(outcome.succeeded).toEqual([
      { recordId: 'r1', previousValue: 'pending', previousVersion: 3, newVersion: 4 },
      { recordId: 'r2', previousValue: 'pending', previousVersion: 5, newVersion: 6 },
    ])
  })

  it('未变化行跳过、不在当前页的勾选行计入 notLoaded', async () => {
    const { patchField } = makePatchField()
    const outcome = await executeBatchPatch({
      ids: ['r1', 'r2', 'r3'],
      field: 'status',
      value: 'done',
      getRecord: makeGetRecord([
        { id: 'r1', status: 'done', version: 1 },
        { id: 'r2', status: 'pending', version: 1 },
      ]),
      patchField,
    })
    expect(outcome.skipped).toBe(1)
    expect(outcome.notLoaded).toBe(1)
    expect(outcome.succeeded.map(r => r.recordId)).toEqual(['r2'])
    expect(outcome.rolledBack).toBe(false)
  })

  it('存在失败行时触发补偿回写:回写用提交成功返回的版本作 expectedVersion、写回原值', async () => {
    const revertCalls: Array<{ value: unknown; expectedVersion: number }> = []
    const appliedVersions = new Map<string, number>()
    const patchField = async (params: { recordId: string; value: unknown; expectedVersion: number }) => {
      if (params.recordId === 'r-bad') return { success: false as const }
      if (!appliedVersions.has(params.recordId)) {
        appliedVersions.set(params.recordId, params.expectedVersion + 1)
        return { success: true as const, data: { version: params.expectedVersion + 1 } }
      }
      revertCalls.push({ value: params.value, expectedVersion: params.expectedVersion })
      return { success: true as const, data: { version: params.expectedVersion + 1 } }
    }

    const outcome = await executeBatchPatch({
      ids: ['r1', 'r-bad', 'r2'],
      field: 'status',
      value: 'done',
      getRecord: makeGetRecord([
        { id: 'r1', status: 'pending', version: 1 },
        { id: 'r-bad', status: 'pending', version: 1 },
        { id: 'r2', status: 'other', version: 2 },
      ]),
      patchField,
    })

    expect(outcome.rolledBack).toBe(true)
    expect(outcome.failed).toEqual(['r-bad'])
    expect(outcome.reverted).toEqual(['r1', 'r2'])
    expect(outcome.revertFailed).toEqual([])
    expect(revertCalls).toEqual([
      { value: 'pending', expectedVersion: 2 },
      { value: 'other', expectedVersion: 3 },
    ])
  })

  it('回写也失败时记入 revertFailed,该行仍为新值(survivingChanges 含它)', async () => {
    const { patchField } = makePatchField(['r-bad'], ['r1'])
    const outcome = await executeBatchPatch({
      ids: ['r1', 'r2', 'r-bad'],
      field: 'status',
      value: 'done',
      getRecord: makeGetRecord([
        { id: 'r1', status: 'pending', version: 1 },
        { id: 'r2', status: 'pending', version: 1 },
        { id: 'r-bad', status: 'pending', version: 1 },
      ]),
      patchField,
    })
    expect(outcome.rolledBack).toBe(true)
    expect(outcome.failed).toEqual(['r-bad'])
    expect(outcome.reverted).toEqual(['r2'])
    expect(outcome.revertFailed).toEqual(['r1'])
  })

  it('全部失败(无成功行)不触发回写', async () => {
    const { patchField } = makePatchField(['r1', 'r2'])
    const outcome = await executeBatchPatch({
      ids: ['r1', 'r2'],
      field: 'status',
      value: 'done',
      getRecord: makeGetRecord([
        { id: 'r1', status: 'a', version: 1 },
        { id: 'r2', status: 'b', version: 1 },
      ]),
      patchField,
    })
    expect(outcome.rolledBack).toBe(false)
    expect(outcome.succeeded).toEqual([])
    expect(outcome.failed).toEqual(['r1', 'r2'])
  })
})

describe('survivingChanges(撤销栈变更集口径)', () => {
  const value = 'done'

  it('未回滚:全部成功行进入变更集', async () => {
    const { patchField } = makePatchField()
    const outcome = await executeBatchPatch({
      ids: ['r1', 'r2'],
      field: 'status',
      value,
      getRecord: makeGetRecord([
        { id: 'r1', status: 'a', version: 1 },
        { id: 'r2', status: 'b', version: 4 },
      ]),
      patchField,
    })
    const changes = survivingChanges('status', value, outcome)
    expect(changes).toHaveLength(2)
    expect(changes[0]).toEqual({
      recordId: 'r1', field: 'status', previousValue: 'a', newValue: 'done', previousVersion: 1, newVersion: 2,
    })
  })

  it('已回滚:仅回滚失败(仍为新值)的行进入变更集', async () => {
    const { patchField } = makePatchField(['r-bad'], ['r1'])
    const outcome = await executeBatchPatch({
      ids: ['r1', 'r2', 'r-bad'],
      field: 'status',
      value,
      getRecord: makeGetRecord([
        { id: 'r1', status: 'a', version: 1 },
        { id: 'r2', status: 'b', version: 1 },
        { id: 'r-bad', status: 'c', version: 1 },
      ]),
      patchField,
    })
    expect(outcome.rolledBack).toBe(true)
    const changes = survivingChanges('status', value, outcome)
    expect(changes.map(c => c.recordId)).toEqual(['r1'])
  })
})

describe('批量更新契约(docs/19 H4)', () => {
  it('BatchPatchEvent 负载:moduleId + ids + patch(单字段补丁)', () => {
    const payload: BatchPatchEvent = {
      moduleId: 'module-voucher',
      ids: ['rec-v-001', 'rec-v-002'],
      patch: { status: 'approved' },
    }
    expect(Object.keys(payload).sort()).toEqual(['ids', 'moduleId', 'patch'])
    expect(payload.ids).toHaveLength(2)
    expect(Object.keys(payload.patch)).toEqual(['status'])
  })

  it('resolveDataOperations.batchPatchDelegated 由 operations.batchPatch.enabled 门控', () => {
    const permissions: ModulePermissions = { view: true, create: true, edit: true, delete: true, export: true, configure: true }
    const base = { fields: [], permissions, defaultViewMode: 'list' as const }
    const schema = (operations: ModuleSchema['operations']): ModuleSchema =>
      ({ id: 'm', name: 'm', version: '1', moduleType: 'list', status: 'active', ...base, ...(operations ? { operations } : {}) }) as ModuleSchema

    expect(resolveDataOperations(schema({ batchPatch: { enabled: true } }), permissions).batchPatchDelegated).toBe(true)
    expect(resolveDataOperations(schema({ batchPatch: { enabled: false } }), permissions).batchPatchDelegated).toBe(false)
    expect(resolveDataOperations(schema(undefined), permissions).batchPatchDelegated).toBe(false)
    expect(resolveDataOperations(null, null).batchPatchDelegated).toBe(false)
  })
})
