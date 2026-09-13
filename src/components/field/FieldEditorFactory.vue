<script setup lang="ts">
import { computed } from 'vue'
import type { FieldSchema } from '@/types'
import TextEditor from './editors/TextEditor.vue'
import NumberEditor from './editors/NumberEditor.vue'
import DateEditor from './editors/DateEditor.vue'
import BooleanEditor from './editors/BooleanEditor.vue'
import SelectEditor from './editors/SelectEditor.vue'
import FkSelector from './editors/FkSelector.vue'
import RelationEditor from './editors/RelationEditor.vue'
import MediaImageEditor from './editors/MediaImageEditor.vue'
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

  const type = props.fieldSchema.type
  switch (type) {
    case 'text':
    case 'email':
    case 'url':
    case 'phone':
      return TextEditor
    case 'number':
    case 'currency':
    case 'money':
    case 'percent':
      return NumberEditor
    case 'date':
    case 'datetime':
      return DateEditor
    case 'boolean':
      return BooleanEditor
    case 'select':
    case 'multi-select':
    case 'status':
      return SelectEditor
    case 'fk':
      return FkSelector
    case 'mediaImage':
      return MediaImageEditor
    case 'one-to-many':
    case 'many-to-many':
    case 'reverse-ref':
      return RelationEditor
    case 'formula':
    case 'image':
    case 'attachment':
    case 'json':
    default:
      return ValueRenderer
  }
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
