<script setup lang="ts">
import { ref, computed } from 'vue'
import type { FieldSchema, CardFieldLayout } from '@/types'
import FieldEditorFactory from '@/components/field/FieldEditorFactory.vue'

const props = defineProps<{
  fieldSchema: FieldSchema
  value: unknown
  layout: CardFieldLayout
  editing?: boolean
  editValue?: unknown
  disabled?: boolean
  readonly?: boolean
}>()

const emit = defineEmits<{
  'update:editValue': [value: unknown]
}>()

const isLongContent = computed(() => {
  const type = props.fieldSchema.type
  if (type === 'text' || type === 'json' || type === 'url') {
    const str = String(props.value ?? '')
    return str.length > 80 || str.includes('\n')
  }
  return false
})

const collapsed = ref(props.layout.collapsedByDefault !== false && isLongContent.value)

function toggleCollapse(): void {
  collapsed.value = !collapsed.value
}

function handleUpdate(value: unknown): void {
  emit('update:editValue', value)
}
</script>

<template>
  <div
    class="card-grid-field"
    :class="[
      `grid-span-${layout.span}`,
      {
        'is-long-content': isLongContent,
        'is-collapsed': collapsed,
        'is-editing': editing,
      },
    ]"
  >
    <div class="field-label">{{ fieldSchema.label }}</div>
    <div class="field-value">
      <template v-if="editing">
        <FieldEditorFactory
          :field-schema="fieldSchema"
          :model-value="editValue ?? value"
          mode="edit"
          :disabled="disabled"
          :readonly="readonly"
          @update:model-value="handleUpdate"
        />
      </template>
      <template v-else>
        <FieldEditorFactory
          :field-schema="fieldSchema"
          :model-value="value"
          mode="view"
        />
      </template>
      <button
        v-if="isLongContent"
        class="toggle-btn"
        @click="toggleCollapse"
      >
        {{ collapsed ? '展开' : '收起' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.card-grid-field {
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-2);
  min-width: 0;
}

.field-label {
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-secondary);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-value {
  font-size: var(--sg-font-size-md);
  color: var(--sg-text-color-primary);
  line-height: 1.5;
  position: relative;
}

.field-value :deep(.value-renderer) {
  display: block;
  word-break: break-word;
}

.is-long-content .field-value {
  max-height: 4.5em;
  overflow: hidden;
  transition: max-height var(--sg-duration-normal) ease;
}

.is-long-content.is-collapsed .field-value {
  max-height: 4.5em;
}

.is-long-content:not(.is-collapsed) .field-value {
  max-height: none;
}

.toggle-btn {
  display: inline-block;
  margin-top: var(--sg-spacing-1);
  padding: 0;
  border: none;
  background: none;
  color: var(--sg-color-primary);
  font-size: var(--sg-font-size-base);
  cursor: pointer;
  line-height: 1.4;
}

.toggle-btn:hover {
  color: var(--sg-color-primary-light-3);
  text-decoration: underline;
}

.grid-span-2 { grid-column: span 2; }
.grid-span-3 { grid-column: span 3; }
.grid-span-4 { grid-column: span 4; }
.grid-span-5 { grid-column: span 5; }
.grid-span-6 { grid-column: span 6; }
.grid-span-7 { grid-column: span 7; }
.grid-span-8 { grid-column: span 8; }
.grid-span-9 { grid-column: span 9; }
.grid-span-10 { grid-column: span 10; }
.grid-span-11 { grid-column: span 11; }
.grid-span-12 { grid-column: span 12; }
.grid-span-13 { grid-column: span 13; }
.grid-span-14 { grid-column: span 14; }
.grid-span-15 { grid-column: span 15; }
.grid-span-16 { grid-column: span 16; }

@media (max-width: 768px) {
  .card-grid-field {
    grid-column: span 16 !important;
  }
}
</style>
