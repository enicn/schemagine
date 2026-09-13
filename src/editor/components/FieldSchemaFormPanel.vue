<script setup lang="ts">
import { ElForm, ElFormItem, ElInput, ElSelect, ElOption, ElSwitch, ElInputNumber, ElRadioGroup, ElRadio, ElDivider } from 'element-plus'
import type { FieldSchema, FieldType } from '@/types'

const props = defineProps<{
  field: FieldSchema
  allFields: FieldSchema[]
}>()

const emit = defineEmits<{
  update: [payload: FieldSchema]
}>()

const fieldTypes: { value: FieldType; label: string }[] = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'datetime', label: '日期时间' },
  { value: 'boolean', label: '布尔' },
  { value: 'select', label: '选择' },
  { value: 'multi-select', label: '多选' },
  { value: 'fk', label: '外键' },
  { value: 'formula', label: '公式' },
  { value: 'percent', label: '百分比' },
  { value: 'currency', label: '货币' },
  { value: 'phone', label: '电话' },
  { value: 'email', label: '邮箱' },
  { value: 'url', label: '链接' },
]

function updateField(partial: Partial<FieldSchema>): void {
  emit('update', { ...props.field, ...partial })
}
</script>

<template>
  <div class="field-form-panel">
    <h3 class="panel-title">字段编辑: {{ field.label }}</h3>

    <ElForm :model="field" label-position="top" size="small">
      <div class="form-grid">
        <ElFormItem label="标识 Key">
          <ElInput :model-value="field.key" disabled />
        </ElFormItem>
        <ElFormItem label="字段名">
          <ElInput :model-value="field.name" @update:model-value="(v) => updateField({ name: v })" />
        </ElFormItem>
        <ElFormItem label="显示名称">
          <ElInput :model-value="field.label" @update:model-value="(v) => updateField({ label: v })" />
        </ElFormItem>
        <ElFormItem label="字段类型">
          <ElSelect :model-value="field.type" @update:model-value="(v) => updateField({ type: v as FieldType })">
            <ElOption v-for="t in fieldTypes" :key="t.value" :label="t.label" :value="t.value" />
          </ElSelect>
        </ElFormItem>
      </div>

      <ElDivider />

      <div class="form-grid">
        <ElFormItem label="必填">
          <ElSwitch :model-value="field.required" @update:model-value="(v: unknown) => updateField({ required: Boolean(v) })" />
        </ElFormItem>
        <ElFormItem label="只读">
          <ElSwitch :model-value="field.readonly" @update:model-value="(v: unknown) => updateField({ readonly: Boolean(v) })" />
        </ElFormItem>
        <ElFormItem label="可排序">
          <ElSwitch :model-value="field.sortable" @update:model-value="(v: unknown) => updateField({ sortable: Boolean(v) })" />
        </ElFormItem>
        <ElFormItem label="可筛选">
          <ElSwitch :model-value="field.filterable" @update:model-value="(v: unknown) => updateField({ filterable: Boolean(v) })" />
        </ElFormItem>
        <ElFormItem label="可见">
          <ElSwitch :model-value="field.visible" @update:model-value="(v: unknown) => updateField({ visible: Boolean(v) })" />
        </ElFormItem>
        <ElFormItem label="默认值">
          <ElInput :model-value="String(field.defaultValue ?? '')" placeholder="默认值" @update:model-value="(v) => updateField({ defaultValue: v || undefined })" />
        </ElFormItem>
        <ElFormItem label="宽度">
          <ElInputNumber :model-value="field.width ?? 120" :min="40" :max="600" @update:model-value="(v) => updateField({ width: v ?? undefined })" />
        </ElFormItem>
        <ElFormItem label="顺序">
          <ElInputNumber :model-value="field.order" :min="0" :max="999" @update:model-value="(v) => updateField({ order: v })" />
        </ElFormItem>
      </div>

      <ElDivider />

      <template v-if="field.type === 'boolean'">
        <h4>布尔字段配置</h4>
        <div class="form-grid">
          <ElFormItem label="展示模式">
            <ElRadioGroup
              :model-value="field.switchMode || 'switch'"
              @update:model-value="(v: unknown) => updateField({ switchMode: v === 'switch' ? undefined : 'radio' })"
            >
              <ElRadio value="switch">开关</ElRadio>
              <ElRadio value="radio">单选</ElRadio>
            </ElRadioGroup>
          </ElFormItem>
        </div>
        <div class="form-grid">
          <ElFormItem label="True 标签">
            <ElInput
              :model-value="field.trueLabel || '是'"
              placeholder="默认：是"
              @update:model-value="(v) => updateField({ trueLabel: v === '是' ? undefined : v })"
            />
          </ElFormItem>
          <ElFormItem label="False 标签">
            <ElInput
              :model-value="field.falseLabel || '否'"
              placeholder="默认：否"
              @update:model-value="(v) => updateField({ falseLabel: v === '否' ? undefined : v })"
            />
          </ElFormItem>
        </div>
        <div class="form-grid">
          <ElFormItem label="True 样式">
            <ElInput
              :model-value="field.trueLabelClass || ''"
              placeholder="CSS 类名，如 text-red-500"
              @update:model-value="(v) => updateField({ trueLabelClass: v || undefined })"
            />
          </ElFormItem>
          <ElFormItem label="False 样式">
            <ElInput
              :model-value="field.falseLabelClass || ''"
              placeholder="CSS 类名，如 text-green-500"
              @update:model-value="(v) => updateField({ falseLabelClass: v || undefined })"
            />
          </ElFormItem>
        </div>
        <ElDivider />
      </template>

      <template v-if="field.type === 'number' || field.type === 'currency' || field.type === 'percent'">
        <h4>数值字段配置</h4>
        <div class="form-grid">
          <ElFormItem label="小数位数">
            <ElInputNumber
              :model-value="field.decimal ?? (field.type === 'currency' ? 2 : 0)"
              :min="0"
              :max="10"
              @update:model-value="(v) => updateField({ decimal: v ?? undefined })"
            />
          </ElFormItem>
          <ElFormItem label="小数模式">
            <ElSelect
              :model-value="field.decimalMode ?? 'fixed'"
              @update:model-value="(v) => updateField({ decimalMode: v as 'fixed' | 'max' | 'range', maxDecimal: v !== 'range' ? undefined : field.maxDecimal })"
            >
              <ElOption value="fixed" label="固定（补零对齐）" />
              <ElOption value="max" label="最大（末尾零省略）" />
              <ElOption value="range" label="范围（最少~最多）" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem v-if="field.decimalMode === 'range'" label="最多位数">
            <ElInputNumber
              :model-value="field.maxDecimal ?? (field.decimal ?? 0) + 2"
              :min="field.decimal ?? 0"
              :max="10"
              @update:model-value="(v) => updateField({ maxDecimal: v ?? undefined })"
            />
          </ElFormItem>
        </div>
        <ElDivider />
      </template>

      <h4>占位文本与描述</h4>
      <ElFormItem label="占位符">
        <ElInput :model-value="field.placeholder" @update:model-value="(v) => updateField({ placeholder: v })" />
      </ElFormItem>
      <ElFormItem label="描述">
        <ElInput :model-value="field.description" type="textarea" :rows="2" @update:model-value="(v) => updateField({ description: v })" />
      </ElFormItem>
    </ElForm>
  </div>
</template>

<style scoped>
.field-form-panel {
  max-width: 720px;
}
.panel-title {
  margin: 0 0 var(--sg-spacing-8) 0;
  font-size: var(--sg-font-size-lg);
  font-weight: 600;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 var(--sg-spacing-8);
}
</style>
