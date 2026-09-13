<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElCard, ElButton, ElTag } from 'element-plus'
import type { FieldSchema, RecordEntity, CardFieldLayout, CardLayoutConfig } from '@/types'
import CardGridField from './CardGridField.vue'
import { useRuntimeContext } from '@/composables/instanceState'
import { isFieldEditableInContext, isFieldVisibleInContext } from '@/utils/condition'

const props = defineProps<{
  fieldSchemas: FieldSchema[]
  record: RecordEntity
  editable?: boolean
  cardLayout?: CardLayoutConfig | null
  autoEdit?: boolean
}>()

const emit = defineEmits<{
  'field-change': [payload: { field: string; value: unknown; oldValue: unknown }]
  save: [payload: void]
  cancel: [payload: void]
}>()

const editing = ref(false)
const editDraft = ref<Record<string, unknown>>({})
const runtimeContext = useRuntimeContext()

function startEdit(): void {
  editDraft.value = { ...props.record.fields }
  editing.value = true
}

watch(
  () => props.autoEdit,
  (v) => {
    if (!v) return
    if (!props.editable) return
    if (editing.value) return
    startEdit()
  },
  { immediate: true },
)

function cancelEdit(): void {
  editing.value = false
  editDraft.value = {}
  emit('cancel')
}

function saveEdit(): void {
  for (const [field, value] of Object.entries(editDraft.value)) {
    const oldValue = props.record.fields[field]
    if (value !== oldValue) {
      emit('field-change', { field, value, oldValue })
    }
  }
  editing.value = false
  editDraft.value = {}
  emit('save')
}

function handleFieldUpdate(fieldKey: string, value: unknown): void {
  editDraft.value[fieldKey] = value
}

const conditionRecord = computed<Record<string, unknown>>(() => {
  return editing.value ? editDraft.value : props.record.fields
})

const conditionCtx = computed(() => {
  return { record: conditionRecord.value, global: runtimeContext.global }
})

const visibleFields = computed(() => {
  return props.fieldSchemas.filter(f => isFieldVisibleInContext(f, conditionCtx.value))
})

const statusField = computed(() => {
  const statusSchema = props.fieldSchemas.find(f => f.key === 'status')
  if (statusSchema) {
    const statusVal = props.record.fields['status'] as string
    const option = statusSchema.options?.find(o => o.value === statusVal)
    return option?.label || statusVal
  }
  return null
})

function buildDefaultFieldLayout(field: FieldSchema, index: number): CardFieldLayout {
  const longTypes = ['text', 'json', 'url', 'attachment', 'image', 'mediaImage']
  const isLong = longTypes.includes(field.type)
  return {
    field: field.key,
    span: isLong ? 16 : 8,
    order: index,
    collapsedByDefault: isLong,
  }
}

const fieldLayouts = computed<(CardFieldLayout & { schema: FieldSchema })[]>(() => {
  const configMap = new Map<string, CardFieldLayout>()
  if (props.cardLayout?.fields) {
    for (const f of props.cardLayout.fields) {
      configMap.set(f.field, f)
    }
  }

  return visibleFields.value.map((field, index) => {
    const config = configMap.get(field.key)
    const layout = config ?? buildDefaultFieldLayout(field, index)
    return { ...layout, schema: field }
  }).sort((a, b) => a.order - b.order)
})

function getFieldValue(fieldKey: string): unknown {
  if (editing.value && fieldKey in editDraft.value) {
    return editDraft.value[fieldKey]
  }
  return props.record.fields[fieldKey]
}

function isEditableField(field: FieldSchema): boolean {
  if (!props.editable) return false
  return isFieldEditableInContext(field, conditionCtx.value)
}
</script>

<template>
  <ElCard class="schema-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="card-title">
          <span class="card-record-id">{{ record.id }}</span>
          <ElTag v-if="statusField" size="small" type="info" effect="plain">
            {{ statusField }}
          </ElTag>
        </div>
        <div class="card-actions">
          <ElButton
            v-if="!editing && editable"
            size="small"
            type="primary"
            link
            @click="startEdit"
          >
            编辑
          </ElButton>
          <template v-if="editing">
            <ElButton size="small" type="primary" @click="saveEdit">保存</ElButton>
            <ElButton size="small" @click="cancelEdit">取消</ElButton>
          </template>
        </div>
      </div>
    </template>

    <div class="card-grid">
      <CardGridField
        v-for="item in fieldLayouts"
        :key="item.field"
        :field-schema="item.schema"
        :value="getFieldValue(item.field)"
        :layout="item"
        :editing="editing && item.schema.type !== 'formula'"
        :edit-value="editing ? editDraft[item.field] : undefined"
        :readonly="item.schema.readonly"
        :disabled="!isEditableField(item.schema)"
        @update:edit-value="(val: unknown) => handleFieldUpdate(item.field, val)"
      />
    </div>
  </ElCard>
</template>

<style scoped>
.schema-card {
  margin-bottom: var(--sg-spacing-6);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-4);
}

.card-record-id {
  font-weight: 600;
  font-size: var(--sg-font-size-lg);
}

.card-actions {
  display: flex;
  gap: var(--sg-spacing-2);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(16, 1fr);
  gap: var(--sg-spacing-6) var(--sg-spacing-8);
  padding: var(--sg-spacing-2) 0;
}

@media (max-width: 768px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--sg-spacing-4);
  }
}

@media (max-width: 480px) {
  .card-grid {
    grid-template-columns: 1fr;
    gap: var(--sg-spacing-3);
  }
}
</style>
