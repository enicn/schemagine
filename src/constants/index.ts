export const VIEW_MODES = ['list', 'card', 'create'] as const
export type ViewMode = (typeof VIEW_MODES)[number]

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 200
export const MAX_FORMULA_DEPTH = 10

export const ERROR_MESSAGES: Record<string, string> = {
  VERSION_CONFLICT: '数据已被其他用户修改，请刷新后重试',
  PERMISSION_DENIED: '您没有执行此操作的权限',
  VALIDATION_FAILED: '数据校验不通过',
  NOT_FOUND: '请求的数据不存在',
  CIRCULAR_DEPENDENCY: '检测到公式循环依赖',
  FORMULA_ERROR: '公式计算异常',
  DYNAMIC_MAX_EXCEEDED: '超过动态最大值限制',
  MODULE_UNAVAILABLE: '模块不可用',
  SCHEMA_INVALID: '模块配置异常',
  NETWORK_ERROR: '网络异常，请检查网络连接',
  UNKNOWN: '未知错误，请联系管理员',
}

export const STORAGE_KEYS = {
  USER_VIEW_CONFIG: 'schemagine:userViewConfig',
  SESSION_CACHE: 'schemagine:sessionCache',
}

export const DIALOG_TYPES = {
  QUICK_CREATE: 'quick-create',
  COLUMN_SETTINGS: 'column-settings',
  FORMULA_DETAIL: 'formula-detail',
  DYNAMIC_MAX_CONFIRM: 'dynamic-max-confirm',
  VERSION_CONFLICT: 'version-conflict',
  CONFIRM: 'confirm',
  ALERT: 'alert',
} as const
