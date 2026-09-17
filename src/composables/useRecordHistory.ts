import { computed } from 'vue'
import { useRecords, useUi, type RecordState, type UiState } from '@/composables/instanceState'
import type { FieldChangeSnapshot, HistoryEntry, RecordEntity } from '@/types'

/**
 * 引擎级记录历史（docs/19 H3）：undo 栈自 useCellEdit 上提的实例级 history API。
 * 入栈粒度 = 一个用户动作（单格编辑 / 整批编辑 / 一次创建），redo 在新动作入栈时失效。
 *
 * 回放是本地内存操作：字段变更回填值与乐观锁版本；'create' 撤销仅把记录移出实例
 * 列表（引擎无 delete 服务，刷新后以服务端数据为准）。创建动作只定位得到实例列表
 * 内的记录才会入栈——FK 快速新建指向其他模块时记录不在本实例列表，入栈也无法回放。
 */
export function useRecordHistory(
  recordStoreParam?: RecordState,
  uiStateParam?: UiState,
) {
  const recordStore = recordStoreParam ?? useRecords()
  const uiState = uiStateParam ?? useUi()

  /** 行内/卡片单格编辑入栈：服务端确认成功后调用（版本取服务端响应，失败不留幻影条目） */
  function pushCellEdit(change: FieldChangeSnapshot): void {
    recordStore.pushHistory({
      type: 'cell-edit',
      changes: [change],
      createdRecords: [],
      timestamp: Date.now(),
    })
  }

  /** 批量编辑入栈：整批一个条目，撤销/重做按动作粒度整批回放 */
  function pushBatchEdit(changes: FieldChangeSnapshot[]): void {
    if (changes.length === 0) return
    recordStore.pushHistory({
      type: 'batch-edit',
      changes,
      createdRecords: [],
      timestamp: Date.now(),
    })
  }

  /** 创建入栈：记录须能在实例列表定位（给 redo 按位加回用），否则跳过不入栈 */
  function pushCreate(created: RecordEntity[]): void {
    if (created.length === 0) return
    const located = created
      .map(record => ({
        record,
        index: recordStore.records.findIndex(r => r.id === record.id),
      }))
      .filter(item => item.index >= 0)
    if (located.length === 0) return
    recordStore.pushHistory({
      type: 'create',
      changes: [],
      createdRecords: located,
      timestamp: Date.now(),
    })
  }

  /** 撤销一个动作：本地回放逆向变更并转入 redo 栈，返回被撤销条目（栈空返回 undefined） */
  function undo(): HistoryEntry | undefined {
    const entry = recordStore.popUndo()
    if (!entry) return undefined
    replay(entry, 'undo')
    recordStore.pushRedo(entry)
    return entry
  }

  /** 重做一个动作：本地重放正向变更并转回 undo 栈，返回被重放条目（栈空返回 undefined） */
  function redo(): HistoryEntry | undefined {
    const entry = recordStore.popRedo()
    if (!entry) return undefined
    replay(entry, 'redo')
    recordStore.pushUndo(entry)
    return entry
  }

  function replay(entry: HistoryEntry, direction: 'undo' | 'redo'): void {
    for (const change of entry.changes) {
      if (!recordStore.getRecordById(change.recordId)) continue
      if (direction === 'undo') {
        recordStore.updateRecordField(change.recordId, change.field, change.previousValue, change.previousVersion)
      } else {
        recordStore.updateRecordField(change.recordId, change.field, change.newValue, change.newVersion)
      }
    }
    for (const created of entry.createdRecords) {
      if (direction === 'undo') {
        recordStore.removeRecordLocal(created.record.id)
      } else if (!recordStore.getRecordById(created.record.id)) {
        recordStore.insertRecordLocal(created.record, created.index)
      }
    }
    uiState.showMessage(describeEntry(entry, direction === 'undo' ? '已撤销：' : '已重做：'), 'success')
  }

  function describeEntry(entry: HistoryEntry, prefix: string): string {
    if (entry.type === 'create') {
      return `${prefix}创建 ${entry.createdRecords.length} 条记录`
    }
    const rows = new Set(entry.changes.map(c => c.recordId)).size
    return entry.type === 'batch-edit' ? `${prefix}批量编辑 ${rows} 条记录` : `${prefix}字段编辑`
  }

  return {
    pushCellEdit,
    pushBatchEdit,
    pushCreate,
    undo,
    redo,
    canUndo: computed(() => recordStore.canUndo),
    canRedo: computed(() => recordStore.canRedo),
  }
}
