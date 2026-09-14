<script setup lang="ts">
import { computed } from 'vue'
import {
  ElButton, ElInput, ElInputNumber, ElSelect, ElOption, ElSwitch, ElTooltip,
} from 'element-plus'
import type { PropertyMeta } from '@/schemaMeta'
import { META_GROUP_LABELS } from '@/schemaMeta'
import JsonPropertyEditor from './editors/JsonPropertyEditor.vue'
import SelectOptionsEditor from './editors/SelectOptionsEditor.vue'
import ValidationRulesEditor from './editors/ValidationRulesEditor.vue'

const props = defineProps<{
  metas: PropertyMeta[]
  /** 被编辑对象(FieldSchema 或 ModuleSchema 的可编辑切片),由父组件响应式传入 */
  value: Record<string, unknown>
  /** 高亮命中的属性 key(反查定位) */
  highlightKey?: string | null
}>()

const emit = defineEmits<{
  change: [key: string, value: unknown]
}>()

const grouped = computed(() => {
  const result: Array<{ group: PropertyMeta['group']; items: PropertyMeta[] }> = []
  for (const m of props.metas) {
    let bucket = result.find(g => g.group === m.group)
    if (!bucket) {
      bucket = { group: m.group, items: [] }
      result.push(bucket)
    }
    bucket.items.push(m)
  }
  return result
})

function getControlValue(meta: PropertyMeta): unknown {
  const current = props.value[meta.key]
  if (current !== undefined) return current
  return meta.default
}

function isModified(meta: PropertyMeta): boolean {
  return props.value[meta.key] !== undefined
}

function handleChange(meta: PropertyMeta, raw: unknown): void {
  let next = raw
  if (typeof next === 'string' && next === '') next = undefined
  if (next === null) next = undefined
  emit('change', meta.key, next)
}

function applyExample(meta: PropertyMeta): void {
  if (meta.example === undefined) return
  const cloned = typeof meta.example === 'object' && meta.example !== null
    ? JSON.parse(JSON.stringify(meta.example))
    : meta.example
  handleChange(meta, cloned)
}

function resetDefault(meta: PropertyMeta): void {
  handleChange(meta, meta.default)
}

function kindComponent(kind: PropertyMeta['kind']): string | null {
  switch (kind) {
    case 'options': return 'options'
    case 'rules': return 'rules'
    case 'object':
    case 'condition':
      return 'json'
    case 'unknown':
      return 'json-loose'
    default: return null
  }
}

function stringArrayText(value: unknown): string {
  return Array.isArray(value) ? value.map(v => String(v)).join(',') : ''
}
</script>

<template>
  <div class="prop-edit-form">
    <div v-for="bucket in grouped" :key="bucket.group" class="form-group">
      <div class="group-title">{{ META_GROUP_LABELS[bucket.group] }}</div>

      <div
        v-for="meta in bucket.items"
        :key="meta.key"
        class="prop-row"
        :class="{ highlighted: meta.key === highlightKey }"
      >
        <div class="prop-head">
          <span class="prop-label">
            {{ meta.label }}
            <code class="prop-key">{{ meta.key }}</code>
            <span v-if="meta.required" class="req-mark">*</span>
            <span v-if="isModified(meta)" class="modified-mark" title="已修改(区别于默认值)">已改</span>
          </span>
          <span class="prop-actions">
            <ElButton
              v-if="meta.example !== undefined"
              size="small"
              text
              type="primary"
              @click="applyExample(meta)"
            >示例</ElButton>
            <ElButton
              v-if="meta.default !== undefined || isModified(meta)"
              size="small"
              text
              @click="resetDefault(meta)"
            >{{ meta.default !== undefined ? '恢复默认' : '清空' }}</ElButton>
          </span>
        </div>

        <div class="prop-control">
          <!-- 枚举 -->
          <ElSelect
            v-if="meta.kind === 'enum'"
            class="control control-wide"
            :model-value="getControlValue(meta) as string"
            clearable
            size="small"
            @update:model-value="(v: string) => handleChange(meta, v)"
          >
            <ElOption
              v-for="ev in meta.enumValues ?? []"
              :key="ev.value"
              :label="ev.desc ? `${ev.label}(${ev.desc})` : ev.label"
              :value="ev.value"
            />
          </ElSelect>

          <!-- 布尔 -->
          <ElSwitch
            v-else-if="meta.kind === 'boolean'"
            class="control"
            :model-value="Boolean(getControlValue(meta))"
            @update:model-value="(v: unknown) => handleChange(meta, Boolean(v))"
          />

          <!-- 数字 -->
          <ElInputNumber
            v-else-if="meta.kind === 'number'"
            class="control"
            :model-value="getControlValue(meta) as number"
            size="small"
            :step="1"
            @update:model-value="(v: number | undefined) => handleChange(meta, v ?? undefined)"
          />

          <!-- 字符串数组(逗号分隔) -->
          <ElInput
            v-else-if="meta.kind === 'string[]'"
            class="control control-wide"
            :model-value="stringArrayText(getControlValue(meta))"
            size="small"
            placeholder="多个值用英文逗号分隔"
            @update:model-value="(v: string) => handleChange(meta, v.trim() === '' ? undefined : v.split(',').map(s => s.trim()).filter(Boolean))"
          />

          <!-- 字符串 -->
          <ElInput
            v-else-if="meta.kind === 'string'"
            class="control control-wide"
            :model-value="(getControlValue(meta) as string) ?? ''"
            size="small"
            clearable
            @update:model-value="(v: string) => handleChange(meta, v)"
          />

          <!-- 结构化:枚举选项 -->
          <SelectOptionsEditor
            v-else-if="kindComponent(meta.kind) === 'options'"
            :model-value="props.value[meta.key] as never"
            @update:model-value="(v: unknown) => handleChange(meta, v)"
          />

          <!-- 结构化:校验规则 -->
          <ValidationRulesEditor
            v-else-if="kindComponent(meta.kind) === 'rules'"
            :model-value="props.value[meta.key] as never"
            @update:model-value="(v: unknown) => handleChange(meta, v)"
          />

          <!-- JSON(对象/条件/任意值) -->
          <JsonPropertyEditor
            v-else-if="kindComponent(meta.kind)"
            :mode="kindComponent(meta.kind) === 'json-loose' ? 'loose' : 'strict'"
            :model-value="props.value[meta.key]"
            @update:model-value="(v: unknown) => handleChange(meta, v)"
          />

          <!-- 结构性:仅说明 -->
          <span v-else class="control-none">结构性属性,不提供编辑</span>
        </div>

        <ElTooltip placement="top" :show-after="200">
          <template #content>
            <div class="tip-content">{{ meta.description }}</div>
          </template>
          <div class="prop-desc">{{ meta.description }}</div>
        </ElTooltip>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-group {
  margin-bottom: var(--sg-spacing-6);
}
.group-title {
  font-size: var(--sg-font-size-md);
  font-weight: 600;
  padding: var(--sg-spacing-2) 0;
  border-bottom: 1px solid var(--sg-border-color-light);
  margin-bottom: var(--sg-spacing-3);
}
.prop-row {
  padding: var(--sg-spacing-3);
  border-radius: var(--sg-radius-md);
  margin-bottom: var(--sg-spacing-2);
}
.prop-row.highlighted {
  background: var(--sg-color-primary-light-9, #ecf5ff);
}
.prop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sg-spacing-3);
}
.prop-label {
  font-size: var(--sg-font-size-sm);
  font-weight: 500;
}
.prop-key {
  margin-left: var(--sg-spacing-2);
  font-family: var(--sg-font-family-mono, Consolas, monospace);
  font-weight: 400;
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
}
.req-mark {
  color: var(--sg-color-danger);
  margin-left: 2px;
}
.modified-mark {
  margin-left: var(--sg-spacing-2);
  font-size: var(--sg-font-size-sm);
  color: var(--sg-color-warning);
}
.prop-control {
  margin: var(--sg-spacing-2) 0;
}
.control-wide {
  max-width: 560px;
  width: 100%;
}
.control-none {
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
}
.prop-desc {
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  cursor: help;
}
.tip-content {
  max-width: 360px;
  white-space: normal;
}
</style>
