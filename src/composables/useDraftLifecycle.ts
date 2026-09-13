import { useRecords, useSchemaMeta } from '@/composables/instanceState'
import { useFormula } from '@/composables/useFormula'
import type { FieldSchema } from '@/types'

export interface DraftLifecycleContext {
  formulasEnabled: boolean
  formulaFields: FieldSchema[]
  aggregationFields: Array<FieldSchema & { aggregation: 'sum' | 'average' | 'count' | 'max' | 'min' }>
  lockedColumns: Set<string>
}

export interface AggregationValue {
  fieldKey: string
  label: string
  type: 'sum' | 'average' | 'count' | 'max' | 'min'
  value: number
  count: number
  totalCount: number
}

export function useDraftLifecycle() {
  const recordStore = useRecords()
  const schemaMeta = useSchemaMeta()
  const formula = useFormula()

  function buildContext(lockedColumns: Set<string>): DraftLifecycleContext {
    const fields = schemaMeta.visibleFields
    const schema = schemaMeta.schema

    const formulasEnabled = schema?.formulaConfig?.enabled ?? false
    const formulaFields = formulasEnabled
      ? fields.filter(f => f.type === 'formula')
      : []
    const aggregationFields = fields.filter(
      (f): f is FieldSchema & { aggregation: 'sum' | 'average' | 'count' | 'max' | 'min' } =>
        f.aggregation === 'sum' || f.aggregation === 'average' || f.aggregation === 'count' || f.aggregation === 'max' || f.aggregation === 'min'
    )

    return {
      formulasEnabled,
      formulaFields,
      aggregationFields,
      lockedColumns,
    }
  }

  function isFieldEmpty(fieldKey: string, value: unknown): boolean {
    if (value === null || value === undefined) return true
    if (value === '') return true
    const field = schemaMeta.getField(fieldKey)
    if (field?.treatAsEmpty) {
      return field.treatAsEmpty.some(v => v === value)
    }
    return false
  }

  function padZero(n: number): string {
    return n < 10 ? `0${n}` : `${n}`
  }

  function formatDateValue(field: FieldSchema, offsetDays: number): string | undefined {
    const today = new Date()
    const targetDate = new Date(today)
    targetDate.setDate(today.getDate() + offsetDays)

    const year = targetDate.getFullYear()
    const month = padZero(targetDate.getMonth() + 1)
    const day = padZero(targetDate.getDate())

    if (field.type === 'datetime') {
      const hours = padZero(targetDate.getHours())
      const minutes = padZero(targetDate.getMinutes())
      const seconds = padZero(targetDate.getSeconds())
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    }

    return `${year}-${month}-${day}`
  }

  function applyDefaults(context: DraftLifecycleContext, targetIndex: number): void {
    const targetRow = recordStore.draftRows[targetIndex]
    if (!targetRow) return

    for (const field of schemaMeta.visibleFields) {
      if (targetRow.fields[field.key] !== undefined) continue

      if (field.defaultValue !== undefined) {
        recordStore.updateDraftField(targetIndex, field.key, field.defaultValue)
        continue
      }

      if ((field.type === 'date' || field.type === 'datetime') &&
          field.defaultDateOffset !== undefined) {
        const dateValue = formatDateValue(field, field.defaultDateOffset)
        if (dateValue !== undefined) {
          recordStore.updateDraftField(targetIndex, field.key, dateValue)
        }
      }
    }

    if (context.lockedColumns.size > 0 && targetIndex > 0) {
      const sourceRow = recordStore.draftRows[targetIndex - 1]
      if (sourceRow) {
        for (const fieldKey of context.lockedColumns) {
          if (!isFieldEmpty(fieldKey, targetRow.fields[fieldKey])) continue
          const lockedValue = sourceRow.fields[fieldKey]
          if (lockedValue !== undefined) {
            recordStore.updateDraftField(targetIndex, fieldKey, lockedValue)
          }
        }
      }
    }
  }

  function fillLockedValues(context: DraftLifecycleContext): void {
    if (context.lockedColumns.size === 0) return

    for (const fieldKey of context.lockedColumns) {
      let previousValue: unknown = undefined
      for (let i = 0; i < recordStore.draftRows.length; i++) {
        const row = recordStore.draftRows[i]
        if (!row) continue
        if (!isFieldEmpty(fieldKey, row.fields[fieldKey])) {
          previousValue = row.fields[fieldKey]
        } else if (previousValue !== undefined) {
          recordStore.updateDraftField(i, fieldKey, previousValue)
        }
      }
    }
  }

  function evaluateFormulas(context: DraftLifecycleContext, rowIndices?: number[]): void {
    if (!context.formulasEnabled || context.formulaFields.length === 0) return

    const indices = rowIndices ?? recordStore.draftRows.map((_, i) => i)

    for (const idx of indices) {
      const row = recordStore.draftRows[idx]
      if (!row) continue
      const evaluatedFields = { ...row.fields }
      formula.evaluateAllFormulas(evaluatedFields)
      for (const f of context.formulaFields) {
        const newValue = evaluatedFields[f.key]
        if (newValue !== row.fields[f.key]) {
          recordStore.updateDraftField(idx, f.key, newValue)
        }
      }
    }
  }

  function computeAggregations(context: DraftLifecycleContext): AggregationValue[] {
    if (context.aggregationFields.length === 0) return []
    const rows = recordStore.draftRows
    if (rows.length === 0) return []

    const totalCount = rows.length

    return context.aggregationFields.map(field => {
      const values = rows
        .map(r => Number(r.fields[field.key]))
        .filter(v => !isNaN(v))

      let value = 0
      let count = rows.length

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
          count = rows.filter(r => isFieldEmpty(field.key, r.fields[field.key])).length
        } else if (field.countCondition === 'notEmpty') {
          count = rows.filter(r => !isFieldEmpty(field.key, r.fields[field.key])).length
        } else {
          count = rows.length
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
    buildContext,
    applyDefaults,
    fillLockedValues,
    evaluateFormulas,
    computeAggregations,
  }
}
