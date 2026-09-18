<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ElButton, ElMessageBox } from 'element-plus'
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
  /** 三段式编辑手柄（移动详情面板 §3.7）：true 时 label 行右端渲染 ✎ 手柄（可编辑判定由父级完成） */
  handleVisible?: boolean
  /** 本字段处于手柄编辑态（同一时刻全局仅一个字段，由父级 SchemaCard 仲裁） */
  handleActive?: boolean
}>()

const emit = defineEmits<{
  'update:editValue': [value: unknown]
  /** 点手柄：请求进入本字段编辑态（父级做互斥与脏值仲裁） */
  'handle-click': []
  /** ✕ 取消：dirty 时子级已确认丢弃，父级只需退出编辑态 */
  'handle-cancel': []
  /** ✓ 保存：携带编辑器当前值；成功与否由父级 saveField 结果决定是否退出编辑态 */
  'handle-confirm': [value: unknown]
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

// ── 手柄编辑态（§3.7）：值区换 FieldEditorFactory 编辑器，✎ 换 [✓保存][✕取消] ──
const handleDraft = ref<unknown>(undefined)
const handleEditorRef = ref<InstanceType<typeof FieldEditorFactory> | null>(null)

watch(() => props.handleActive, (active) => {
  if (active) {
    handleDraft.value = props.value
    // 编辑器 focus + 软键盘避让（§3.7.2：focus 时 scrollIntoView 居中）
    nextTick(() => {
      const el = handleEditorRef.value?.$el as HTMLElement | undefined
      const focusable = el?.querySelector('input, textarea, button') as HTMLElement | null | undefined
      focusable?.focus()
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  } else {
    handleDraft.value = undefined
  }
})

const isHandleDirty = computed(() => handleDraft.value !== props.value)

function handleConfirm(): void {
  emit('handle-confirm', handleDraft.value)
}

async function handleCancel(): Promise<void> {
  if (isHandleDirty.value) {
    try {
      await ElMessageBox.confirm('当前修改尚未保存，确定放弃？', '放弃修改', {
        type: 'warning',
        confirmButtonText: '放弃',
        cancelButtonText: '继续编辑',
      })
    } catch {
      return
    }
  }
  emit('handle-cancel')
}

/** 父级仲裁「切换字段时是否有脏值」用 */
function isDirty(): boolean {
  return isHandleDirty.value
}

/** 父级仲裁后强制丢弃脏值（用户选择放弃时） */
function discardDraft(): void {
  handleDraft.value = undefined
}

defineExpose({ isDirty, discardDraft })
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
        'is-handle-editing': handleActive,
      },
    ]"
  >
    <div class="field-label-row">
      <div class="field-label">{{ fieldSchema.label }}</div>
      <!-- 三段式第二段：选中态（面板打开）下 label 行右端浮现手柄；40×40 命中区、次级色 -->
      <button
        v-if="handleVisible && !handleActive && !editing"
        type="button"
        class="field-edit-handle"
        :aria-label="`编辑${fieldSchema.label}`"
        @click.stop="emit('handle-click')"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
            fill="currentColor"
          />
        </svg>
      </button>
      <!-- 三段式第三段：编辑态的 [✓保存][✕取消] 二元组 -->
      <div v-if="handleActive" class="field-edit-actions">
        <ElButton size="small" type="primary" @click.stop="handleConfirm">保存</ElButton>
        <ElButton size="small" @click.stop="handleCancel">取消</ElButton>
      </div>
    </div>
    <div class="field-value">
      <template v-if="handleActive">
        <FieldEditorFactory
          ref="handleEditorRef"
          :field-schema="fieldSchema"
          :model-value="handleDraft"
          mode="edit"
          :disabled="disabled"
          :readonly="readonly"
          @update:model-value="(v: unknown) => (handleDraft = v)"
        />
      </template>
      <template v-else-if="editing">
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
        v-if="isLongContent && !handleActive"
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

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  min-width: 0;
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

/* 编辑手柄（三段式第二段）：icon 14px + 命中区 40×40，150ms 淡入，按压反馈 */
.field-edit-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  margin: -8px -8px -8px 0;
  padding: 0;
  border: none;
  border-radius: var(--sg-radius-md);
  background: transparent;
  color: var(--sg-text-color-secondary);
  cursor: pointer;
  animation: handle-fade-in 150ms ease-out;
  -webkit-tap-highlight-color: transparent;
}
.field-edit-handle:active {
  background: var(--sg-fill-color);
  color: var(--sg-color-primary);
}
@keyframes handle-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.field-edit-actions {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: var(--sg-spacing-1);
  animation: handle-fade-in 150ms ease-out;
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
