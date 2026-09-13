import { useRecords, useSchemaMeta, useUi, type RecordState, type SchemaMetaState, type UiState } from '@/composables/instanceState'
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

  async function onCellEdit(payload: CellEditPayload): Promise<void> {
    const { rowId, field, value, oldValue } = payload

    recordStore.pushUndo({
      type: 'cell',
      recordId: rowId,
      field,
      previousValue: oldValue,
      timestamp: Date.now(),
    })

    const record = recordStore.getRecordById(rowId)
    if (!record) return

    const schemaField = schemaMeta.getField(field)
    if (!schemaField) return

    const isFormulaField = schemaField.type === 'formula'
    if (isFormulaField) return

    uiState.setEditingCell({ rowId, field })
    try {
      const moduleId = schemaMeta.schema!.id

      let res = await recordService.patchField({
        moduleId,
        recordId: rowId,
        field,
        value,
        expectedVersion: record.version,
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
            res = await recordService.patchField({
              moduleId,
              recordId: rowId,
              field,
              value,
              expectedVersion: updatedRecord.version,
            })
          }
        }
      }

      if (res.success) {
        recordStore.updateRecordField(rowId, field, value, res.data.version)
      } else {
        handleSaveError(res)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败'
      uiState.showMessage(message, 'error')
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

  function undo(): void {
    const entry = recordStore.popUndo()
    if (!entry) return

    if (entry.type === 'cell' && entry.field) {
      const record = recordStore.getRecordById(entry.recordId)
      if (record) {
        record.fields[entry.field] = entry.previousValue
      }
    }
  }

  return {
    onCellEdit,
    undo,
  }
}
