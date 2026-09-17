import type { DeleteOperationConfig, FieldSchema, ModulePermissions, ModuleSchema } from '@/types'

/** 内置删除字段 key（合成到 schema.fields 尾部，由操作列统一渲染） */
export const BUILTIN_DELETE_FIELD_KEY = '__delete__'

/** resolveDataOperations 的标准化结果 */
export interface ResolvedDataOperations {
  /** 行级删除是否可用：operations.delete.enabled && permissions.delete */
  canDelete: boolean
  /** 批量删除是否可用：canDelete && operations.delete.batch */
  canBatchDelete: boolean
  /** 批量编辑是否走宿主执行契约：operations.batchPatch.enabled（docs/19 H4，true 时引擎 emit batch-patch、原子性由宿主保证） */
  batchPatchDelegated: boolean
  /** 行级删除按钮文案 */
  label: string
  /** 批量删除按钮文案 */
  batchLabel: string
  /** 单条删除确认标题 */
  confirmTitle: string
  /** 单条删除确认内容 */
  confirmMessage: string
  /** 批量删除确认标题 */
  batchConfirmTitle: string
  /** 批量删除确认内容（{count} 已替换为实际数量） */
  batchConfirmMessage: (count: number) => string
}

const DEFAULT_LABEL = '删除'
const DEFAULT_BATCH_LABEL = '批量删除'
const DEFAULT_CONFIRM_TITLE = '删除确认'
const DEFAULT_CONFIRM_MESSAGE = '确认删除该条记录？此操作不可恢复。'
const DEFAULT_BATCH_CONFIRM_TITLE = '批量删除'
const DEFAULT_BATCH_CONFIRM_MESSAGE = '确认删除选中的 {count} 条记录？此操作不可恢复。'

/**
 * 解析模块的标准数据操作（删除）能力：
 * 配置项（operations.delete）与用户权限（permissions.delete）同时满足才生效，
 * 引擎据此内置渲染操作列 / 批量工具栏与二次确认交互。
 */
export function resolveDataOperations(
  schema: ModuleSchema | null | undefined,
  permissions: ModulePermissions | null | undefined,
): ResolvedDataOperations {
  const config: DeleteOperationConfig = schema?.operations?.delete ?? {}
  const canDelete = config.enabled === true && (permissions?.delete ?? false)
  const canBatchDelete = canDelete && config.batch === true

  return {
    canDelete,
    canBatchDelete,
    batchPatchDelegated: schema?.operations?.batchPatch?.enabled === true,
    label: config.label ?? DEFAULT_LABEL,
    batchLabel: config.batchLabel ?? DEFAULT_BATCH_LABEL,
    confirmTitle: config.confirmTitle ?? DEFAULT_CONFIRM_TITLE,
    confirmMessage: config.confirmMessage ?? DEFAULT_CONFIRM_MESSAGE,
    batchConfirmTitle: config.batchConfirmTitle ?? DEFAULT_BATCH_CONFIRM_TITLE,
    batchConfirmMessage: (count: number): string => {
      const template = config.batchConfirmMessage ?? DEFAULT_BATCH_CONFIRM_MESSAGE
      return template.replace('{count}', String(count))
    },
  }
}

/**
 * 将标准数据操作合成为内置 action 字段（追加到 fields 尾部），
 * 使列表视图 / 弹窗表格等所有表格场景经统一渲染管线获得删除操作列。
 * 需在视图配置兼容性处理之后调用，避免内置字段混入用户列设置。
 */
export function applyBuiltinOperations(
  schema: ModuleSchema,
  permissions: ModulePermissions | null | undefined,
): ModuleSchema {
  const ops = resolveDataOperations(schema, permissions)
  if (!ops.canDelete) return schema
  if (schema.fields.some(f => f.key === BUILTIN_DELETE_FIELD_KEY)) return schema

  const deleteField: FieldSchema = {
    id: 'builtin-delete',
    name: BUILTIN_DELETE_FIELD_KEY,
    key: BUILTIN_DELETE_FIELD_KEY,
    type: 'action',
    label: ops.label,
    required: false,
    readonly: true,
    order: Number.MAX_SAFE_INTEGER,
    // action 字段 width 不参与操作列计价（VxeTableWrapper 按按钮实测文本自适应），仅作占位
    width: 48,
    visible: true,
    sortable: false,
    filterable: false,
    rowAction: { type: 'delete', label: ops.label },
  }
  return { ...schema, fields: [...schema.fields, deleteField] }
}
