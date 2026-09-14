<script setup lang="ts">
import { computed } from 'vue'
import type { FieldSchema } from '@/types'
import { getFieldTypeDefinition } from '@/engine/registry/fieldTypeRegistry'
import { builtinEditorForType } from './editorMap'
import RelationEditor from './editors/RelationEditor.vue'
import ValueRenderer from './editors/ValueRenderer.vue'

const props = defineProps<{
  fieldSchema: FieldSchema
  modelValue: unknown
  mode?: 'edit' | 'view'
  record?: Record<string, unknown>
  recordId?: string
  moduleId?: string
  disabled?: boolean
  readonly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
  blur: [payload: void]
  focus: [payload: void]
  validate: [payload: { field: string; value: unknown; valid: boolean; message?: string }]
}>()

const isViewMode = computed(() => props.mode === 'view')

const editorComponent = computed(() => {
  if (isViewMode.value) {
    if (props.fieldSchema.type === 'one-to-many' || props.fieldSchema.type === 'many-to-many' || props.fieldSchema.type === 'reverse-ref') {
      return RelationEditor
    }
    return ValueRenderer
  }

  // 自定义字段类型（docs/19 B1）：注册了编辑器组件的自定义类型优先
  const customDef = getFieldTypeDefinition(props.fieldSchema.type)
  if (customDef?.editor) {
    return customDef.editor
  }
  // 内置映射;未注册的未知类型回退只读渲染
  return builtinEditorForType(props.fieldSchema.type) ?? ValueRenderer
})

function handleUpdate(value: unknown): void {
  emit('update:modelValue', value)
}

</script>

<template>
  <div class="field-editor-factory">
    <component
      :is="editorComponent"
      :value="modelValue"
      :model-value="modelValue"
      :field-schema="fieldSchema"
      :disabled="disabled"
      :readonly="readonly"
      :allow-quick-create="fieldSchema.type === 'fk' && !!fieldSchema.quickCreate"
      :record-id="recordId"
      :module-id="moduleId"
      @update:model-value="handleUpdate"
      @blur="emit('blur')"
      @focus="emit('focus')"
    />
  </div>
</template>

<style scoped>
.field-editor-factory {
  width: 100%;
}
</style>
