import type { ListAction, RowActionConfig } from '@/types'

/**
 * 动作移动端降级策略（管理端移动适配 §3.3）：schema 可选 `mobile` 字段标注
 * allow/block/hidden，缺省按类型走内建规则（矩阵）。
 *
 * 工具栏（list scope）内建规则：
 *  - custom（携 selectedRowIds 的批量上下文）→ hidden；
 *  - delete（批量删除）/ sort（排序面板）→ hidden（批量与排序面板均桌面概念）；
 *  - popup-schema / form-submit（表单弹窗，vw 兜底可用）→ allow。
 * 行级（row scope）内建规则：
 *  - delete（单条删除，引擎已有二次确认）→ allow；
 *  - 其余（custom/popup-schema/form-submit/export）→ block（宿主弹窗复杂度引擎不可知，
 *    schema 标 mobile:'allow' 逐个放行点击即完成类动作）。
 */
export type MobileActionPolicy = 'allow' | 'block' | 'hidden'

function normalize(value: string | undefined): MobileActionPolicy | undefined {
  return value === 'allow' || value === 'block' || value === 'hidden' ? value : undefined
}

export function resolveListActionMobilePolicy(action: ListAction): MobileActionPolicy {
  return normalize(action.mobile) ?? (action.type === 'custom' || action.type === 'delete' || action.type === 'sort' ? 'hidden' : 'allow')
}

export function resolveRowActionMobilePolicy(action: RowActionConfig): MobileActionPolicy {
  return normalize(action.mobile) ?? (action.type === 'delete' ? 'allow' : 'block')
}
