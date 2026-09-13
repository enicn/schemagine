<script setup lang="ts">
import { computed } from 'vue'
import type { FieldSchema } from '@/types'

const props = defineProps<{
  fieldSchema: FieldSchema
  fieldSchemas: FieldSchema[]
  modelValue: unknown
  record: Record<string, unknown>
  expanded: boolean
}>()

const labelMap = computed(() => {
  const map: Record<string, string> = {}
  for (const f of props.fieldSchemas) {
    map[f.key] = f.label
  }
  return map
})

const formulaConfig = computed(() => props.fieldSchema.formula)

const displayValue = computed(() => {
  const v = props.modelValue
  if (v === null || v === undefined) return '-'
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v)
    return v.toString()
  }
  return String(v)
})

const chainParts = computed(() => {
  const cfg = formulaConfig.value
  if (!cfg) return null
  const deps = cfg.dependencies

  const sorted = [...deps].sort((a, b) => b.length - a.length)

  let withLabels = cfg.expression
  let withValues = cfg.expression
  for (const key of sorted) {
    const label = labelMap.value[key] ?? key
    withLabels = withLabels.replaceAll(key, label)
    const val = props.record[key]
    withValues = withValues.replaceAll(key, val === null || val === undefined ? '?' : String(val))
  }

  return { label: props.fieldSchema.label, withLabels, withValues, result: displayValue.value }
})
</script>

<template>
  <div v-if="expanded && chainParts" class="formula-chain">
    <span class="fc-label">{{ chainParts.label }}</span>
    <span class="fc-eq">=</span>
    <span class="fc-expr">{{ chainParts.withLabels }}</span>
    <span class="fc-eq">=</span>
    <span class="fc-params">{{ chainParts.withValues }}</span>
    <span class="fc-eq">=</span>
    <span class="fc-result">{{ chainParts.result }}</span>
  </div>
  <span v-else class="formula-result-only">{{ displayValue }}</span>
</template>

<style scoped>
.formula-result-only {
  font-weight: 700;
  color: var(--sg-text-color-primary);
  font-family: 'Courier New', monospace;
  font-size: var(--sg-font-size-md);
  padding: 0 var(--sg-spacing-2);
}
.formula-chain {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sg-spacing-2) var(--sg-spacing-3);
  font-size: var(--sg-font-size-base);
  line-height: 1.6;
  padding: var(--sg-spacing-1) var(--sg-spacing-2);
  color: var(--sg-text-color-regular);
}
.fc-label {
  font-weight: 600;
  color: var(--sg-color-primary);
}
.fc-eq {
  color: var(--sg-text-color-secondary);
  font-weight: 300;
}
.fc-expr {
  font-family: 'Courier New', monospace;
  background: var(--sg-color-success-light-9);
  padding: 0 var(--sg-spacing-2);
  border-radius: var(--sg-radius-xs);
  color: var(--sg-color-success);
}
.fc-params {
  font-family: 'Courier New', monospace;
  background: var(--sg-color-warning-light-9);
  padding: 0 var(--sg-spacing-2);
  border-radius: var(--sg-radius-xs);
  color: var(--sg-color-warning);
}
.fc-result {
  font-weight: 700;
  color: var(--sg-text-color-primary);
  font-family: 'Courier New', monospace;
}
</style>
