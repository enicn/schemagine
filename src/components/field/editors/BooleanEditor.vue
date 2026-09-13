<script setup lang="ts">
import { computed } from 'vue'
import { ElSwitch, ElRadioGroup, ElRadio } from 'element-plus'
import type { FieldSchema } from '@/types'

const props = defineProps<{
  modelValue: unknown
  fieldSchema: FieldSchema
  readonly?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  blur: [payload: void]
  focus: [payload: void]
}>()

const trueLabel = computed(() => props.fieldSchema.trueLabel || '是')
const falseLabel = computed(() => props.fieldSchema.falseLabel || '否')
const trueLabelClass = computed(() => props.fieldSchema.trueLabelClass || '')
const falseLabelClass = computed(() => props.fieldSchema.falseLabelClass || '')

const isRadioMode = computed(() => props.fieldSchema.switchMode === 'radio')
const isReadonly = computed(() => props.disabled || props.readonly)

function handleSwitchChange(value: string | number | boolean): void {
  emit('update:modelValue', !!value)
}

function handleRadioChange(value: unknown): void {
  emit('update:modelValue', value === true)
}
</script>

<template>
  <div class="boolean-editor">
    <template v-if="isReadonly">
      <span
        class="boolean-label"
        :class="modelValue ? trueLabelClass : falseLabelClass"
      >{{ modelValue ? trueLabel : falseLabel }}</span>
    </template>
    <ElSwitch
      v-else-if="!isRadioMode"
      :model-value="!!modelValue"
      @update:model-value="handleSwitchChange"
    />
    <ElRadioGroup
      v-else
      :model-value="!!modelValue"
      @update:model-value="handleRadioChange"
    >
      <ElRadio :value="true">
        <span :class="trueLabelClass">{{ trueLabel }}</span>
      </ElRadio>
      <ElRadio :value="false">
        <span :class="falseLabelClass">{{ falseLabel }}</span>
      </ElRadio>
    </ElRadioGroup>
  </div>
</template>

<style scoped>
.boolean-editor {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}
.boolean-label {
  font-size: var(--sg-font-size-md);
  color: var(--sg-text-color-primary);
}
</style>
