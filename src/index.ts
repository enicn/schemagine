// ============================================================
// Schema 引擎公开 API
// ============================================================

// === 样式 Token 基线（--sg-*，宿主换肤唯一入口；随库打包进 schemagine.css） ===
import './styles/tokens.css'

// === 引擎入口 ===
export { default as SchemaEngine } from './engine/entry/SchemaEngine.vue'
export { default as ViewContainer } from './engine/containers/ViewContainer.vue'

// === 视图组件 ===
export { default as ListView } from './engine/containers/ListView.vue'
export { default as CardView } from './engine/containers/CardView.vue'
export { default as CreateView } from './engine/containers/CreateView.vue'

// === 可复用组件 ===
export { default as SchemaTable } from './components/table/SchemaTable.vue'
export { default as VxeTableWrapper } from './components/table/VxeTableWrapper.vue'
export { default as SchemaFilterBar } from './components/filter/SchemaFilterBar.vue'
export { default as SchemaCard } from './components/card/SchemaCard.vue'
export { default as FieldEditorFactory } from './components/field/FieldEditorFactory.vue'
export { default as ValueRenderer } from './components/field/editors/ValueRenderer.vue'

// === 编辑器组件 ===
export { default as SchemaEditor } from './editor/SchemaEditor.vue'

// === Service 注入（供外部提供实现） ===
export { setRecordService } from './services/api/recordService'
export { setSchemaService } from './services/api/schemaService'
export { setCandidateService } from './services/api/candidateService'
export { setUserViewConfigService } from './services/api/userViewConfigService'
export { setRelationService } from './services/api/relationService'
export { setMediaService } from './services/api/mediaService'
export type { IRecordService } from './services/api/recordService'
export type { ISchemaService } from './services/api/schemaService'
export type { ICandidateService } from './services/api/candidateService'
export type { IUserViewConfigService } from './services/api/userViewConfigService'
export type { IRelationService } from './services/api/relationService'
export type { IMediaService, MediaAsset, MediaListParams, MediaListResponse } from './services/api/mediaService'
export { peekRecordService } from './services/api/recordService'

// === 本地数据源（数组进、内存分页/排序/过滤；docs/19 批次 C1） ===
export { createLocalRecordService } from './services/local/localRecordService'
export type { LocalRecordService, LocalRecordServiceOptions } from './services/local/localRecordService'

// === 扩展注册表（自定义字段类型 / 自定义弹窗，docs/19 批次 B） ===
export {
  registerFieldType,
  unregisterFieldType,
  getFieldTypeDefinition,
  isRegisteredFieldType,
  isBuiltinFieldType,
} from './engine/registry/fieldTypeRegistry'
export type { CustomFieldTypeDefinition, FieldRenderContext } from './engine/registry/fieldTypeRegistry'
export {
  registerDialog,
  unregisterDialog,
  getDialogComponent,
  BUILTIN_DIALOG_TYPES,
} from './engine/registry/dialogRegistry'
export type { BuiltinDialogType, ExtendedDialogType } from './engine/registry/dialogRegistry'

// === 媒体图片（mediaImage 字段）：选择器与媒体 id 解析 ===
export { default as MediaPickerDialog } from './components/media/MediaPickerDialog.vue'
export { default as MediaImageCell } from './components/field/MediaImageCell.vue'
export { default as MediaImageEditor } from './components/field/editors/MediaImageEditor.vue'
export { isMediaId, resolveMediaUrl, clearMediaUrlCache } from './services/api/mediaService'

// === 工具函数 ===
export { createSuccessResponse, createErrorResponse, setMockEnabled, isMockEnabled } from './services/api/base'
export { OPERATOR_LABEL_MAP, getOperatorLabel } from './utils/filterLabels'
export { resolveDataOperations } from './utils/dataOperations'
export { applyBuiltinOperations } from './utils/dataOperations'
export type { ResolvedDataOperations } from './utils/dataOperations'
// 组合过滤(docs/19 批次 E2):FilterGroup 求值/拍平/移除 + FilterBar 草稿装拆
export {
  isFilterGroup,
  evaluateCondition,
  evaluateConditions,
  flattenFilterConditions,
  removeFieldFromConditions,
  cloneFilterConditions,
  composeBarConditions,
  splitBarConditions,
} from './utils/filterConditions'
export type { FilterMatchType } from './utils/filterConditions'
export { reorderColumnsByDrag } from './utils/columnDrag'
// 批量字段更新执行器(docs/19 批次 H4):两阶段(apply+补偿回写),整体生效或整体不生效
export { executeBatchPatch, survivingChanges } from './utils/batchPatch'
export type { BatchPatchOutcome, BatchPatchAppliedRow } from './utils/batchPatch'
// 表格数据导入(docs/19 批次 H5):TSV/CSV/xlsx 解析与行级预检(剪贴板/文件导入共用管线)
export { parseTsvGrid, parseDelimitedGrid, parseCsvGrid, parseXlsxGrid, precheckImportRows } from './utils/clipboardImport'
export type { XlsxParseResult, ImportRowIssue } from './utils/clipboardImport'

// === 展示口径工具（宿主与引擎同源，防两处口径漂移） ===
export { formatMoney } from './utils/formatMoney'
export { resolveEnumTagStyle, resolveEnumColor, parseCssColor } from './utils/enumTag'
export type { EnumTagStyle, EnumTagTone } from './utils/enumTag'

// === Mock 适配器（开发/演示用） ===
export { initMockServices, MockRecordService } from './services/mock/mockAdapter'
export { resetAllStorage } from './services/mock/mockStorage'

// === 全部类型 ===
export type * from './types'
export type { ViewMode } from './constants'
export { VIEW_MODES, DEFAULT_PAGE_SIZE, ERROR_MESSAGES, DIALOG_TYPES, STORAGE_KEYS } from './constants'

// === 实例状态注入（供自定义视图消费 provide/inject） ===
export type { SchemaMetaState, RecordState, UiState } from './composables/instanceState'
export { useSchemaMeta, useRecords, useUi } from './composables/instanceState'
export { createSchemaMetaState, createRecordState, createUiState } from './composables/instanceState'

// === 组合式函数（Composables） ===
export { useSchema } from './composables/useSchema'
export { usePermission } from './composables/usePermission'
export { useCellEdit } from './composables/useCellEdit'
export { useRecordHistory } from './composables/useRecordHistory'
export { useFormula } from './composables/useFormula'
export { useAggregation } from './composables/useAggregation'
export { useDraftLifecycle } from './composables/useDraftLifecycle'
export { useDynamicMax } from './composables/useDynamicMax'
export { compareVersions, runSchemaMigrations } from './composables/useMigration'
export { useMounted } from './composables/useMounted'
