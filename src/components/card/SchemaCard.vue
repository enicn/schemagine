<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Check, Close, Edit } from '@element-plus/icons-vue'
import { ElCard, ElButton, ElTag, ElMessageBox } from 'element-plus'
import type { FieldSchema, RecordEntity, CardFieldLayout, CardLayoutConfig } from '@/types'
import CardGridField from './CardGridField.vue'
import { useRuntimeContext } from '@/composables/instanceState'
import { evaluateCondition, isFieldEditableInContext, isFieldVisibleInContext } from '@/utils/condition'
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
  /** 卡片密度（docs/20 appearance.cardDensity）：compact=普通字段每行 4 个、收紧栅格间距 */
  density?: 'default' | 'compact'
}>()

const emit = defineEmits<{
  'field-change': [payload: { field: string; value: unknown; oldValue: unknown }]
  save: [payload: void]
  cancel: [payload: void]
  /** 卡片头部 schema 动作(docs/20):type:'action' 字段渲染在 ID 侧,点击上抛宿主 */
  'row-action': [payload: { rowId: string; field: string; actionId: string }]
}>()

const editing = ref(false)
const editDraft = ref<Record<string, unknown>>({})
/** 紧凑密度（docs/20）：普通字段默认跨度 8→4（16 列栅格下每行 2 个→4 个） */
const defaultSpan = computed(() => (props.density === 'compact' ? 4 : 8))
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

/** 头部动作字段(docs/20):schema 声明的 type:'action' 字段,同此出现在列表操作列与卡片头部；
 * rowAction.visibleWhen 按当前记录逐条求值（§2.5），不满足的动作不渲染 */
function headerActionVisible(f: FieldSchema): boolean {
  const when = f.rowAction?.visibleWhen
  return !when || evaluateCondition(when, { record: props.record.fields, global: runtimeContext.global })
}

const headerActions = computed<FieldSchema[]>(() => {
  return props.fieldSchemas.filter(f => f.type === 'action' && !!f.rowAction && headerActionVisible(f))
})

function handleHeaderAction(f: FieldSchema): void {
  emit('row-action', { rowId: String(props.record.id), field: f.key, actionId: f.key })
}

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
    span: isLong ? 16 : defaultSpan.value,
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
  <ElCard class="schema-card" :class="{ 'schema-card--compact': density === 'compact' }" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="card-title">
          <span class="card-record-id">ID: {{ titleDisplay }}</span>
          <ElTag v-if="statusField" size="small" type="info" effect="plain">
            {{ statusField }}
          </ElTag>
          <button
            v-for="f in headerActions"
            :key="f.key"
            type="button"
            class="card-schema-action"
            :class="{ 'card-schema-action--danger': f.rowAction?.danger }"
            :disabled="editing"
            :title="f.rowAction?.label"
            @click="handleHeaderAction(f)"
          >
            {{ f.rowAction?.label }}
          </button>
        </div>
        <div class="card-header-center">
          <slot name="header-center" />
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
          <!-- 宿主业务动作注入点（docs/20）：作用域 { record: 当前记录, editing: 是否编辑态 } -->
          <slot name="extra-actions" :record="record" :editing="editing" />
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
}

/* 两侧 flex:1 均分剩余空间,中间翻页器 flex:none 恒居中 */
.card-title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-4);
}

.card-record-id {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--sg-fill-color-light);
  border: 1px solid var(--sg-border-color-lighter);
  font-weight: 600;
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-primary);
}

.card-schema-action {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  margin-left: var(--sg-spacing-1);
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--sg-color-primary);
  font-size: var(--sg-font-size-sm);
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}

.card-schema-action:hover:not(:disabled) {
  background: var(--sg-color-primary-light-9);
}

.card-schema-action:disabled {
  color: var(--sg-text-color-disabled);
  cursor: not-allowed;
}

.card-schema-action--danger {
  color: var(--sg-color-danger);
}

.card-schema-action--danger:hover:not(:disabled) {
  background: var(--sg-color-danger-light-9, rgba(245, 108, 108, 0.1));
}

.card-header-center {
  flex: none;
  display: flex;
  justify-content: center;
  min-width: 0;
}

.card-actions {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  gap: var(--sg-spacing-2);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(16, 1fr);
  gap: var(--sg-spacing-6) var(--sg-spacing-8);
  padding: var(--sg-spacing-2) 0;
}

/* 紧凑密度（docs/20）：栅格间距收敛，配合普通字段 span 4（每行 4 个）实现详情一屏化 */
.schema-card--compact .card-grid {
  gap: var(--sg-spacing-2) var(--sg-spacing-5);
}

@media (max-width: 768px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--sg-spacing-4);
  }
  .schema-card--compact .card-grid {
    gap: var(--sg-spacing-3);
  }
  /* 窄屏一行两个:字段跨度钳制为半行(覆盖 16 栅格 span) */
  .card-grid > * {
    grid-column: auto / span 1 !important;
  }
}

@media (max-width: 480px) {
  .card-grid {
    grid-template-columns: 1fr;
    gap: var(--sg-spacing-3);
  }
}
</style>
