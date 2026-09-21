<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { Check, Close } from '@element-plus/icons-vue'
import { ElButton, ElCard } from 'element-plus'
import { useRecords, useSchemaMeta, useRuntimeContext } from '@/composables/instanceState'
import { useDraftLifecycle } from '@/composables/useDraftLifecycle'
import FieldEditorFactory from '@/components/field/FieldEditorFactory.vue'
import FormulaDisplay from '@/components/field/FormulaDisplay.vue'
import { isFieldEditableInContext, isFieldVisibleInContext } from '@/utils/condition'
import type { FieldSchema, DraftRecord, CardFieldLayout } from '@/types'

const props = defineProps<{
  submitting?: boolean
  /** 卡片密度(docs/20 appearance.cardDensity):compact=普通字段每行 4 个、满宽利用 */
  density?: 'default' | 'compact'
}>()

const emit = defineEmits<{
  save: [payload: void]
  cancel: [payload: void]
  'draft-change': [payload: { drafts: DraftRecord[]; changedIndex?: number }]
}>()

const recordStore = useRecords()
const schemaMeta = useSchemaMeta()
const lifecycle = useDraftLifecycle()
const runtimeContext = useRuntimeContext()

const showFormulaChain = ref(false)

const draftRows = computed(() => recordStore.draftRows)

const currentDraft = computed(() => draftRows.value[0] ?? null)

const draftIndex = computed(() => 0)

const fieldSchemas = computed<FieldSchema[]>(() => {
  return schemaMeta.visibleFields.filter(f => !f.readonly || f.type === 'formula')
})

const allFieldSchemas = computed<FieldSchema[]>(() => {
  return schemaMeta.schema?.fields ?? []
})

const defaultSpan = computed(() => (props.density === 'compact' ? 4 : 8))

function buildDefaultFieldLayout(field: FieldSchema, index: number): CardFieldLayout {
  const longTypes = ['text', 'json', 'url', 'attachment', 'image']
  const isLong = longTypes.includes(field.type)
  return {
    field: field.key,
    span: isLong ? 16 : defaultSpan.value,
    order: index,
    collapsedByDefault: false,
  }
}

const fieldLayouts = computed(() => {
  const cardLayout = schemaMeta.viewConfig?.cardLayout
  const configMap = new Map<string, CardFieldLayout>()
  if (cardLayout?.fields) {
    for (const f of cardLayout.fields) {
      configMap.set(f.field, f)
    }
  }
  const record = currentDraft.value?.fields ?? {}
  const ctx = { record, global: runtimeContext.global }
  return fieldSchemas.value
    .filter(field => isFieldVisibleInContext(field, ctx))
    .map((field, index) => {
      const config = configMap.get(field.key)
      const layout = config ?? buildDefaultFieldLayout(field, index)
      return { ...layout, schema: field }
    })
    .sort((a, b) => a.order - b.order)
})

const hasFormulaFields = computed(() => {
  return schemaMeta.schema?.formulaConfig?.enabled &&
    (schemaMeta.schema.formulaConfig.fields?.length ?? 0) > 0
})

const lockedColumns = ref(new Set<string>())

const lifecycleContext = computed(() => lifecycle.buildContext(lockedColumns.value))

function initializeDraft(): void {
  if (draftRows.value.length === 0) {
    const newDraft: DraftRecord = {
      tempId: `draft-card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fields: {},
      isValid: true,
    }
    recordStore.addDraftRow(newDraft)
    lifecycle.applyDefaults(lifecycleContext.value, 0)
    lifecycle.evaluateFormulas(lifecycleContext.value, [0])
    emit('draft-change', { drafts: recordStore.draftRows, changedIndex: 0 })
  }
}

onMounted(() => {
  initializeDraft()
})

function handleFieldUpdate(fieldKey: string, value: unknown): void {
  if (lockedColumns.value.has(fieldKey)) return
  recordStore.updateDraftField(draftIndex.value, fieldKey, value)
  lifecycle.evaluateFormulas(lifecycleContext.value, [draftIndex.value])
  emit('draft-change', { drafts: draftRows.value, changedIndex: draftIndex.value })
}

function toggleFormulaChain(): void {
  showFormulaChain.value = !showFormulaChain.value
}

async function handleSave(): Promise<void> {
  emit('save')
}

function handleCancel(): void {
  recordStore.clearDrafts()
  lockedColumns.value.clear()
  emit('cancel')
}

function getFieldValue(fieldKey: string): unknown {
  if (!currentDraft.value) return undefined
  return currentDraft.value.fields[fieldKey]
}

function isEditable(field: FieldSchema): boolean {
  return isFieldEditableInContext(field, { record: currentDraft.value?.fields ?? {}, global: runtimeContext.global })
}
</script>

<template>
  <div class="card-create-view" :class="{ 'is-compact': density === 'compact' }">
    <div class="card-create-scroll">
      <ElCard class="create-form-card" shadow="hover">
        <template #header>
          <div class="card-create-header">
            <span class="card-create-title">
              新建{{ schemaMeta.schema?.name ?? '' }}记录
            </span>
            <ElButton
              v-if="hasFormulaFields"
              size="small"
              link
              :type="showFormulaChain ? 'primary' : 'default'"
              @click="toggleFormulaChain"
            >
              {{ showFormulaChain ? '隐藏公式' : '显示公式' }}
            </ElButton>
          </div>
        </template>

        <div class="card-create-grid">
          <div
            v-for="item in fieldLayouts"
            :key="item.field"
            class="card-create-field"
            :class="[`grid-span-${item.span}`]"
          >
            <label class="field-label">
              {{ item.schema.label }}
              <span v-if="item.schema.required" class="field-required">*</span>
            </label>
            <div class="field-control">
              <template v-if="item.schema.type === 'formula'">
                <FormulaDisplay
                  :field-schema="item.schema"
                  :field-schemas="allFieldSchemas"
                  :model-value="getFieldValue(item.field)"
                  :record="currentDraft?.fields ?? {}"
                  :expanded="showFormulaChain"
                />
              </template>
              <FieldEditorFactory
                v-else
                :field-schema="item.schema"
                :model-value="getFieldValue(item.field)"
                mode="edit"
                :disabled="!isEditable(item.schema)"
                :readonly="lockedColumns.has(item.field)"
                @update:model-value="(val: unknown) => handleFieldUpdate(item.field, val)"
              />
            </div>
            <p v-if="item.schema.description" class="field-hint">
              {{ item.schema.description }}
            </p>
          </div>
        </div>
      </ElCard>
    </div>

    <div class="card-create-toolbar">
      <div class="toolbar-spacer"></div>
      <div class="toolbar-actions">
        <ElButton size="small" :icon="Close" @click="handleCancel">取消</ElButton>
        <ElButton
          size="small"
          type="primary"
          :icon="Check"
          :loading="submitting"
          @click="handleSave"
        >
          保存
        </ElButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-create-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--sg-fill-color-light);
}

.card-create-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--sg-spacing-10) var(--sg-spacing-12);
}

.create-form-card {
  width: 100%;
  border-radius: var(--sg-radius-xl);
  transition: box-shadow var(--sg-duration-normal) ease;
}

/* 紧凑密度(docs/20):栅格间距收敛、贴边无圆角,普通字段每行 4 个 */
.card-create-view.is-compact .card-create-scroll {
  padding: 0;
}
.card-create-view.is-compact .create-form-card {
  border-radius: 0;
}
.card-create-view.is-compact .card-create-toolbar {
  padding: var(--sg-spacing-3) var(--sg-spacing-5);
}
.card-create-grid.is-compact {
  gap: var(--sg-spacing-5) var(--sg-spacing-6);
}

.create-form-card:hover {
  box-shadow: var(--sg-shadow-xl);
}

.card-create-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-create-title {
  font-size: var(--sg-font-size-lg);
  font-weight: 600;
  color: var(--sg-text-color-primary);
}

.card-create-grid {
  display: grid;
  grid-template-columns: repeat(16, 1fr);
  gap: var(--sg-spacing-8) var(--sg-spacing-8);
  padding: var(--sg-spacing-2) 0;
}

.card-create-field {
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-3);
  min-width: 0;
}

.field-label {
  font-size: var(--sg-font-size-md);
  font-weight: 500;
  color: var(--sg-text-color-regular);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-required {
  color: var(--sg-color-danger);
  margin-left: var(--sg-spacing-1);
}

.field-control {
  min-height: 32px;
}

.field-hint {
  margin: 0;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-secondary);
  line-height: 1.4;
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

.card-create-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: var(--sg-spacing-6) var(--sg-spacing-12);
  background: var(--sg-bg-color);
  border-top: 1px solid var(--sg-border-color-light);
  flex-shrink: 0;
  gap: var(--sg-spacing-4);
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-actions {
  display: flex;
  gap: var(--sg-spacing-4);
}

@media (max-width: 768px) {
  .card-create-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--sg-spacing-6);
  }

  /* 窄屏一行两个:字段跨度钳制为半行(覆盖 16 栅格 span,防隐式列溢出) */
  .card-create-grid > * {
    grid-column: auto / span 1 !important;
  }

  .card-create-scroll {
    padding: var(--sg-spacing-6);
  }

  .card-create-toolbar {
    padding: var(--sg-spacing-5) var(--sg-spacing-8);
  }
}

@media (max-width: 480px) {
  .card-create-grid {
    grid-template-columns: 1fr;
    gap: var(--sg-spacing-5);
  }
}
</style>
