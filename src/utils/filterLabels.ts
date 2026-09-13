import type { FilterOperator } from '@/types'

export const OPERATOR_LABEL_MAP: Record<FilterOperator, string> = {
  eq: '=',
  neq: '≠',
  like: '包含',
  notLike: '不包含',
  in: '属于',
  notIn: '不属于',
  between: '介于',
  notBetween: '不介于',
  isNull: '为空',
  isNotNull: '不为空',
}

export function getOperatorLabel(operator: FilterOperator): string {
  return OPERATOR_LABEL_MAP[operator] ?? operator
}
