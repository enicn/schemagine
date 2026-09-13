import { computed } from 'vue'
import { useSchemaMeta } from '@/composables/instanceState'
import type { RecordEntity, FieldSchema } from '@/types'

export interface AggregationItem {
  fieldKey: string
  label: string
  type: 'sum' | 'average' | 'count' | 'max' | 'min'
  value: number
  count: number
  totalCount: number
}

export function useAggregation() {
  const schemaMeta = useSchemaMeta()

  const aggregationFields = computed<Array<FieldSchema & { aggregation: 'sum' | 'average' | 'count' | 'max' | 'min' }>>(() => {
    const fields = schemaMeta.schema?.fields ?? []
    return fields.filter(
      (f): f is FieldSchema & { aggregation: 'sum' | 'average' | 'count' | 'max' | 'min' } =>
        f.aggregation === 'sum' || f.aggregation === 'average' || f.aggregation === 'count' || f.aggregation === 'max' || f.aggregation === 'min'
    )
  })

  function isFieldEmpty(fieldKey: string, value: unknown): boolean {
    if (value === null || value === undefined) return true
    if (value === '') return true
    const field = schemaMeta.getField(fieldKey)
    if (field?.treatAsEmpty) {
      return field.treatAsEmpty.some(v => v === value)
    }
    return false
  }

  function compute(records: RecordEntity[]): AggregationItem[] {
    if (aggregationFields.value.length === 0 || records.length === 0) return []

    const totalCount = records.length

    return aggregationFields.value.map(field => {
      const values = records
        .map(r => Number(r.fields[field.key]))
        .filter(v => !isNaN(v))

      let value = 0
      let count = records.length

      if (field.aggregation === 'sum') {
        value = values.reduce((a, b) => a + b, 0)
        count = values.length
      } else if (field.aggregation === 'average') {
        value = values.length > 0
          ? values.reduce((a, b) => a + b, 0) / values.length
          : 0
        count = values.length
      } else if (field.aggregation === 'count') {
        if (field.countCondition === 'empty') {
          count = records.filter(r => isFieldEmpty(field.key, r.fields[field.key])).length
        } else if (field.countCondition === 'notEmpty') {
          count = records.filter(r => !isFieldEmpty(field.key, r.fields[field.key])).length
        } else {
          count = records.length
        }
        value = count
      } else if (field.aggregation === 'max') {
        value = values.length > 0 ? Math.max(...values) : 0
        count = values.length
      } else if (field.aggregation === 'min') {
        value = values.length > 0 ? Math.min(...values) : 0
        count = values.length
      }

      return {
        fieldKey: field.key,
        label: field.label,
        type: field.aggregation,
        value: Math.round(value * 100) / 100,
        count,
        totalCount,
      }
    })
  }

  return {
    aggregationFields,
    compute,
  }
}
