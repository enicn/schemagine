<script setup lang="ts">
import { ElInput } from 'element-plus'
import type { FieldSchema } from '@/types'

defineProps<{
  modelValue: unknown
  fieldSchema: FieldSchema
  readonly?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: [payload: void]
  focus: [payload: void]
}>()

function handleInput(value: string): void {
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
  <ElInput
    :model-value="modelValue as string"
    :placeholder="fieldSchema.placeholder || `请输入${fieldSchema.label}`"
    :disabled="disabled || readonly"
    :clearable="!readonly"
    @update:model-value="handleInput"
    @blur="handleBlur"
    @focus="handleFocus"
  />
</template>
