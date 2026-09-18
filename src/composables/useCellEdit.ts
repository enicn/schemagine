import { useRecords, useSchemaMeta, useUi, type RecordState, type SchemaMetaState, type UiState } from '@/composables/instanceState'
import { useRecordHistory } from '@/composables/useRecordHistory'
import { recordService } from '@/services/api/recordService'
import type { CellEditPayload } from '@/types'

export function useCellEdit(
  recordStoreParam?: RecordState,
  schemaMetaParam?: SchemaMetaState,
  uiStateParam?: UiState,
) {
  const recordStore = recordStoreParam ?? useRecords()
  const schemaMeta = schemaMetaParam ?? useSchemaMeta()
  const uiState = uiStateParam ?? useUi()
  const history = useRecordHistory(recordStore, uiState)

  async function onCellEdit(payload: CellEditPayload): Promise<boolean> {
    const { rowId, field, value, oldValue } = payload

    const record = recordStore.getRecordById(rowId)
    if (!record) return false

    const schemaField = schemaMeta.getField(field)
    if (!schemaField) return false

    const isFormulaField = schemaField.type === 'formula'
    if (isFormulaField) return false

    uiState.setEditingCell({ rowId, field })
    // 入栈基线版本：版本冲突刷新后以服务端当前版本重试，历史快照须与成功那次请求一致
    let baseVersion = record.version
    try {
      const moduleId = schemaMeta.schema!.id

      let res = await recordService.patchField({
        moduleId,
        recordId: rowId,
        field,
        value,
        expectedVersion: baseVersion,
      })

      if (!res.success && res.errorCode === 'VERSION_CONFLICT') {
        const detailRes = await recordService.getDetail(moduleId, rowId)
        if (detailRes.success) {
          const refreshed = detailRes.data
          recordStore.updateRecordField(
            rowId,
            field,
            refreshed.fields[field] ?? null,
            refreshed.version,
          )
          const updatedRecord = recordStore.getRecordById(rowId)
          if (updatedRecord) {
            baseVersion = updatedRecord.version
            res = await recordService.patchField({
              moduleId,
              recordId: rowId,
              field,
              value,
              expectedVersion: baseVersion,
            })
          }
        }
      }

      // docs/19 H3:服务端确认成功后才入栈(带服务端返回的新版本),失败不留幻影条目
      if (res.success) {
        recordStore.updateRecordField(rowId, field, value, res.data.version)
        history.pushCellEdit({
          recordId: rowId,
          field,
          previousValue: oldValue,
          newValue: value,
          previousVersion: baseVersion,
          newVersion: res.data.version,
        })
        return true
      }
      handleSaveError(res)
      return false
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败'
      uiState.showMessage(message, 'error')
      return false
    } finally {
      uiState.setEditingCell(null)
    }
  }

  function handleSaveError(res: { errorCode?: string; message?: string }): void {
    const code = res.errorCode
    if (code === 'VERSION_CONFLICT') {
      uiState.openDialog('version-conflict', { message: res.message })
    } else {
      uiState.showMessage(res.message || '保存失败', 'error')
    }
  }

  return {
    onCellEdit,
  }
}
