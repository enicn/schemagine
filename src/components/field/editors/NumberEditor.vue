<script setup lang="ts">
import { computed } from 'vue'
import { ElInputNumber } from 'element-plus'
import type { FieldSchema } from '@/types'

const props = defineProps<{
  modelValue: unknown
  fieldSchema: FieldSchema
  readonly?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
  blur: [payload: void]
  focus: [payload: void]
}>()

function getDefaultDecimal(field: FieldSchema): number | undefined {
  if (field.decimal != null) return field.decimal
  if (field.type === 'currency') return 2
  if (field.type === 'percent') return 0
  return undefined
}

const decimal = computed(() => getDefaultDecimal(props.fieldSchema))

const decimalMode = computed(() => props.fieldSchema.decimalMode ?? 'fixed')

const precision = computed(() => {
  if (decimal.value == null) return undefined
  if (decimalMode.value !== 'fixed') return undefined
  return decimal.value
})

const isPercent = computed(() => props.fieldSchema.type === 'percent')

const displayValue = computed(() => {
  const raw = props.modelValue
  if (raw == null || raw === '') return undefined
  if (isPercent.value) {
    return Number(raw) * 100
  }
  return Number(raw)
})

function handleChange(value: number | undefined): void {
  if (isPercent.value && value != null) {
    emit('update:modelValue', value / 100)
  } else {
    emit('update:modelValue', value ?? null)
  }
}

function handleBlur(): void {
  emit('blur')
}

function handleFocus(): void {
  emit('focus')
}
</script>

<template>
  <div
    class="number-editor-wrapper"
    :class="{
      'has-prefix': fieldSchema.prefixStr,
      'has-suffix': fieldSchema.suffixStr || (fieldSchema.type === 'percent'),
    }"
  >
    <span v-if="fieldSchema.prefixStr" class="affix affix-prefix">{{ fieldSchema.prefixStr }}</span>
    <ElInputNumber
      :model-value="displayValue"
      :placeholder="fieldSchema.placeholder || `请输入${fieldSchema.label}`"
      :disabled="disabled || readonly"
      :precision="precision"
      :controls="false"
      class="full-width"
      @update:model-value="handleChange"
      @blur="handleBlur"
      @focus="handleFocus"
    />
    <span v-if="fieldSchema.suffixStr" class="affix affix-suffix">{{ fieldSchema.suffixStr }}</span>
    <span v-else-if="fieldSchema.type === 'percent'" class="affix affix-suffix">%</span>
  </div>
</template>

<style scoped>
.full-width {
  width: 100%;
}
.number-editor-wrapper {
  position: relative;
  width: 100%;
}
.affix {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: var(--sg-z-index-raised);
  font-size: var(--sg-font-size-md);
  color: var(--sg-text-color-secondary);
  pointer-events: none;
  line-height: 1;
}
.affix-prefix {
  left: 8px;
}
.affix-suffix {
  right: 8px;
}
</style>
