import { ref, computed, reactive, inject, type InjectionKey, type Ref, type ComputedRef } from 'vue'
import type { ModuleSchema, UserViewConfig, ModulePermissions, FieldSchema, FieldPermission, RecordEntity, DraftRecord, HistoryEntry, QueryState, PaginationState, FieldError, ExtendedDialogType } from '@/types'
import type { ViewMode } from '@/constants'

// ============================================================
// SchemaMetaState
// ============================================================

export interface SchemaMetaState {
  schema: Ref<ModuleSchema | null>['value']
  viewConfig: Ref<UserViewConfig | null>['value']
  permissions: Ref<ModulePermissions | null>['value']
  isLoading: Ref<boolean>['value']
  loadError: Ref<string | null>['value']
  isLoaded: ComputedRef<boolean>['value']
  visibleFields: ComputedRef<FieldSchema[]>['value']
  fieldMap: ComputedRef<Map<string, FieldSchema>>['value']
  getField: (key: string) => FieldSchema | undefined
  getFieldPermission: (key: string) => FieldPermission | undefined
  setSchema: (newSchema: ModuleSchema) => void
  setViewConfig: (config: UserViewConfig) => void
  setPermissions: (p: ModulePermissions) => void
  setLoading: (state: boolean) => void
  setError: (error: string | null) => void
  $reset: () => void
}

export function createSchemaMetaState() {
  const schema = ref<ModuleSchema | null>(null)
  const viewConfig = ref<UserViewConfig | null>(null)
  const permissions = ref<ModulePermissions | null>(null)
  const isLoading = ref(false)
  const loadError = ref<string | null>(null)

  const isLoaded = computed(() => schema.value !== null)

  const visibleFields = computed<FieldSchema[]>(() => {
    if (!schema.value) return []
    return schema.value.fields
      .filter(f => {
        if (!f.visible) return false
        if (f.permission && !f.permission.visible) return false
        return true
      })
      .sort((a, b) => a.order - b.order)
  })

  const fieldMap = computed<Map<string, FieldSchema>>(() => {
    const map = new Map<string, FieldSchema>()
    if (!schema.value) return map
    schema.value.fields.forEach(f => map.set(f.key, f))
    return map
  })

  function getField(key: string): FieldSchema | undefined {
    return fieldMap.value.get(key)
  }

  function getFieldPermission(key: string): FieldPermission | undefined {
    const field = getField(key)
    return field?.permission
  }

  function setSchema(newSchema: ModuleSchema): void {
    schema.value = newSchema
    loadError.value = null
  }

  function setViewConfig(config: UserViewConfig): void {
    viewConfig.value = config
  }

  function setPermissions(p: ModulePermissions): void {
    permissions.value = p
  }

  function setLoading(state: boolean): void {
    isLoading.value = state
  }

  function setError(error: string | null): void {
    loadError.value = error
  }

  function $reset(): void {
    schema.value = null
    viewConfig.value = null
    permissions.value = null
    isLoading.value = false
    loadError.value = null
  }

  return reactive({
    schema,
    viewConfig,
    permissions,
    isLoading,
    loadError,
    isLoaded,
    visibleFields,
    fieldMap,
    getField,
    getFieldPermission,
    setSchema,
    setViewConfig,
    setPermissions,
    setLoading,
    setError,
    $reset,
  })
}

// ============================================================
// RecordState
// ============================================================

export interface RecordState {
  records: Ref<RecordEntity[]>['value']
  currentRecord: Ref<RecordEntity | null>['value']
  draftRows: Ref<DraftRecord[]>['value']
  /** 引擎级历史双栈（docs/19 H3）：undoStack 存用户动作，redoStack 存被撤销动作 */
  undoStack: Ref<HistoryEntry[]>['value']
  redoStack: Ref<HistoryEntry[]>['value']
  canUndo: ComputedRef<boolean>['value']
  canRedo: ComputedRef<boolean>['value']
  queryState: Ref<QueryState>['value']
  isLoading: Ref<boolean>['value']
  isSaving: Ref<boolean>['value']
  saveError: Ref<string | null>['value']
  totalRecords: ComputedRef<number>['value']
  hasRecords: ComputedRef<boolean>['value']
  hasDrafts: ComputedRef<boolean>['value']
  currentPage: ComputedRef<number>['value']
  setRecords: (newRecords: RecordEntity[], total: number) => void
  setCurrentRecord: (record: RecordEntity | null) => void
  setQueryState: (state: Partial<QueryState>) => void
  setPagination: (pagination: Partial<PaginationState>) => void
  getRecordById: (id: string) => RecordEntity | undefined
  updateRecordField: (recordId: string, field: string, value: unknown, newVersion: number) => void
  removeRecordLocal: (recordId: string) => number
  insertRecordLocal: (record: RecordEntity, index: number) => void
  pushHistory: (entry: HistoryEntry) => void
  popUndo: () => HistoryEntry | undefined
  pushUndo: (entry: HistoryEntry) => void
  pushRedo: (entry: HistoryEntry) => void
  popRedo: () => HistoryEntry | undefined
  clearHistory: () => void
  setDraftRows: (rows: DraftRecord[]) => void
  updateDraftField: (index: number, field: string, value: unknown) => void
  addDraftRow: (draft: DraftRecord) => number
  removeDraftRow: (index: number) => void
  clearDrafts: () => void
  setErrorsForDraft: (index: number, errors: FieldError[]) => void
  setLoading: (state: boolean) => void
  setSaving: (state: boolean) => void
  setSaveError: (error: string | null) => void
  $reset: () => void
}

export function createRecordState() {
  const records = ref<RecordEntity[]>([])
  const currentRecord = ref<RecordEntity | null>(null)
  const draftRows = ref<DraftRecord[]>([])
  const undoStack = ref<HistoryEntry[]>([])
  const redoStack = ref<HistoryEntry[]>([])
  const queryState = ref<QueryState>({
    filters: [],
    sort: null,
    pagination: { page: 1, pageSize: 20, total: 0 },
  })
  const isLoading = ref(false)
  const isSaving = ref(false)
  const saveError = ref<string | null>(null)

  /** 历史栈容量：undo/redo 各自封顶，超出淘汰最旧条目 */
  const HISTORY_LIMIT = 50

  const totalRecords = computed(() => queryState.value.pagination.total)
  const hasRecords = computed(() => records.value.length > 0)
  const hasDrafts = computed(() => draftRows.value.length > 0)
  const currentPage = computed(() => queryState.value.pagination.page)
  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

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

  /** create 撤销用：从实例列表移除记录，返回原位置（未找到返回 -1）；同步扣减 total */
  function removeRecordLocal(recordId: string): number {
    const index = records.value.findIndex(r => r.id === recordId)
    if (index >= 0) {
      records.value.splice(index, 1)
      queryState.value.pagination.total = Math.max(0, queryState.value.pagination.total - 1)
    }
    return index
  }

  /** create 重做用：按位插回记录（越界收敛到末尾）；同步递增 total */
  function insertRecordLocal(record: RecordEntity, index: number): void {
    const at = Math.min(Math.max(index, 0), records.value.length)
    records.value.splice(at, 0, record)
    queryState.value.pagination.total += 1
  }

  /** 新用户动作入栈：清空 redo 栈（分叉历史失效），超限淘汰最旧 */
  function pushHistory(entry: HistoryEntry): void {
    undoStack.value.push(entry)
    if (undoStack.value.length > HISTORY_LIMIT) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  function popUndo(): HistoryEntry | undefined {
    return undoStack.value.pop()
  }

  /** redo 回落专用：仅入 undo 栈，不动 redo */
  function pushUndo(entry: HistoryEntry): void {
    undoStack.value.push(entry)
    if (undoStack.value.length > HISTORY_LIMIT) {
      undoStack.value.shift()
    }
  }

  function pushRedo(entry: HistoryEntry): void {
    redoStack.value.push(entry)
    if (redoStack.value.length > HISTORY_LIMIT) {
      redoStack.value.shift()
    }
  }

  function popRedo(): HistoryEntry | undefined {
    return redoStack.value.pop()
  }

  function clearHistory(): void {
    undoStack.value = []
    redoStack.value = []
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
    redoStack.value = []
    queryState.value = { filters: [], sort: null, pagination: { page: 1, pageSize: 20, total: 0 } }
    isLoading.value = false
    isSaving.value = false
    saveError.value = null
  }

  return reactive({
    records,
    currentRecord,
    draftRows,
    undoStack,
    redoStack,
    canUndo,
    canRedo,
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
    removeRecordLocal,
    insertRecordLocal,
    pushHistory,
    popUndo,
    pushUndo,
    pushRedo,
    popRedo,
    clearHistory,
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
  })
}

// ============================================================
// UiState
// ============================================================

export interface UiState {
  viewMode: Ref<ViewMode>['value']
  editingCell: Ref<{ rowId: string; field: string } | null>['value']
  selectedRowIds: Ref<string[]>['value']
  globalMessage: Ref<string | null>['value']
  globalMessageType: Ref<'info' | 'warning' | 'error' | 'success'>['value']
  dialogState: Ref<{ visible: boolean; type: ExtendedDialogType | null; payload: Record<string, unknown> | null }>['value']
  isLoading: Ref<boolean>['value']
  isEditing: ComputedRef<boolean>['value']
  dialogVisible: ComputedRef<boolean>['value']
  dialogType: ComputedRef<ExtendedDialogType | null>['value']
  setViewMode: (mode: ViewMode) => void
  setEditingCell: (cell: { rowId: string; field: string } | null) => void
  setSelectedRows: (ids: string[]) => void
  toggleRowSelection: (id: string) => void
  clearSelection: () => void
  openDialog: (type: ExtendedDialogType, payload?: Record<string, unknown>) => void
  closeDialog: () => void
  showMessage: (message: string, type?: 'info' | 'warning' | 'error' | 'success') => void
  clearMessage: () => void
  setLoading: (state: boolean) => void
  $reset: () => void
}

export function createUiState() {
  const viewMode = ref<ViewMode>('list')
  const editingCell = ref<{ rowId: string; field: string } | null>(null)
  const selectedRowIds = ref<string[]>([])
  const globalMessage = ref<string | null>(null)
  const globalMessageType = ref<'info' | 'warning' | 'error' | 'success'>('info')
  const dialogState = ref<{
    visible: boolean
    type: ExtendedDialogType | null
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

  function openDialog(type: ExtendedDialogType, payload: Record<string, unknown> = {}): void {
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

  return reactive({
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
  })
}

// ============================================================
// RuntimeContextState
// ============================================================

export type RuntimeGlobalContext = Record<string, unknown>

export interface RuntimeContextState {
  global: Ref<RuntimeGlobalContext>['value']
  setGlobal: (value: RuntimeGlobalContext) => void
  /** 当前用户角色列表（docs/19 G3）：FieldPermission.roleBased 判定输入 */
  currentRoles: string[]
  setRoles: (roles: string[]) => void
  $reset: () => void
}

export function createRuntimeContextState(initial?: RuntimeGlobalContext, initialRoles?: string[]) {
  const global = ref<RuntimeGlobalContext>(initial ?? {})
  const roles = ref<string[]>(initialRoles ?? [])

  function setGlobal(value: RuntimeGlobalContext): void {
    global.value = value
  }

  function setRoles(next: string[]): void {
    roles.value = [...next]
  }

  function $reset(): void {
    global.value = {}
    roles.value = []
  }

  return reactive({
    global,
    setGlobal,
    currentRoles: roles,
    setRoles,
    $reset,
  })
}

// ============================================================
// Injection Keys
// ============================================================

export const SCHEMA_META_KEY: InjectionKey<SchemaMetaState> = Symbol('schemaMetaState')
export const RECORD_STATE_KEY: InjectionKey<RecordState> = Symbol('recordState')
export const UI_STATE_KEY: InjectionKey<UiState> = Symbol('uiState')
export const RUNTIME_CONTEXT_KEY: InjectionKey<RuntimeContextState> = Symbol('runtimeContextState')

// ============================================================
// Inject Helpers
// ============================================================

export function useSchemaMeta(): SchemaMetaState {
  const state = inject(SCHEMA_META_KEY)
  if (!state) {
    throw new Error('[schemagine] SchemaMetaState not provided. Ensure component is inside <SchemaEngine>.')
  }
  return state
}

export function useRecords(): RecordState {
  const state = inject(RECORD_STATE_KEY)
  if (!state) {
    throw new Error('[schemagine] RecordState not provided. Ensure component is inside <SchemaEngine>.')
  }
  return state
}

export function useUi(): UiState {
  const state = inject(UI_STATE_KEY)
  if (!state) {
    throw new Error('[schemagine] UiState not provided. Ensure component is inside <SchemaEngine>.')
  }
  return state
}

export function useRuntimeContext(): RuntimeContextState {
  const state = inject(RUNTIME_CONTEXT_KEY)
  if (!state) {
    throw new Error('[schemagine] RuntimeContextState not provided. Ensure component is inside <SchemaEngine>.')
  }
  return state
}
