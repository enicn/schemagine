<script setup lang="ts">
import { computed } from 'vue'
import { ElButton, ElMessageBox } from 'element-plus'
import type { FieldSchema, ModuleSchema } from '@/types'

const props = defineProps<{
  schema: ModuleSchema
  /** null = 选中模块节点 */
  selectedKey: string | null
  /** 字段类型 → 中文标签 */
  typeLabels: Record<string, string>
}>()

const emit = defineEmits<{
  select: [key: string | null]
  'add-field': []
  'remove-field': [key: string]
  'move-field': [key: string, direction: 'up' | 'down']
}>()

const sortedFields = computed(() =>
  [...props.schema.fields].sort((a, b) => a.order - b.order),
)

async function handleRemove(field: FieldSchema): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除字段「${field.label}」(${field.key})吗?`,
      '删除字段',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  emit('remove-field', field.key)
}
</script>

<template>
  <div class="pg-tree">
    <div
      class="tree-node module-node"
      :class="{ active: selectedKey === null }"
      @click="emit('select', null)"
    >
      <span class="node-icon">⚙</span>
      <span class="node-info">
        <span class="node-label">{{ schema.name }}</span>
        <span class="node-sub">模块配置</span>
      </span>
    </div>

    <div class="tree-section-header">
      <span>字段({{ sortedFields.length }})</span>
      <ElButton size="small" type="primary" link @click.stop="emit('add-field')">+ 添加</ElButton>
    </div>

    <div
      v-for="(field, index) in sortedFields"
      :key="field.key"
      class="tree-node field-node"
      :class="{ active: field.key === selectedKey }"
      @click="emit('select', field.key)"
    >
      <span class="node-icon type-badge">{{ typeLabels[field.type] ?? field.type }}</span>
      <span class="node-info">
        <span class="node-label">{{ field.label }}</span>
        <span class="node-sub">{{ field.key }}</span>
      </span>
      <span class="node-actions" @click.stop>
        <button
          class="mini-btn"
          title="上移"
          :disabled="index === 0"
          @click="emit('move-field', field.key, 'up')"
        >↑</button>
        <button
          class="mini-btn"
          title="下移"
          :disabled="index === sortedFields.length - 1"
          @click="emit('move-field', field.key, 'down')"
        >↓</button>
        <button class="mini-btn danger" title="删除" @click="handleRemove(field)">×</button>
      </span>
    </div>
  </div>
</template>

<style scoped>
.pg-tree {
  height: 100%;
  overflow-y: auto;
  padding-right: var(--sg-spacing-2);
}
.tree-node {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  padding: var(--sg-spacing-2) var(--sg-spacing-3);
  border-radius: var(--sg-radius-md);
  cursor: pointer;
  margin-bottom: 2px;
}
.tree-node:hover {
  background: var(--sg-fill-color-light);
}
.tree-node.active {
  background: var(--sg-color-primary-light-9, #ecf5ff);
}
.module-node {
  font-weight: 500;
  border: 1px solid var(--sg-border-color-light);
  margin-bottom: var(--sg-spacing-3);
}
.node-icon {
  flex-shrink: 0;
}
.type-badge {
  font-size: var(--sg-font-size-sm);
  color: var(--sg-color-primary);
  background: var(--sg-fill-color, #f5f7fa);
  border-radius: var(--sg-radius-sm, 4px);
  padding: 0 var(--sg-spacing-1);
  min-width: 52px;
  text-align: center;
}
.node-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.node-label {
  font-size: var(--sg-font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-sub {
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
  font-family: var(--sg-font-family-mono, Consolas, monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
  padding: 0 var(--sg-spacing-3) var(--sg-spacing-2);
}
.node-actions {
  display: none;
  gap: 2px;
}
.tree-node:hover .node-actions {
  display: inline-flex;
}
.mini-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
  padding: 0 var(--sg-spacing-1);
  line-height: 1.2;
}
.mini-btn:disabled {
  color: var(--sg-border-color);
  cursor: not-allowed;
}
.mini-btn.danger:hover {
  color: var(--sg-color-danger);
}
</style>
