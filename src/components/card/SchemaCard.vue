<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Check, Close, Edit } from '@element-plus/icons-vue'
import { ElCard, ElButton, ElTag, ElMessageBox } from 'element-plus'
import type { FieldSchema, RecordEntity, CardFieldLayout, CardLayoutConfig } from '@/types'
import CardGridField from './CardGridField.vue'
import { useRuntimeContext } from '@/composables/instanceState'
import { isFieldEditableInContext, isFieldVisibleInContext } from '@/utils/condition'
import { builtinEditorForType } from '@/components/field/editorMap'
import { getFieldTypeDefinition } from '@/engine/registry/fieldTypeRegistry'

const props = defineProps<{
  fieldSchemas: FieldSchema[]
  record: RecordEntity
  editable?: boolean
  cardLayout?: CardLayoutConfig | null
  autoEdit?: boolean
  /** 三段式编辑手柄模式（移动详情面板 §3.7）：可编辑字段 label 行右端出手柄，点手柄单字段编辑；
   *  桌面 CardView 不传，整卡草稿编辑行为不变（零回归） */
  fieldHandle?: boolean
  /** 卡片标题字段 key（缺省 record.id，移动端投影 titleField 覆盖硬编码） */
  titleField?: string
  /** 保存单字段手柄编辑（fieldHandle 模式必传）：返回 true=成功退出编辑态，false=保留编辑器 */
  saveField?: (payload: { field: string; value: unknown; oldValue: unknown }) => Promise<boolean>
}>()

const emit = defineEmits<{
  'field-change': [payload: { field: string; value: unknown; oldValue: unknown }]
  save: [payload: void]
  cancel: [payload: void]
}>()

const editing = ref(false)
const editDraft = ref<Record<string, unknown>>({})
// 三段式手柄的全局单字段互斥仲裁（§3.7）；必须先于 startEdit 声明——
// autoEdit 的 immediate watch 在 setup 阶段同步调用 startEdit → exitHandleEdit，
// 声明靠后会踩 TDZ（ReferenceError），autoEdit 静默失效（卡片永不进入编辑态）
const handleEditingField = ref<string | null>(null)
const runtimeContext = useRuntimeContext()

function startEdit(): void {
  // 手柄编辑态与整卡草稿互斥：进入草稿编辑前先退出手柄
  exitHandleEdit()
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

const titleDisplay = computed(() => {
  if (props.titleField) {
    const v = props.record.fields[props.titleField]
    if (v !== undefined && v !== null && v !== '') return String(v)
  }
  return props.record.id
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

// ── 三段式编辑手柄（§3.7）：可编辑判定 + 全局单字段互斥仲裁 ──
const NON_HANDLE_EDITABLE_TYPES = new Set([
  'formula', 'one-to-many', 'many-to-many', 'reverse-ref', 'action',
  'json', 'image', 'attachment', 'mediaImage',
])

/** 手柄出现判定（§3.7.2）：readonly/limited 字段不出手柄；无编辑器的类型不出手柄 */
function canHandleEdit(field: FieldSchema): boolean {
  if (!props.fieldHandle || !props.editable) return false
  if (field.readonly || field.editMode === 'limited') return false
  if (NON_HANDLE_EDITABLE_TYPES.has(field.type)) return false
  if (builtinEditorForType(field.type) === undefined && !getFieldTypeDefinition(field.type)?.editor) return false
  return isFieldEditableInContext(field, conditionCtx.value)
}

const fieldRefs = new Map<string, InstanceType<typeof CardGridField>>()

function setFieldRef(fieldKey: string, el: unknown): void {
  if (el) fieldRefs.set(fieldKey, el as InstanceType<typeof CardGridField>)
  else fieldRefs.delete(fieldKey)
}

function exitHandleEdit(): void {
  handleEditingField.value = null
}

/** 点手柄：若另一字段在编辑且有脏值 → 阻止切换并提示；无脏值静默切换（§3.7.1） */
async function handleFieldClick(fieldKey: string): Promise<void> {
  if (handleEditingField.value === fieldKey) return
  const current = handleEditingField.value
  if (current) {
    const currentRef = fieldRefs.get(current)
    if (currentRef?.isDirty?.()) {
      try {
        await ElMessageBox.confirm('上一字段的修改尚未保存，先处理它再编辑其他字段', '未保存的修改', {
          type: 'warning',
          confirmButtonText: '放弃并切换',
          cancelButtonText: '留在当前编辑',
        })
        currentRef.discardDraft?.()
      } catch {
        return
      }
    }
  }
  handleEditingField.value = fieldKey
}

function handleFieldCancel(): void {
  handleEditingField.value = null
}

/** ✓ 保存：走宿主注入的单字段通道（与行内编辑同终点 editablePatch）；失败保留编辑器 */
async function handleFieldConfirm(fieldKey: string, value: unknown): Promise<void> {
  if (!props.saveField) {
    handleEditingField.value = null
    return
  }
  const oldValue = props.record.fields[fieldKey]
  const ok = await props.saveField({ field: fieldKey, value, oldValue })
  if (ok) {
    handleEditingField.value = null
  }
}

// 暴露编辑态（响应式）：宿主详情动作排据此做「编辑中禁用」互斥
defineExpose({
  startEdit,
  cancelEdit,
  editing,
  handleEditingField,
})
</script>

<template>
  <ElCard class="schema-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="card-title">
          <span class="card-record-id">{{ titleDisplay }}</span>
          <ElTag v-if="statusField" size="small" type="info" effect="plain">
            {{ statusField }}
          </ElTag>
        </div>
        <div class="card-actions">
          <ElButton
            v-if="!editing && editable && !fieldHandle"
            size="small"
            type="primary"
            link
            :icon="Edit"
            @click="startEdit"
          >
            编辑
          </ElButton>
          <template v-if="editing">
            <ElButton size="small" type="primary" :icon="Check" @click="saveEdit">保存</ElButton>
            <ElButton size="small" :icon="Close" @click="cancelEdit">取消</ElButton>
          </template>
        </div>
      </div>
    </template>

    <div class="card-grid">
      <CardGridField
        v-for="item in fieldLayouts"
        :key="item.field"
        :ref="(el: unknown) => setFieldRef(item.field, el)"
        :field-schema="item.schema"
        :value="getFieldValue(item.field)"
        :layout="item"
        :editing="editing && item.schema.type !== 'formula'"
        :edit-value="editing ? editDraft[item.field] : undefined"
        :readonly="item.schema.readonly"
        :disabled="!isEditableField(item.schema)"
        :handle-visible="canHandleEdit(item.schema)"
        :handle-active="handleEditingField === item.field"
        @update:edit-value="(val: unknown) => handleFieldUpdate(item.field, val)"
        @handle-click="handleFieldClick(item.field)"
        @handle-cancel="handleFieldCancel"
        @handle-confirm="(val: unknown) => handleFieldConfirm(item.field, val)"
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
