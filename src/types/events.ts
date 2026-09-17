import type { SortParam, FilterCondition } from './service'
import type { ListAction } from './schema'
import type { CellEditPayload, DraftRecord } from './record'
import type { ExtendedDialogType } from '@/engine/registry/dialogRegistry'

export type { BuiltinDialogType, ExtendedDialogType } from '@/engine/registry/dialogRegistry'

/**
 * 标准数据操作契约(宿主执行):
 *
 * 本引擎定位为前端渲染与演算层——引擎负责「渲染操作入口 + 交互确认 + 发出标准化事件」,
 * 不包含任何数据写操作的执行;宿主监听以下事件执行业务(调用自己的后端),完成后经
 * 引擎实例方法 refresh() 触发重新拉取。
 *
 * - 行级操作:operations.delete.enabled / listActions / rowAction 渲染按钮 →
 *   引擎完成二次确认(标准删除)后 emit `row-action`
 * - 批量操作:operations.delete.batch 渲染批量按钮 → 引擎完成勾选收集 + 二次确认后
 *   emit `action-trigger`(action.type='delete',context.selectedRowIds 为勾选行主键)
 */
export interface RowActionEvent {
  /** 目标记录主键 */
  rowId: string
  /** 触发操作的字段 key(action 类型字段);内置删除时为 'delete' */
  field: string
  /** 操作标识:内置删除为 'delete',其余为 rowAction 所在字段 key */
  actionId: string
}

export interface ActionTriggerEvent {
  /** 触发的列表动作;内置批量删除为 { id: 'batch-delete', type: 'delete', label } */
  action: ListAction
  /** 动作上下文:批量删除携带 selectedRowIds(勾选行主键);自定义动作由宿主与 Schema 约定 */
  context?: {
    selectedRowIds?: string[]
    [key: string]: unknown
  }
}

/**
 * 批量字段更新事件(docs/19 H4,宿主执行·原子语义):
 *
 * Schema 配置 `operations.batchPatch.enabled: true` 时,批量编辑对话框确认后引擎
 * 不再本地逐条 patchField,而是 emit `batch-patch` 交由宿主执行。契约约定:
 * - 宿主须以**原子语义**执行:补丁对 ids 要么全部生效、要么全部不生效(任一记录
 *   失败由宿主在自己的后端整体回滚);
 * - 执行完成后宿主调用 engineRef.refresh() 重新拉取(引擎此路径不做本地乐观更新,
 *   也不写入撤销栈——数据真源在宿主侧)。
 */
export interface BatchPatchEvent {
  /** 目标模块 id */
  moduleId: string
  /** 目标记录主键集合(勾选行,含跨页勾选) */
  ids: string[]
  /** 应用的字段补丁;批量编辑为单字段补丁,如 { status: 'approved' } */
  patch: Record<string, unknown>
}

export interface CellEditEvent extends CellEditPayload {
  rowId: string
  field: string
  value: unknown
  oldValue: unknown
  mode: 'cell' | 'row' | 'batch'
  source: 'user' | 'formula' | 'lock-fill' | 'quick-create'
}

export interface SortChangeEvent {
  field: string
  order: 'asc' | 'desc'
}

export interface QueryChangeEvent {
  filters: FilterCondition[]
  sort: SortParam | null
  pagination: {
    page: number
    pageSize: number
  }
}

export interface PageChangeEvent {
  page: number
  pageSize: number
}

export interface ViewModeChangeEvent {
  mode: 'list' | 'card' | 'create'
  source: 'user' | 'auto' | 'engine'
}

export interface QuickCreateEvent {
  field: string
  targetModuleId: string
  prefillData?: Record<string, unknown>
}

export interface DialogResult {
  action: 'confirm' | 'cancel' | 'close'
  payload?: Record<string, unknown>
}

export interface RequestOpenDialogEvent {
  dialogType: ExtendedDialogType
  payload: Record<string, unknown>
}

export type DialogType =
  | 'quick-create'
  | 'column-settings'
  | 'formula-detail'
  | 'dynamic-max-confirm'
  | 'version-conflict'
  | 'confirm'
  | 'alert'

export interface DraftChangeEvent {
  drafts: DraftRecord[]
  changedIndex?: number
}

export interface LockColumnEvent {
  field: string
  direction: 'left' | 'right' | 'none'
}
