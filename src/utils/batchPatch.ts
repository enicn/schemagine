import type { FieldChangeSnapshot } from '@/types'

/**
 * 批量字段更新的引擎侧执行器(docs/19 H4 批量事务语义)。
 *
 * 两阶段:先逐条提交(乐观锁),任一失败即进入补偿阶段——把已成功行回写到原值
 * (仍走 patchField,expectedVersion 取提交成功返回的版本),尽力达成"整体生效或
 * 整体不生效"。宿主经 batch-patch 契约执行时原子性由宿主后端保证;本执行器服务
 * 于缺省的引擎本地路径(mock/本地数据源场景)。
 *
 * 纯注入设计(记录读取/提交均为入参),不依赖 Vue 与具体服务,可独立单测。
 */

/** 单行提交成功的快照(回滚与本地应用都需要) */
export interface BatchPatchAppliedRow {
  recordId: string
  previousValue: unknown
  previousVersion: number
  newVersion: number
}

/** executeBatchPatch 的结果集 */
export interface BatchPatchOutcome {
  /** 提交成功的行(含后续被回滚的;是否仍生效看 rolledBack/revertFailed) */
  succeeded: BatchPatchAppliedRow[]
  /** 提交失败的记录 id */
  failed: string[]
  /** 值未变化被跳过的行数 */
  skipped: number
  /** 勾选但不在当前页数据中的行数(拿不到乐观锁版本) */
  notLoaded: number
  /** 是否触发了整体回滚(存在提交失败且已有成功行时) */
  rolledBack: boolean
  /** 回滚成功的记录 id(本地状态保持原值即可) */
  reverted: string[]
  /** 回滚失败的记录 id(服务端仍为新值,需本地同步新值并入撤销栈) */
  revertFailed: string[]
}

/** 提交/回滚共用的 patchField 最小接口(对齐 IRecordService.patchField 返回) */
export type BatchPatchPatchField = (params: {
  recordId: string
  field: string
  value: unknown
  expectedVersion: number
}) => Promise<{ success: boolean; data?: { version: number } }>

export interface BatchPatchOptions {
  ids: string[]
  field: string
  value: unknown
  /** 读取记录当前字段值与乐观锁版本;返回 undefined 表示行不在当前数据中 */
  getRecord: (recordId: string) => { fields: Record<string, unknown>; version: number } | undefined
  patchField: BatchPatchPatchField
}

/**
 * 执行批量字段更新:逐条提交,存在失败时对已成功行做补偿回写。
 * 只负责服务端调用与结果归集,本地状态(recordStore)与撤销栈由调用方按结果集应用。
 */
export async function executeBatchPatch(options: BatchPatchOptions): Promise<BatchPatchOutcome> {
  const { ids, field, value, getRecord, patchField } = options

  const succeeded: BatchPatchAppliedRow[] = []
  const failed: string[] = []
  let skipped = 0
  let notLoaded = 0

  for (const recordId of ids) {
    const record = getRecord(recordId)
    if (!record) {
      notLoaded++
      continue
    }
    const previousValue = record.fields[field]
    const previousVersion = record.version
    if (previousValue === value) {
      skipped++
      continue
    }
    const res = await patchField({ recordId, field, value, expectedVersion: previousVersion })
    if (res.success && res.data) {
      succeeded.push({ recordId, previousValue, previousVersion, newVersion: res.data.version })
    } else {
      failed.push(recordId)
    }
  }

  const outcome: BatchPatchOutcome = {
    succeeded,
    failed,
    skipped,
    notLoaded,
    rolledBack: false,
    reverted: [],
    revertFailed: [],
  }

  if (failed.length === 0 || succeeded.length === 0) return outcome

  // 补偿阶段:把已成功行回写原值(expectedVersion = 提交成功返回的版本)
  outcome.rolledBack = true
  for (const row of succeeded) {
    const revert = await patchField({
      recordId: row.recordId,
      field,
      value: row.previousValue,
      expectedVersion: row.newVersion,
    })
    if (revert.success) {
      outcome.reverted.push(row.recordId)
    } else {
      outcome.revertFailed.push(row.recordId)
    }
  }
  return outcome
}

/** 按结果集生成撤销栈变更集:未被回滚(或回滚失败仍生效)的行 */
export function survivingChanges(field: string, value: unknown, outcome: BatchPatchOutcome): FieldChangeSnapshot[] {
  if (!outcome.rolledBack) {
    return outcome.succeeded.map(row => ({
      recordId: row.recordId,
      field,
      previousValue: row.previousValue,
      newValue: value,
      previousVersion: row.previousVersion,
      newVersion: row.newVersion,
    }))
  }
  return outcome.succeeded
    .filter(row => outcome.revertFailed.includes(row.recordId))
    .map(row => ({
      recordId: row.recordId,
      field,
      previousValue: row.previousValue,
      newValue: value,
      previousVersion: row.previousVersion,
      newVersion: row.newVersion,
    }))
}
