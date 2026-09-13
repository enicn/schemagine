<script setup lang="ts">
import { ElDatePicker } from 'element-plus'
import type { FieldSchema } from '@/types'

const props = defineProps<{
  modelValue: unknown
  fieldSchema: FieldSchema
  readonly?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
  blur: [payload: void]
  focus: [payload: void]
}>()

const isDatetime = props.fieldSchema.type === 'datetime'

const dateFormat = isDatetime ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD'

function handleChange(value: string | null): void {
  emit('update:modelValue', value)
}

function handleBlur(): void {
  emit('blur')
}

function handleFocus(): void {
  emit('focus')
}
</script>

<template>
  <ElDatePicker
    :model-value="modelValue as string"
    :type="isDatetime ? 'datetime' : 'date'"
    :placeholder="fieldSchema.placeholder || `选择${fieldSchema.label}`"
    :disabled="disabled || readonly"
    :clearable="!readonly"
    :format="dateFormat"
    :value-format="dateFormat"
    class="full-width"
    @update:model-value="handleChange"
    @blur="handleBlur"
    @focus="handleFocus"
  />
</template>

<style scoped>
.full-width {
  width: 100%;
}
</style>
