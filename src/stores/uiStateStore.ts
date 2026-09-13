import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { DialogType } from '@/types'
import type { ViewMode } from '@/constants'

export const useUiStateStore = defineStore('uiState', () => {
  const viewMode = ref<ViewMode>('list')
  const editingCell = ref<{ rowId: string; field: string } | null>(null)
  const selectedRowIds = ref<string[]>([])
  const globalMessage = ref<string | null>(null)
  const globalMessageType = ref<'info' | 'warning' | 'error' | 'success'>('info')

  const dialogState = ref<{
    visible: boolean
    type: DialogType | null
    payload: Record<string, unknown> | null
  }>({
    visible: false,
    type: null,
    payload: null,
  })

  const isLoading = ref(false)

  const isEditing = computed(() => editingCell.value !== null)
  const dialogVisible = computed(() => dialogState.value.visible)
  const dialogType = computed(() => dialogState.value.type)

  function setViewMode(mode: ViewMode): void {
    viewMode.value = mode
  }

  function setEditingCell(cell: { rowId: string; field: string } | null): void {
    editingCell.value = cell
  }

  function setSelectedRows(ids: string[]): void {
    selectedRowIds.value = ids
  }

  function toggleRowSelection(id: string): void {
    const index = selectedRowIds.value.indexOf(id)
    if (index >= 0) {
      selectedRowIds.value.splice(index, 1)
    } else {
      selectedRowIds.value.push(id)
    }
  }

  function clearSelection(): void {
    selectedRowIds.value = []
  }

  function openDialog(type: DialogType, payload: Record<string, unknown> = {}): void {
    dialogState.value = { visible: true, type, payload }
  }

  function closeDialog(): void {
    dialogState.value = { visible: false, type: null, payload: null }
  }

  function showMessage(message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info'): void {
    globalMessage.value = message
    globalMessageType.value = type
  }

  function clearMessage(): void {
    globalMessage.value = null
    globalMessageType.value = 'info'
  }

  function setLoading(state: boolean): void {
    isLoading.value = state
  }

  function $reset(): void {
    viewMode.value = 'list'
    editingCell.value = null
    selectedRowIds.value = []
    globalMessage.value = null
    globalMessageType.value = 'info'
    dialogState.value = { visible: false, type: null, payload: null }
    isLoading.value = false
  }

  return {
    viewMode,
    editingCell,
    selectedRowIds,
    globalMessage,
    globalMessageType,
    dialogState,
    isLoading,
    isEditing,
    dialogVisible,
    dialogType,
    setViewMode,
    setEditingCell,
    setSelectedRows,
    toggleRowSelection,
    clearSelection,
    openDialog,
    closeDialog,
    showMessage,
    clearMessage,
    setLoading,
    $reset,
  }
})
