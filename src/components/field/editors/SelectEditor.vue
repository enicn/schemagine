<script setup lang="ts">
import { ElSelect, ElOption } from 'element-plus'
import type { FieldSchema } from '@/types'

const props = defineProps<{
  modelValue: unknown
  fieldSchema: FieldSchema
  readonly?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
  blur: [payload: void]
  focus: [payload: void]
}>()

const isMulti = props.fieldSchema.type === 'multi-select'

function handleChange(value: unknown): void {
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
  <ElSelect
    :model-value="modelValue as string | number | boolean | undefined"
    :placeholder="fieldSchema.placeholder || `选择${fieldSchema.label}`"
    :disabled="disabled || readonly"
    :clearable="!readonly"
    :multiple="isMulti"
    :collapse-tags="isMulti"
    class="full-width"
    @update:model-value="handleChange"
    @blur="handleBlur"
    @focus="handleFocus"
  >
    <ElOption
      v-for="opt in fieldSchema.options"
      :key="String(opt.value)"
      :label="opt.label"
      :value="opt.value"
      :disabled="opt.disabled"
    />
  </ElSelect>
</template>

<style scoped>
.full-width {
  width: 100%;
}
</style>
