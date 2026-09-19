<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElPopover, ElButton, ElInputNumber, ElSwitch, ElMessage } from 'element-plus'
import type { FieldSchema, CardFieldLayout, CardLayoutConfig } from '@/types'

const props = defineProps<{
  fields: FieldSchema[]
  cardLayout: CardLayoutConfig | null
}>()

const emit = defineEmits<{
  save: [payload: CardLayoutConfig]
  reset: [payload: void]
}>()

const localFields = ref<CardFieldLayout[]>([])

function buildDefaultLayout(): CardFieldLayout[] {
  return props.fields
    .filter(f => f.visible !== false)
    .map((f, i) => {
      const longTypes = ['text', 'json', 'url', 'attachment', 'image']
      const isLong = longTypes.includes(f.type)
      return {
        field: f.key,
        span: isLong ? 16 : 8,
        order: i,
        collapsedByDefault: isLong,
      }
    })
}

watch(() => props.cardLayout, (val) => {
  if (val?.fields && val.fields.length > 0) {
    localFields.value = val.fields.map(f => ({ ...f }))
  } else {
    localFields.value = buildDefaultLayout()
  }
}, { immediate: true, deep: true })

const sortedFields = computed(() => {
  return [...localFields.value].sort((a, b) => a.order - b.order)
})

const popoverVisible = ref(false)

function getFieldLabel(fieldKey: string): string {
  const field = props.fields.find(f => f.key === fieldKey)
  return field?.label || fieldKey
}

function getFieldType(fieldKey: string): string {
  const field = props.fields.find(f => f.key === fieldKey)
  return field?.type || 'text'
}

function isLongContentField(fieldKey: string): boolean {
  const field = props.fields.find(f => f.key === fieldKey)
  if (!field) return false
  return ['text', 'json', 'url', 'attachment', 'image'].includes(field.type)
}

function moveUp(index: number): void {
  if (index <= 0) return
  const sorted = sortedFields.value
  const current = sorted[index]
  const prev = sorted[index - 1]
  if (!current || !prev) return
  const temp = current.order
  current.order = prev.order
  prev.order = temp
  localFields.value = [...localFields.value]
}

function moveDown(index: number): void {
  const sorted = sortedFields.value
  if (index >= sorted.length - 1) return
  const current = sorted[index]
  const next = sorted[index + 1]
  if (!current || !next) return
  const temp = current.order
  current.order = next.order
  next.order = temp
  localFields.value = [...localFields.value]
}

function updateSpan(field: CardFieldLayout, span: number): void {
  field.span = Math.max(2, Math.min(16, span || 8))
}

function toggleCollapse(field: CardFieldLayout): void {
  field.collapsedByDefault = !field.collapsedByDefault
}

function handleReset(): void {
  localFields.value = buildDefaultLayout()
  ElMessage.success('已恢复默认卡片布局')
}

function handleSave(): void {
  const sorted = [...localFields.value].sort((a, b) => a.order - b.order)
  emit('save', { fields: sorted })
  popoverVisible.value = false
  ElMessage.success('卡片布局已保存')
}

function handleCancel(): void {
  if (props.cardLayout?.fields) {
    localFields.value = props.cardLayout.fields.map(f => ({ ...f }))
  } else {
    localFields.value = buildDefaultLayout()
  }
  popoverVisible.value = false
}
</script>

<template>
  <ElPopover
    v-model:visible="popoverVisible"
    placement="bottom-end"
    :width="560"
    trigger="click"
  >
    <template #reference>
      <slot />
    </template>

    <div class="card-layout-settings">
      <div class="settings-header">
        <span>卡片设置</span>
        <ElButton size="small" text @click="handleReset">恢复默认</ElButton>
      </div>

      <div class="settings-tip">
        设置每个字段在卡片中的占列数（共16列）。长内容字段支持默认折叠。
      </div>

      <div class="settings-table-header">
        <span class="h-field">字段</span>
        <span class="h-span">占列(1-16)</span>
        <span class="h-collapse">默认折叠</span>
        <span class="h-order">排序</span>
      </div>

      <div class="settings-list">
        <div
          v-for="(field, index) in sortedFields"
          :key="field.field"
          class="settings-row"
        >
          <span class="h-field" :title="getFieldLabel(field.field)">
            <span class="field-label">{{ getFieldLabel(field.field) }}</span>
            <span class="field-type">{{ getFieldType(field.field) }}</span>
          </span>
          <span class="h-span">
            <ElInputNumber
              :model-value="field.span"
              :min="2"
              :max="16"
              :step="1"
              size="small"
              controls-position="right"
              style="width: 100px;"
              @update:model-value="(val: number | undefined) => updateSpan(field, val ?? 8)"
            />
            <span class="span-hint">
              {{ field.span >= 16 ? '单行' : field.span >= 8 ? '双栏' : field.span >= 5 ? '三栏' : '多栏' }}
            </span>
          </span>
          <span class="h-collapse">
            <ElSwitch
              v-if="isLongContentField(field.field)"
              :model-value="field.collapsedByDefault"
              size="small"
              @update:model-value="toggleCollapse(field)"
            />
            <span v-else class="no-switch">-</span>
          </span>
          <span class="h-order">
            <div class="order-btns">
              <ElButton
                size="small"
                :disabled="index === 0"
                @click="moveUp(index)"
              >
                ▲
              </ElButton>
              <ElButton
                size="small"
                :disabled="index >= sortedFields.length - 1"
                @click="moveDown(index)"
              >
                ▼
              </ElButton>
            </div>
          </span>
        </div>
      </div>

      <div class="settings-actions">
        <ElButton size="small" @click="handleCancel">取消</ElButton>
        <ElButton size="small" type="primary" @click="handleSave">保存</ElButton>
      </div>
    </div>
  </ElPopover>
</template>

<style scoped>
.card-layout-settings {
  font-size: var(--sg-font-size-md);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sg-spacing-4);
  font-weight: 600;
}

.settings-tip {
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-secondary);
  margin-bottom: var(--sg-spacing-6);
  line-height: 1.4;
}

.settings-table-header {
  display: flex;
  align-items: center;
  padding: var(--sg-spacing-3) var(--sg-spacing-4);
  background: var(--sg-fill-color-light);
  border-radius: var(--sg-radius-md);
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-secondary);
  font-weight: 500;
  gap: var(--sg-spacing-4);
}

.h-field {
  flex: 1;
  min-width: 0;
}

.h-span {
  width: 140px;
  flex-shrink: 0;
}

.h-collapse {
  width: 80px;
  flex-shrink: 0;
  text-align: center;
}

.h-order {
  width: 100px;
  flex-shrink: 0;
  text-align: center;
}

.settings-list {
  max-height: 400px;
  overflow-y: auto;
  margin: var(--sg-spacing-2) 0;
}

.settings-row {
  display: flex;
  align-items: center;
  padding: var(--sg-spacing-3) var(--sg-spacing-4);
  gap: var(--sg-spacing-4);
  border-bottom: 1px solid var(--sg-border-color-extra-light);
  transition: background var(--sg-duration-normal);
}

.settings-row:hover {
  background: var(--sg-fill-color-lighter);
}

.field-label {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-type {
  display: inline-block;
  margin-left: var(--sg-spacing-2);
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-placeholder);
  background: var(--sg-fill-color-light);
  padding: 0 var(--sg-spacing-2);
  border-radius: var(--sg-radius-xs);
}

.span-hint {
  margin-left: var(--sg-spacing-2);
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
  white-space: nowrap;
}

.no-switch {
  color: var(--sg-text-color-placeholder);
  text-align: center;
  display: block;
}

.order-btns {
  display: flex;
  gap: var(--sg-spacing-2);
  justify-content: center;
}

.settings-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sg-spacing-4);
  padding-top: var(--sg-spacing-4);
  border-top: 1px solid var(--sg-border-color-light);
  margin-top: var(--sg-spacing-2);
}
</style>
