<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElInput, ElSelect, ElOption, ElButton, ElTag, ElMessage } from 'element-plus'
import type { ModuleSchema, FormulaFieldConfig } from '@/types'
import { detectCycle } from './formulaUtils'

const props = defineProps<{
  schema: ModuleSchema
}>()

const emit = defineEmits<{
  update: [payload: ModuleSchema]
}>()

const nonFormulaFields = computed(() => {
  return props.schema.fields.filter(f => f.type !== 'formula')
})

const formulaFields = computed(() => {
  return props.schema.fields.filter(f => f.type === 'formula')
})

const editingConfig = ref<FormulaFieldConfig>({
  fieldKey: '',
  expression: '',
  dependencies: [],
  resultType: 'number',
})

const expressionPreview = computed(() => {
  if (!editingConfig.value.expression) return ''
  try {
    const deps = editingConfig.value.dependencies
    const context: Record<string, number> = {}
    for (const dep of deps) {
      context[dep] = 1
    }
    const keys = Object.keys(context)
    const values = Object.values(context)
    const fn = new Function(...keys, `"use strict"; return (${editingConfig.value.expression});`)
    const result = fn(...values)
    return `结果: ${result}`
  } catch {
    return '表达式无效'
  }
})

function selectFormulaField(fieldKey: string): void {
  const field = props.schema.fields.find(f => f.key === fieldKey)
  if (!field) return
  const existing = props.schema.formulaConfig?.fields?.find(c => c.fieldKey === fieldKey)
  editingConfig.value = existing
    ? { ...existing }
    : {
        fieldKey,
        expression: '',
        dependencies: [],
        resultType: 'number',
      }
}

function toggleDependency(dep: string): void {
  const deps = editingConfig.value.dependencies
  const index = deps.indexOf(dep)
  if (index >= 0) {
    deps.splice(index, 1)
  } else {
    deps.push(dep)
  }
  editingConfig.value = { ...editingConfig.value, dependencies: [...deps] }
}

function saveFormulaConfig(): void {
  if (!editingConfig.value.fieldKey) {
    ElMessage.warning('请先选择一个公式字段')
    return
  }
  if (!editingConfig.value.expression.trim()) {
    ElMessage.warning('请输入公式表达式')
    return
  }
  if (editingConfig.value.dependencies.length === 0) {
    ElMessage.warning('请选择至少一个依赖字段')
    return
  }

  const allConfigs = [...(props.schema.formulaConfig?.fields ?? [])]
  const configIndex = allConfigs.findIndex(c => c.fieldKey === editingConfig.value.fieldKey)
  if (configIndex >= 0) {
    allConfigs[configIndex] = { ...editingConfig.value }
  } else {
    allConfigs.push({ ...editingConfig.value })
  }

  const cycle = detectCycle(editingConfig.value.fieldKey, allConfigs)
  if (cycle.hasCycle) {
    ElMessage.error(`检测到循环依赖: ${cycle.cyclePath.join(' → ')}`)
    return
  }

  const updatedSchema: ModuleSchema = {
    ...props.schema,
    formulaConfig: {
      enabled: true,
      fields: allConfigs,
      maxDepth: 10,
      circularDependencyCheck: true,
    },
  }
  emit('update', updatedSchema)
  ElMessage.success('公式配置已保存')
}

function removeFormulaConfig(fieldKey: string): void {
  const allConfigs = (props.schema.formulaConfig?.fields ?? []).filter(c => c.fieldKey !== fieldKey)
  const updatedSchema: ModuleSchema = {
    ...props.schema,
    formulaConfig: allConfigs.length > 0
      ? { ...props.schema.formulaConfig!, fields: allConfigs }
      : undefined,
  }
  emit('update', updatedSchema)
  if (editingConfig.value.fieldKey === fieldKey) {
    editingConfig.value = { fieldKey: '', expression: '', dependencies: [], resultType: 'number' }
  }
  ElMessage.success('公式配置已移除')
}
</script>

<template>
  <div class="formula-builder">
    <div class="builder-layout">
      <div class="builder-sidebar">
        <h4>公式字段</h4>
        <div v-if="formulaFields.length === 0" class="empty-hint">
          当前没有公式类型的字段，请在字段编辑中修改字段类型为 "公式"
        </div>
        <div
          v-for="field in formulaFields"
          :key="field.key"
          class="formula-field-item"
          :class="{ active: editingConfig.fieldKey === field.key }"
          @click="selectFormulaField(field.key)"
        >
          <span>{{ field.label }}</span>
          <ElTag v-if="props.schema.formulaConfig?.fields?.find(c => c.fieldKey === field.key)" size="small" type="success">已配置</ElTag>
          <ElTag v-else size="small" type="info">未配置</ElTag>
        </div>
      </div>

      <div class="builder-main">
        <div v-if="!editingConfig.fieldKey" class="empty-hint">
          请从左侧选择一个公式字段进行配置
        </div>

        <template v-else>
          <h4>配置: {{ schema.fields.find(f => f.key === editingConfig.fieldKey)?.label }}</h4>

          <div class="form-group">
            <label>公式表达式</label>
            <ElInput
              v-model="editingConfig.expression"
              placeholder="例如: amount * 0.13"
              class="expression-input"
            />
            <p class="hint">使用依赖字段的 key 作为变量名</p>
          </div>

          <div class="form-group">
            <label>结果类型</label>
            <ElSelect v-model="editingConfig.resultType">
              <ElOption label="数字" value="number" />
              <ElOption label="文本" value="text" />
              <ElOption label="布尔" value="boolean" />
              <ElOption label="日期" value="date" />
            </ElSelect>
          </div>

          <div class="form-group">
            <label>依赖字段（选择公式计算所需的输入字段）</label>
            <div class="dependency-grid">
              <div
                v-for="field in nonFormulaFields"
                :key="field.key"
                class="dep-item"
                :class="{ selected: editingConfig.dependencies.includes(field.key) }"
                @click="toggleDependency(field.key)"
              >
                <span class="dep-label">{{ field.label }}</span>
                <span class="dep-key">{{ field.key }}</span>
              </div>
            </div>
          </div>

          <div v-if="expressionPreview" class="preview-box">
            <h5>表达式预览（依赖值=1 时的结果）</h5>
            <code>{{ editingConfig.expression }}</code>
            <span class="preview-result">{{ expressionPreview }}</span>
          </div>

          <div class="form-actions">
            <ElButton type="primary" @click="saveFormulaConfig">保存公式配置</ElButton>
            <ElButton v-if="props.schema.formulaConfig?.fields?.find(c => c.fieldKey === editingConfig.fieldKey)" type="danger" plain @click="removeFormulaConfig(editingConfig.fieldKey)">移除配置</ElButton>
          </div>
        </template>
      </div>
    </div>

    <div v-if="props.schema.formulaConfig?.fields && props.schema.formulaConfig.fields.length > 0" class="config-list">
      <h4>已配置的公式</h4>
      <div v-for="cfg in props.schema.formulaConfig.fields" :key="cfg.fieldKey" class="config-item">
        <div class="config-info">
          <strong>{{ schema.fields.find(f => f.key === cfg.fieldKey)?.label || cfg.fieldKey }}</strong>
          <code>{{ cfg.expression }}</code>
          <span class="config-deps">依赖: {{ cfg.dependencies.join(', ') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.formula-builder {
  max-width: 900px;
}
.builder-layout {
  display: flex;
  gap: var(--sg-spacing-12);
}
.builder-sidebar {
  width: 220px;
  flex-shrink: 0;
}
.builder-sidebar h4 {
  margin: 0 0 var(--sg-spacing-4) 0;
  font-size: var(--sg-font-size-lg);
}
.formula-field-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sg-spacing-4) var(--sg-spacing-6);
  cursor: pointer;
  border-radius: var(--sg-radius-md);
  border: 1px solid var(--sg-border-color-lighter);
  margin-bottom: var(--sg-spacing-2);
  font-size: var(--sg-font-size-md);
}
.formula-field-item:hover {
  background: var(--sg-fill-color-light);
}
.formula-field-item.active {
  border-color: var(--sg-color-primary);
  background: var(--sg-color-primary-light-9);
}
.builder-main {
  flex: 1;
}
.builder-main h4 {
  margin: 0 0 var(--sg-spacing-8) 0;
  font-size: var(--sg-font-size-lg);
}
.form-group {
  margin-bottom: var(--sg-spacing-8);
}
.form-group label {
  display: block;
  font-size: var(--sg-font-size-md);
  font-weight: 500;
  margin-bottom: var(--sg-spacing-3);
  color: var(--sg-text-color-regular);
}
.hint {
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-secondary);
  margin: var(--sg-spacing-2) 0 0;
}
.expression-input :deep(textarea) {
  font-family: 'Courier New', monospace;
  font-size: var(--sg-font-size-lg);
}
.dependency-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sg-spacing-3);
}
.dep-item {
  display: flex;
  flex-direction: column;
  padding: var(--sg-spacing-3) var(--sg-spacing-6);
  border: 1px solid var(--sg-border-color);
  border-radius: var(--sg-radius-md);
  cursor: pointer;
  font-size: var(--sg-font-size-base);
  background: var(--sg-bg-color);
}
.dep-item:hover {
  border-color: var(--sg-color-primary);
}
.dep-item.selected {
  border-color: var(--sg-color-success);
  background: var(--sg-color-success-light-9);
}
.dep-label {
  font-weight: 500;
}
.dep-key {
  color: var(--sg-text-color-secondary);
  font-size: var(--sg-font-size-sm);
}
.preview-box {
  padding: var(--sg-spacing-6);
  background: var(--sg-fill-color-light);
  border-radius: var(--sg-radius-md);
  margin-bottom: var(--sg-spacing-8);
}
.preview-box h5 {
  margin: 0 0 var(--sg-spacing-4) 0;
  font-size: var(--sg-font-size-md);
}
.preview-box code {
  display: block;
  font-family: 'Courier New', monospace;
  padding: var(--sg-spacing-2) var(--sg-spacing-4);
  background: var(--sg-bg-color);
  border: 1px solid var(--sg-border-color-light);
  border-radius: var(--sg-radius-sm);
  margin-bottom: var(--sg-spacing-2);
}
.preview-result {
  color: var(--sg-color-success);
  font-weight: 600;
}
.form-actions {
  display: flex;
  gap: var(--sg-spacing-4);
}
.config-list {
  margin-top: var(--sg-spacing-12);
  padding-top: var(--sg-spacing-8);
  border-top: 1px solid var(--sg-border-color-light);
}
.config-list h4 {
  margin: 0 0 var(--sg-spacing-6) 0;
  font-size: var(--sg-font-size-lg);
}
.config-item {
  padding: var(--sg-spacing-4) var(--sg-spacing-6);
  border: 1px solid var(--sg-border-color-lighter);
  border-radius: var(--sg-radius-md);
  margin-bottom: var(--sg-spacing-2);
}
.config-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sg-spacing-6);
  font-size: var(--sg-font-size-md);
}
.config-info code {
  background: var(--sg-fill-color-light);
  padding: 1px var(--sg-spacing-3);
  border-radius: var(--sg-radius-sm);
  font-family: 'Courier New', monospace;
}
.config-deps {
  color: var(--sg-text-color-secondary);
  font-size: var(--sg-font-size-base);
}
.empty-hint {
  color: var(--sg-text-color-secondary);
  font-size: var(--sg-font-size-md);
  padding: var(--sg-spacing-10) 0;
  text-align: center;
}
</style>
