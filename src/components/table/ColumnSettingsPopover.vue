<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElPopover, ElCheckbox, ElButton, ElInputNumber, ElMessage, ElMessageBox } from 'element-plus'
import type { ColumnConfig, FieldSchema } from '@/types'

const props = defineProps<{
  fields: FieldSchema[]
  columns: ColumnConfig[]
  disabledFields?: Set<string>
}>()

const emit = defineEmits<{
  save: [payload: ColumnConfig[]]
  cancel: [payload: void]
  reset: [payload: void]
}>()

const localColumns = ref<ColumnConfig[]>([])

watch(() => props.columns, (val) => {
  // 操作列（type:'action'）是标准数据操作，固定渲染，不参与列设置
  const configurableKeys = new Set(props.fields.filter(f => f.type !== 'action').map(f => f.key))
  localColumns.value = val.filter(c => configurableKeys.has(c.field)).map(c => ({ ...c }))
}, { immediate: true, deep: true })

const sortedColumns = computed(() => {
  return [...localColumns.value].sort((a, b) => a.order - b.order)
})

const popoverVisible = ref(false)

function toggleField(field: string): void {
  const col = localColumns.value.find(c => c.field === field)
  if (!col) return
  if (col.visible && props.disabledFields?.has(field)) return
  col.visible = !col.visible
}

function setFixed(col: ColumnConfig, direction: 'left' | 'right'): void {
  if (col.fixed === direction) {
    col.fixed = undefined
  } else {
    col.fixed = direction
  }
}

function moveUp(index: number): void {
  if (index <= 0) return
  const sorted = sortedColumns.value
  const current = sorted[index]
  const prev = sorted[index - 1]
  if (!current || !prev) return
  const temp = current.order
  current.order = prev.order
  prev.order = temp
  localColumns.value = [...localColumns.value]
}

function moveDown(index: number): void {
  const sorted = sortedColumns.value
  if (index >= sorted.length - 1) return
  const current = sorted[index]
  const next = sorted[index + 1]
  if (!current || !next) return
  const temp = current.order
  current.order = next.order
  next.order = temp
  localColumns.value = [...localColumns.value]
}

function updateWidth(col: ColumnConfig, width: number | undefined): void {
  // 清空 = 弹性列（未声明 width，吃满容器剩余宽度）
  col.width = width == null ? undefined : Math.max(40, Math.min(600, width))
}

const defaultColumns = computed(() => {
  return props.fields
    .filter(f => f.type !== 'action')
    .map((f, i) => ({
      field: f.key,
      width: f.width,
      visible: f.visible !== false,
      order: i,
      sortable: !!f.sortable,
    }))
})

async function handleReset(): Promise<void> {
  try {
    await ElMessageBox.confirm('重置将恢复列表设置为系统默认值，确认重置？', '确认重置', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning',
    })
    localColumns.value = defaultColumns.value.map(c => ({ ...c }))
    ElMessage.success('已恢复默认设置')
  } catch {
    // cancelled
  }
}

function handleSave(): void {
  const sorted = [...localColumns.value].sort((a, b) => a.order - b.order)
  emit('save', sorted)
  popoverVisible.value = false
  ElMessage.success('列表设置已保存')
}

function handleCancel(): void {
  localColumns.value = props.columns.map(c => ({ ...c }))
  popoverVisible.value = false
  emit('cancel')
}

function getFieldLabel(fieldKey: string): string {
  const field = props.fields.find(f => f.key === fieldKey)
  return field?.label || fieldKey
}

function getFieldType(fieldKey: string): string {
  const field = props.fields.find(f => f.key === fieldKey)
  return field?.type || 'text'
}
</script>

<template>
  <ElPopover
    v-model:visible="popoverVisible"
    placement="bottom-end"
    :width="480"
    trigger="click"
  >
    <template #reference>
      <slot />
    </template>

    <div class="column-settings">
      <div class="settings-header">
        <span>列表设置</span>
        <ElButton size="small" text @click="handleReset">恢复默认</ElButton>
      </div>

      <div class="settings-table-header">
        <span class="h-col">显示</span>
        <span class="h-field">字段</span>
        <span class="h-width">宽度</span>
        <span class="h-fixed">固定</span>
        <span class="h-order">排序</span>
      </div>

      <div class="settings-list">
        <div
          v-for="(col, index) in sortedColumns"
          :key="col.field"
          class="settings-row"
          :class="{ 'row-hidden': !col.visible }"
        >
          <span class="h-col">
            <ElCheckbox
              :model-value="col.visible"
              :disabled="!!(col.visible && props.disabledFields?.has(col.field))"
              @change="toggleField(col.field)"
            />
          </span>
          <span class="h-field" :title="getFieldLabel(col.field)">
            <span class="field-label">{{ getFieldLabel(col.field) }}</span>
            <span class="field-type">{{ getFieldType(col.field) }}</span>
          </span>
          <span class="h-width">
            <ElInputNumber
              :model-value="col.width"
              :min="40"
              :max="600"
              :step="10"
              size="small"
              controls-position="right"
              @update:model-value="(val: number | undefined) => updateWidth(col, val)"
            />
          </span>
          <span class="h-fixed">
            <div class="fixed-btns">
              <ElButton
                size="small"
                :type="col.fixed === 'left' ? 'primary' : 'default'"
                @click="setFixed(col, 'left')"
              >
                左
              </ElButton>
              <ElButton
                size="small"
                :type="col.fixed === 'right' ? 'primary' : 'default'"
                @click="setFixed(col, 'right')"
              >
                右
              </ElButton>
            </div>
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
                :disabled="index === sortedColumns.length - 1"
                @click="moveDown(index)"
              >
                ▼
              </ElButton>
            </div>
          </span>
        </div>
      </div>

      <div class="settings-footer">
        <ElButton size="small" @click="handleCancel">取消</ElButton>
        <ElButton size="small" type="primary" @click="handleSave">保存</ElButton>
      </div>
    </div>
  </ElPopover>
</template>

<style scoped>
.column-settings {
  max-height: 480px;
  display: flex;
  flex-direction: column;
  font-size: var(--sg-font-size-md);
}
.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--sg-spacing-4);
  border-bottom: 1px solid var(--sg-border-color-light);
  font-weight: 600;
}
.settings-table-header {
  display: flex;
  align-items: center;
  padding: var(--sg-spacing-3) 0;
  color: var(--sg-text-color-secondary);
  font-size: var(--sg-font-size-base);
  border-bottom: 1px solid var(--sg-border-color-lighter);
}
.settings-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--sg-spacing-2) 0;
  max-height: 320px;
}
.settings-row {
  display: flex;
  align-items: center;
  padding: var(--sg-spacing-3) 0;
  border-bottom: 1px solid var(--sg-fill-color);
  gap: var(--sg-spacing-4);
}
.settings-row:hover {
  background-color: var(--sg-fill-color-light);
}
.settings-row.row-hidden {
  opacity: 0.55;
}
.settings-footer {
  padding-top: var(--sg-spacing-4);
  border-top: 1px solid var(--sg-border-color-light);
  display: flex;
  justify-content: flex-end;
  gap: var(--sg-spacing-4);
}
.h-col {
  width: 48px;
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}
.h-field {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.field-label {
  font-size: var(--sg-font-size-md);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.field-type {
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-placeholder);
}
.h-width {
  width: 80px;
  flex-shrink: 0;
}
.h-fixed {
  width: 80px;
  flex-shrink: 0;
}
.fixed-btns {
  display: flex;
  gap: var(--sg-spacing-1);
}
.h-order {
  width: 72px;
  flex-shrink: 0;
}
.order-btns {
  display: flex;
  gap: var(--sg-spacing-1);
}
.h-order :deep(.el-button),
.h-fixed :deep(.el-button) {
  padding: 0 var(--sg-spacing-3);
  font-size: var(--sg-font-size-base);
  line-height: 22px;
}
.h-width :deep(.el-input-number--small) {
  width: 100%;
}
</style>
