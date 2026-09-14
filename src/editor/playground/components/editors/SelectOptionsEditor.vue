<script setup lang="ts">
import { ElButton, ElCheckbox, ElInput, ElSelect, ElOption } from 'element-plus'
import type { SelectOption } from '@/types'

const props = defineProps<{
  modelValue: SelectOption[] | undefined
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SelectOption[] | undefined]
}>()

const COLOR_PRESETS = [
  { value: '', label: '默认' },
  { value: 'primary', label: 'primary(蓝)' },
  { value: 'success', label: 'success(绿)' },
  { value: 'warning', label: 'warning(橙)' },
  { value: 'danger', label: 'danger(红)' },
  { value: 'info', label: 'info(灰)' },
]

function rows(): SelectOption[] {
  return Array.isArray(props.modelValue) ? props.modelValue : []
}

function update(index: number, patch: Partial<SelectOption>): void {
  const next = rows().map((o, i) => (i === index ? { ...o, ...patch } : { ...o }))
  emit('update:modelValue', next)
}

function add(): void {
  emit('update:modelValue', [...rows(), { label: '', value: '' }])
}

function remove(index: number): void {
  const next = rows().filter((_, i) => i !== index)
  emit('update:modelValue', next.length > 0 ? next : undefined)
}
</script>

<template>
  <div class="options-editor">
    <div v-for="(opt, i) in rows()" :key="i" class="option-row">
      <ElInput
        class="cell-label"
        :model-value="opt.label"
        placeholder="标签"
        size="small"
        @update:model-value="(v: string) => update(i, { label: v })"
      />
      <ElInput
        class="cell-value"
        :model-value="String(opt.value ?? '')"
        placeholder="值"
        size="small"
        @update:model-value="(v: string) => update(i, { value: v })"
      />
      <ElSelect
        class="cell-color"
        :model-value="opt.color ?? ''"
        placeholder="颜色"
        size="small"
        clearable
        allow-create
        @update:model-value="(v: string) => update(i, { color: v || undefined })"
      >
        <ElOption v-for="c in COLOR_PRESETS" :key="c.value" :label="c.label" :value="c.value" />
      </ElSelect>
      <ElCheckbox
        :model-value="opt.disabled === true"
        @update:model-value="(v: unknown) => update(i, { disabled: Boolean(v) || undefined })"
      >
        禁用
      </ElCheckbox>
      <ElButton size="small" text type="danger" @click="remove(i)">删除</ElButton>
    </div>
    <ElButton size="small" type="primary" link @click="add">+ 添加选项</ElButton>
  </div>
</template>

<style scoped>
.option-row {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  margin-bottom: var(--sg-spacing-2);
}
.cell-label {
  width: 160px;
}
.cell-value {
  width: 120px;
}
.cell-color {
  width: 140px;
}
</style>
