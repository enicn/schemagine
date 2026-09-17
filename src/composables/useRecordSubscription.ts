import { useRecords, useUi, type RecordState, type UiState } from '@/composables/instanceState'
import type { RecordsChangePayload } from '@/types'

/**
 * 实时数据订阅（docs/19 I1）：引擎侧增量合并。
 *
 * 传输（轮询/SSE/WebSocket）由宿主在 `IRecordService.subscribeRecords` 可选成员中
 * 实现，引擎只负责把 `RecordsChangePayload` 合并进实例列表：
 * - upserts：按 id 合并——存在则整体替换（fields/version/updatedAt，静默），
 *   不存在则追加（total 同步 +1）；
 * - deletes：按 id 移除（total 同步 -1）；
 * - 正在行内编辑的行跳过合并并提示冲突——编辑会话基于旧数据引用，合并会掀掉
 *   编辑中的数据；编辑结束（保存走乐观锁 / 取消）后由宿主的下一次推送自然补齐。
 */
export function useRecordSubscription(
  recordStoreParam?: RecordState,
  uiStateParam?: UiState,
) {
  const recordStore = recordStoreParam ?? useRecords()
  const uiState = uiStateParam ?? useUi()

  function mergeRemoteChange(change: RecordsChangePayload): void {
    const editingRowId = uiState.editingCell?.rowId
    let editingConflict = false

    for (const record of change.upserts ?? []) {
      if (record.id === editingRowId) {
        editingConflict = true
        continue
      }
      recordStore.mergeRemoteRecord(record)
    }
    for (const id of change.deletes ?? []) {
      if (id === editingRowId) {
        editingConflict = true
        continue
      }
      recordStore.removeRecordLocal(id)
    }

    if (editingConflict) {
      uiState.showMessage('检测到其他用户修改了正在编辑的行，已保留当前编辑内容', 'warning')
    }
  }

  return { mergeRemoteChange }
}
