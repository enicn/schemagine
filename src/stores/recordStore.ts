import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { RecordEntity, DraftRecord, UndoEntry, QueryState, PaginationState, FieldError } from '@/types'

export const useRecordStore = defineStore('record', () => {
  const records = ref<RecordEntity[]>([])
  const currentRecord = ref<RecordEntity | null>(null)
  const draftRows = ref<DraftRecord[]>([])
  const undoStack = ref<UndoEntry[]>([])
  const queryState = ref<QueryState>({
    filters: [],
    sort: null,
    pagination: { page: 1, pageSize: 20, total: 0 },
  })

  const isLoading = ref(false)
  const isSaving = ref(false)
  const saveError = ref<string | null>(null)

  const totalRecords = computed(() => queryState.value.pagination.total)
  const hasRecords = computed(() => records.value.length > 0)
  const hasDrafts = computed(() => draftRows.value.length > 0)
  const currentPage = computed(() => queryState.value.pagination.page)

  function setRecords(newRecords: RecordEntity[], total: number): void {
    records.value = newRecords
    queryState.value.pagination.total = total
  }

  function setCurrentRecord(record: RecordEntity | null): void {
    currentRecord.value = record
  }

  function setQueryState(state: Partial<QueryState>): void {
    queryState.value = { ...queryState.value, ...state }
  }

  function setPagination(pagination: Partial<PaginationState>): void {
    queryState.value.pagination = { ...queryState.value.pagination, ...pagination }
  }

  function getRecordById(id: string): RecordEntity | undefined {
    return records.value.find(r => r.id === id)
  }

  function updateRecordField(recordId: string, field: string, value: unknown, newVersion: number): void {
    const record = records.value.find(r => r.id === recordId)
    if (record) {
      record.fields[field] = value
      record.version = newVersion
    }
    if (currentRecord.value?.id === recordId) {
      currentRecord.value.fields[field] = value
      currentRecord.value.version = newVersion
    }
  }

  function pushUndo(entry: UndoEntry): void {
    undoStack.value.push(entry)
    if (undoStack.value.length > 50) {
      undoStack.value.shift()
    }
  }

  function popUndo(): UndoEntry | undefined {
    return undoStack.value.pop()
  }

  function clearUndo(): void {
    undoStack.value = []
  }

  function setDraftRows(rows: DraftRecord[]): void {
    draftRows.value = rows
  }

  function updateDraftField(index: number, field: string, value: unknown): void {
    if (draftRows.value[index]) {
      draftRows.value[index].fields[field] = value
    }
  }

  function addDraftRow(draft: DraftRecord): number {
    draftRows.value.push(draft)
    return draftRows.value.length - 1
  }

  function removeDraftRow(index: number): void {
    draftRows.value.splice(index, 1)
  }

  function clearDrafts(): void {
    draftRows.value = []
  }

  function setErrorsForDraft(index: number, errors: FieldError[]): void {
    if (draftRows.value[index]) {
      draftRows.value[index].validationErrors = errors
      draftRows.value[index].isValid = errors.length === 0
    }
  }

  function setLoading(state: boolean): void {
    isLoading.value = state
  }

  function setSaving(state: boolean): void {
    isSaving.value = state
  }

  function setSaveError(error: string | null): void {
    saveError.value = error
  }

  function $reset(): void {
    records.value = []
    currentRecord.value = null
    draftRows.value = []
    undoStack.value = []
    queryState.value = { filters: [], sort: null, pagination: { page: 1, pageSize: 20, total: 0 } }
    isLoading.value = false
    isSaving.value = false
    saveError.value = null
  }

  return {
    records,
    currentRecord,
    draftRows,
    undoStack,
    queryState,
    isLoading,
    isSaving,
    saveError,
    totalRecords,
    hasRecords,
    hasDrafts,
    currentPage,
    setRecords,
    setCurrentRecord,
    setQueryState,
    setPagination,
    getRecordById,
    updateRecordField,
    pushUndo,
    popUndo,
    clearUndo,
    setDraftRows,
    updateDraftField,
    addDraftRow,
    removeDraftRow,
    clearDrafts,
    setErrorsForDraft,
    setLoading,
    setSaving,
    setSaveError,
    $reset,
  }
})
