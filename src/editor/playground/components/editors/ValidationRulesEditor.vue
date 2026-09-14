<script setup lang="ts">
import { ElButton, ElInput, ElSelect, ElOption } from 'element-plus'
import type { ValidationRule } from '@/types'

const props = defineProps<{
  modelValue: ValidationRule[] | undefined
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ValidationRule[] | undefined]
}>()

const RULE_TYPES = [
  { value: 'required', label: '必填(required)' },
  { value: 'min', label: '最小值(min)' },
  { value: 'max', label: '最大值(max)' },
  { value: 'minLength', label: '最小长度(minLength)' },
  { value: 'maxLength', label: '最大长度(maxLength)' },
  { value: 'pattern', label: '正则(pattern)' },
  { value: 'custom', label: '自定义(custom)' },
]

function rows(): ValidationRule[] {
  return Array.isArray(props.modelValue) ? props.modelValue : []
}

function update(index: number, patch: Partial<ValidationRule>): void {
  const next = rows().map((r, i) => (i === index ? { ...r, ...patch } : { ...r }))
  emit('update:modelValue', next)
}

function add(): void {
  emit('update:modelValue', [...rows(), { type: 'required', message: '', level: 'error' }])
}

function remove(index: number): void {
  const next = rows().filter((_, i) => i !== index)
  emit('update:modelValue', next.length > 0 ? next : undefined)
}
</script>

<template>
  <div class="rules-editor">
    <div v-for="(rule, i) in rows()" :key="i" class="rule-row">
      <ElSelect
        class="cell-type"
        :model-value="rule.type"
        size="small"
        @update:model-value="(v: string) => update(i, { type: v as ValidationRule['type'] })"
      >
        <ElOption v-for="t in RULE_TYPES" :key="t.value" :label="t.label" :value="t.value" />
      </ElSelect>
      <ElInput
        class="cell-value"
        :model-value="rule.value === undefined ? '' : String(rule.value)"
        placeholder="比较值"
        size="small"
        @update:model-value="(v: string) => update(i, { value: v === '' ? undefined : v })"
      />
      <ElInput
        class="cell-message"
        :model-value="rule.message"
        placeholder="提示消息"
        size="small"
        @update:model-value="(v: string) => update(i, { message: v })"
      />
      <ElSelect
        class="cell-level"
        :model-value="rule.level"
        size="small"
        @update:model-value="(v: string) => update(i, { level: v as ValidationRule['level'] })"
      >
        <ElOption label="error(拦截)" value="error" />
        <ElOption label="warning(提示)" value="warning" />
      </ElSelect>
      <ElButton size="small" text type="danger" @click="remove(i)">删除</ElButton>
    </div>
    <ElButton size="small" type="primary" link @click="add">+ 添加规则</ElButton>
  </div>
</template>

<style scoped>
.rule-row {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  margin-bottom: var(--sg-spacing-2);
}
.cell-type {
  width: 170px;
}
.cell-value {
  width: 110px;
}
.cell-message {
  flex: 1;
  min-width: 140px;
}
.cell-level {
  width: 130px;
}
</style>
