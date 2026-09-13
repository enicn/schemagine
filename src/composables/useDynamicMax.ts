import { computed } from 'vue'
import { useSchemaMeta } from '@/composables/instanceState'
import type { DynamicMaxConfig, FieldSchema } from '@/types'

export interface DynamicMaxResult {
  maxValue: number
  isExceeded: boolean
  message: string
  requireConfirm: boolean
  originalValue: unknown
  targetValue: unknown
}

export function useDynamicMax() {
  const schemaMeta = useSchemaMeta()

  const dynamicMaxFields = computed<FieldSchema[]>(() => {
    const schema = schemaMeta.schema
    if (!schema) return []
    return schema.fields.filter(f => f.dynamicMax?.enabled)
  })

  function getDynamicMaxConfig(fieldKey: string): DynamicMaxConfig | undefined {
    const field = schemaMeta.getField(fieldKey)
    return field?.dynamicMax
  }

  function calculateMaxValue(
    fieldKey: string,
    recordFields: Record<string, unknown>,
  ): DynamicMaxResult | null {
    const config = getDynamicMaxConfig(fieldKey)
    if (!config) return null

    const sourceValue = Number(recordFields[config.sourceField]) || 0
    const maxValue = sourceValue * config.ratio

    const currentValue = recordFields[fieldKey]
    const numericValue = Number(currentValue) || 0
    const isExceeded = numericValue > maxValue

    const message = config.messageTemplate
      ? config.messageTemplate
          .replace('{max}', String(maxValue))
          .replace('{current}', String(numericValue))
          .replace('{ratio}', String(config.ratio))
      : `当前值 ${numericValue} 超过了动态最大值 ${maxValue}（基于 ${config.sourceField} × ${config.ratio}）`

    return {
      maxValue,
      isExceeded,
      message,
      requireConfirm: config.mode === 'soft',
      originalValue: currentValue,
      targetValue: numericValue,
    }
  }

  function validateField(
    fieldKey: string,
    newValue: unknown,
    recordFields: Record<string, unknown>,
  ): DynamicMaxResult | null {
    const config = getDynamicMaxConfig(fieldKey)
    if (!config) return null

    const sourceValue = Number(recordFields[config.sourceField]) || 0
    const maxValue = sourceValue * config.ratio
    const numericValue = Number(newValue) || 0
    const isExceeded = numericValue > maxValue

    if (!isExceeded) return null

    const message = config.messageTemplate
      ? config.messageTemplate
          .replace('{max}', String(maxValue))
          .replace('{current}', String(numericValue))
          .replace('{ratio}', String(config.ratio))
      : `输入值 ${numericValue} 超过了动态最大值 ${maxValue}`

    return {
      maxValue,
      isExceeded,
      message,
      requireConfirm: config.mode === 'soft',
      originalValue: recordFields[fieldKey],
      targetValue: numericValue,
    }
  }

  function formatMessage(template: string, max: number, current: number, ratio: number): string {
    return template
      .replace(/\{max\}/g, String(max))
      .replace(/\{current\}/g, String(current))
      .replace(/\{ratio\}/g, String(ratio))
  }

  return {
    dynamicMaxFields,
    getDynamicMaxConfig,
    calculateMaxValue,
    validateField,
    formatMessage,
  }
}
