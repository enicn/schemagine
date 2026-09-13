<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  ElButton, ElForm, ElFormItem, ElInput, ElSelect, ElOption,
  ElSwitch, ElDivider, ElTag, ElCollapse, ElCollapseItem,
} from 'element-plus'
import type {
  ModuleSchema, FieldSchema, ListAction, ListActionType,
  RowActionConfig, RowActionType, ActionTargetConfig,
  ActionFilterRule, ActionFormField,
} from '@/types'

const props = defineProps<{
  schema: ModuleSchema
}>()

const emit = defineEmits<{
  update: [payload: ModuleSchema]
}>()

const listActionTypes: { value: ListActionType; label: string }[] = [
  { value: 'sort', label: '排序' },
  { value: 'popup-schema', label: '弹出模块' },
  { value: 'form-submit', label: '表单提交' },
  { value: 'custom', label: '自定义' },
]

const rowActionTypes: { value: RowActionType; label: string }[] = [
  { value: 'popup-schema', label: '弹出模块' },
  { value: 'form-submit', label: '表单提交' },
  { value: 'export', label: '导出' },
  { value: 'custom', label: '自定义' },
]

const apiMethodOptions = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'DELETE', label: 'DELETE' },
]

const filterOperatorOptions = [
  { value: 'eq', label: '等于' },
  { value: 'neq', label: '不等于' },
  { value: 'like', label: '包含' },
  { value: 'in', label: '在...中' },
  { value: 'between', label: '介于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lte', label: '小于等于' },
]

const valueSourceOptions = [
  { value: 'static', label: '静态值' },
  { value: 'from-current-filter', label: '当前筛选' },
  { value: 'from-row-context', label: '行上下文' },
]

const formFieldTypeOptions = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'select', label: '选择' },
  { value: 'textarea', label: '多行文本' },
]

function updateSchema(): void {
  emit('update', { ...props.schema })
}

const currentListActions = computed({
  get: () => props.schema.listActions ?? [],
  set: (val: ListAction[]) => {
    props.schema.listActions = val
    updateSchema()
  },
})

function addListAction(): void {
  const actions = [...currentListActions.value]
  const newAction: ListAction = {
    id: `action-${Date.now()}`,
    type: 'custom',
    label: '新动作',
    order: actions.length,
  }
  actions.push(newAction)
  currentListActions.value = actions
}

function removeListAction(index: number): void {
  const actions = currentListActions.value.filter((_, i) => i !== index)
  currentListActions.value = actions
}

function moveListAction(index: number, direction: 'up' | 'down'): void {
  const actions = [...currentListActions.value]
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= actions.length) return
  const temp = actions[index]!
  actions[index] = actions[targetIndex]!
  actions[targetIndex] = temp
  currentListActions.value = actions
}

function updateListAction(index: number, partial: Partial<ListAction>): void {
  const actions = [...currentListActions.value]
  if (!actions[index]) return
  actions[index] = { ...actions[index]!, ...partial }
  currentListActions.value = actions
}

const fieldsWithActions = computed(() => {
  return props.schema.fields.filter(f => f.type === 'action' || f.rowAction)
})

function getFieldRowAction(field: FieldSchema): RowActionConfig | null {
  return field.rowAction ?? null
}

function setFieldRowAction(field: FieldSchema, config: RowActionConfig | null): void {
  const fields = [...props.schema.fields]
  const idx = fields.findIndex(f => f.key === field.key)
  if (idx < 0 || !fields[idx]) return
  fields[idx] = { ...fields[idx]!, rowAction: config ?? undefined }
  props.schema.fields = fields
  updateSchema()
}

function addRowAction(field: FieldSchema): void {
  setFieldRowAction(field, {
    type: 'custom',
    label: '操作',
  })
}

function removeRowAction(field: FieldSchema): void {
  setFieldRowAction(field, null)
}

function updateRowAction(field: FieldSchema, partial: Partial<RowActionConfig>): void {
  const current = getFieldRowAction(field)
  if (current) {
    setFieldRowAction(field, { ...current, ...partial })
  }
}

function addFilterRule(target: ActionTargetConfig): void {
  const rules = target.filters ?? []
  const newRule: ActionFilterRule = {
    field: '',
    operator: 'eq',
    valueSource: 'static',
  }
  rules.push(newRule)
  target.filters = [...rules]
  updateSchema()
}

function removeFilterRule(target: ActionTargetConfig, index: number): void {
  const rules = target.filters ?? []
  target.filters = rules.filter((_, i) => i !== index)
  updateSchema()
}

function updateFilterRule(target: ActionTargetConfig, index: number, partial: Partial<ActionFilterRule>): void {
  const rules = [...(target.filters ?? [])]
  if (!rules[index]) return
  rules[index] = { ...rules[index]!, ...partial }
  target.filters = rules
  updateSchema()
}

function addFormField(target: ActionTargetConfig): void {
  const fields = target.formFields ?? []
  const newField: ActionFormField = {
    key: '',
    label: '',
    type: 'text',
  }
  fields.push(newField)
  target.formFields = [...fields]
  updateSchema()
}

function removeFormField(target: ActionTargetConfig, index: number): void {
  const fields = target.formFields ?? []
  target.formFields = fields.filter((_, i) => i !== index)
  updateSchema()
}

function updateFormField(target: ActionTargetConfig, index: number, partial: Partial<ActionFormField>): void {
  const fields = [...(target.formFields ?? [])]
  if (!fields[index]) return
  fields[index] = { ...fields[index]!, ...partial }
  target.formFields = fields
  updateSchema()
}

function getTarget(action: ListAction | RowActionConfig): ActionTargetConfig {
  if (!action.target) {
    action.target = {}
  }
  return action.target
}

const expandedRowActionFields = ref<string[]>([])
</script>

<template>
  <div class="actions-config-panel">
    <ElCollapse v-model="expandedRowActionFields">
      <ElCollapseItem title="列表级动作" name="list-actions">
        <div class="section-content">
          <div class="section-header">
            <span class="section-desc">在模块工具栏中显示的动作按钮</span>
            <ElButton size="small" type="primary" @click="addListAction">+ 添加列表动作</ElButton>
          </div>

          <div v-if="currentListActions.length === 0" class="empty-hint">
            暂无列表级动作，点击上方按钮添加
          </div>

          <div v-for="(action, index) in currentListActions" :key="action.id" class="action-card">
            <div class="action-card-header">
              <div class="action-card-title">
                <ElTag size="small" type="info">{{ index + 1 }}</ElTag>
                <span class="action-label">{{ action.label || '未命名动作' }}</span>
              </div>
              <div class="action-card-tools">
                <ElButton size="small" link :disabled="index === 0" @click="moveListAction(index, 'up')">上移</ElButton>
                <ElButton size="small" link :disabled="index === currentListActions.length - 1" @click="moveListAction(index, 'down')">下移</ElButton>
                <ElButton size="small" type="danger" link @click="removeListAction(index)">删除</ElButton>
              </div>
            </div>

            <ElForm label-position="top" size="small" class="action-form">
              <div class="form-grid">
                <ElFormItem label="动作 ID">
                  <ElInput :model-value="action.id" disabled />
                </ElFormItem>
                <ElFormItem label="标签">
                  <ElInput :model-value="action.label" @update:model-value="(v: string) => updateListAction(index, { label: v })" />
                </ElFormItem>
                <ElFormItem label="类型">
                  <ElSelect :model-value="action.type" @update:model-value="(v: ListActionType) => updateListAction(index, { type: v })">
                    <ElOption v-for="t in listActionTypes" :key="t.value" :label="t.label" :value="t.value" />
                  </ElSelect>
                </ElFormItem>
                <ElFormItem label="图标 CSS 类名">
                  <ElInput :model-value="action.icon ?? ''" placeholder="可选" @update:model-value="(v: string) => updateListAction(index, { icon: v || undefined })" />
                </ElFormItem>
              </div>

              <ElDivider />
              <h4 class="subsection-title">目标配置</h4>
              <div class="form-grid">
                <ElFormItem label="目标模块 ID">
                  <ElInput :model-value="getTarget(action).moduleId ?? ''" placeholder="可选" @update:model-value="(v: string) => { getTarget(action).moduleId = v || undefined; updateSchema() }" />
                </ElFormItem>
                <ElFormItem label="API 端点">
                  <ElInput :model-value="getTarget(action).apiEndpoint ?? ''" placeholder="可选" @update:model-value="(v: string) => { getTarget(action).apiEndpoint = v || undefined; updateSchema() }" />
                </ElFormItem>
                <ElFormItem label="API 方法">
                  <ElSelect :model-value="getTarget(action).apiMethod ?? 'GET'" @update:model-value="(v: 'GET' | 'POST' | 'PUT' | 'DELETE') => { getTarget(action).apiMethod = v; updateSchema() }">
                    <ElOption v-for="m in apiMethodOptions" :key="m.value" :label="m.label" :value="m.value" />
                  </ElSelect>
                </ElFormItem>
                <ElFormItem label="导出模板">
                  <ElInput :model-value="getTarget(action).exportTemplate ?? ''" placeholder="可选" @update:model-value="(v: string) => { getTarget(action).exportTemplate = v || undefined; updateSchema() }" />
                </ElFormItem>
              </div>

              <ElDivider />
              <div class="subsection-header">
                <h4 class="subsection-title">筛选规则 ({{ getTarget(action).filters?.length ?? 0 }})</h4>
                <ElButton size="small" type="primary" link @click="addFilterRule(getTarget(action))">+ 添加规则</ElButton>
              </div>
              <div v-for="(rule, ri) in getTarget(action).filters" :key="ri" class="filter-rule-row">
                <ElFormItem label="字段">
                  <ElInput :model-value="rule.field" placeholder="字段名" size="small" @update:model-value="(v: string) => updateFilterRule(getTarget(action), ri, { field: v })" />
                </ElFormItem>
                <ElFormItem label="操作符">
                  <ElSelect :model-value="rule.operator" size="small" @update:model-value="(v: ActionFilterRule['operator']) => updateFilterRule(getTarget(action), ri, { operator: v })">
                    <ElOption v-for="o in filterOperatorOptions" :key="o.value" :label="o.label" :value="o.value" />
                  </ElSelect>
                </ElFormItem>
                <ElFormItem label="值来源">
                  <ElSelect :model-value="rule.valueSource" size="small" @update:model-value="(v: ActionFilterRule['valueSource']) => updateFilterRule(getTarget(action), ri, { valueSource: v })">
                    <ElOption v-for="s in valueSourceOptions" :key="s.value" :label="s.label" :value="s.value" />
                  </ElSelect>
                </ElFormItem>
                <ElFormItem v-if="rule.valueSource === 'static'" label="静态值">
                  <ElInput :model-value="String(rule.staticValue ?? '')" size="small" @update:model-value="(v: string) => updateFilterRule(getTarget(action), ri, { staticValue: v || undefined })" />
                </ElFormItem>
                <ElFormItem v-if="rule.valueSource === 'from-row-context'" label="上下文字段">
                  <ElInput :model-value="rule.contextField ?? ''" size="small" @update:model-value="(v: string) => updateFilterRule(getTarget(action), ri, { contextField: v || undefined })" />
                </ElFormItem>
                <ElButton size="small" type="danger" link @click="removeFilterRule(getTarget(action), ri)">删除</ElButton>
              </div>

              <ElDivider />
              <div class="subsection-header">
                <h4 class="subsection-title">表单字段 ({{ getTarget(action).formFields?.length ?? 0 }})</h4>
                <ElButton size="small" type="primary" link @click="addFormField(getTarget(action))">+ 添加表单字段</ElButton>
              </div>
              <div v-for="(ff, fi) in getTarget(action).formFields" :key="fi" class="form-field-row">
                <ElFormItem label="Key">
                  <ElInput :model-value="ff.key" size="small" @update:model-value="(v: string) => updateFormField(getTarget(action), fi, { key: v })" />
                </ElFormItem>
                <ElFormItem label="标签">
                  <ElInput :model-value="ff.label" size="small" @update:model-value="(v: string) => updateFormField(getTarget(action), fi, { label: v })" />
                </ElFormItem>
                <ElFormItem label="类型">
                  <ElSelect :model-value="ff.type" size="small" @update:model-value="(v: ActionFormField['type']) => updateFormField(getTarget(action), fi, { type: v })">
                    <ElOption v-for="t in formFieldTypeOptions" :key="t.value" :label="t.label" :value="t.value" />
                  </ElSelect>
                </ElFormItem>
                <ElFormItem label="必填">
                  <ElSwitch :model-value="!!ff.required" size="small" @update:model-value="(v: unknown) => updateFormField(getTarget(action), fi, { required: Boolean(v) || undefined })" />
                </ElFormItem>
                <ElButton size="small" type="danger" link @click="removeFormField(getTarget(action), fi)">删除</ElButton>
              </div>
            </ElForm>
          </div>
        </div>
      </ElCollapseItem>

      <ElCollapseItem title="行级动作" name="row-actions">
        <div class="section-content">
          <div class="section-desc">在数据行上显示的操作按钮（基于 type=action 的字段）</div>

          <div v-if="fieldsWithActions.length === 0" class="empty-hint">
            暂无配置行级动作的字段。请先在「字段编辑」中添加 type 为 action 的字段。
          </div>

          <div v-for="field in fieldsWithActions" :key="field.key" class="action-card">
            <div class="action-card-header">
              <div class="action-card-title">
                <ElTag size="small" type="warning" class="field-tag">{{ field.key }}</ElTag>
                <span class="action-label">{{ field.label }}</span>
              </div>
              <div class="action-card-tools">
                <template v-if="getFieldRowAction(field)">
                  <ElButton size="small" type="danger" link @click="removeRowAction(field)">移除动作</ElButton>
                </template>
                <template v-else>
                  <ElButton size="small" type="primary" link @click="addRowAction(field)">+ 添加行动作</ElButton>
                </template>
              </div>
            </div>

            <template v-if="getFieldRowAction(field)">
              <ElForm label-position="top" size="small" class="action-form">
                <div class="form-grid">
                  <ElFormItem label="标签">
                    <ElInput
                      :model-value="getFieldRowAction(field)!.label"
                      @update:model-value="(v: string) => updateRowAction(field, { label: v })"
                    />
                  </ElFormItem>
                  <ElFormItem label="类型">
                    <ElSelect
                      :model-value="getFieldRowAction(field)!.type"
                      @update:model-value="(v: RowActionType) => updateRowAction(field, { type: v })"
                    >
                      <ElOption v-for="t in rowActionTypes" :key="t.value" :label="t.label" :value="t.value" />
                    </ElSelect>
                  </ElFormItem>
                  <ElFormItem label="图标 CSS 类名">
                    <ElInput
                      :model-value="getFieldRowAction(field)!.icon ?? ''"
                      placeholder="可选"
                      @update:model-value="(v: string) => updateRowAction(field, { icon: v || undefined })"
                    />
                  </ElFormItem>
                </div>

                <ElDivider />
                <h4 class="subsection-title">目标配置</h4>
                <div class="form-grid">
                  <ElFormItem label="目标模块 ID">
                    <ElInput
                      :model-value="getTarget(getFieldRowAction(field)!).moduleId ?? ''"
                      placeholder="可选"
                      @update:model-value="(v: string) => { getTarget(getFieldRowAction(field)!).moduleId = v || undefined; updateSchema() }"
                    />
                  </ElFormItem>
                  <ElFormItem label="导出模板">
                    <ElInput
                      :model-value="getTarget(getFieldRowAction(field)!).exportTemplate ?? ''"
                      placeholder="可选"
                      @update:model-value="(v: string) => { getTarget(getFieldRowAction(field)!).exportTemplate = v || undefined; updateSchema() }"
                    />
                  </ElFormItem>
                  <ElFormItem label="API 端点">
                    <ElInput
                      :model-value="getTarget(getFieldRowAction(field)!).apiEndpoint ?? ''"
                      placeholder="可选"
                      @update:model-value="(v: string) => { getTarget(getFieldRowAction(field)!).apiEndpoint = v || undefined; updateSchema() }"
                    />
                  </ElFormItem>
                  <ElFormItem label="API 方法">
                    <ElSelect
                      :model-value="getTarget(getFieldRowAction(field)!).apiMethod ?? 'GET'"
                      @update:model-value="(v: 'GET' | 'POST' | 'PUT' | 'DELETE') => { getTarget(getFieldRowAction(field)!).apiMethod = v; updateSchema() }"
                    >
                      <ElOption v-for="m in apiMethodOptions" :key="m.value" :label="m.label" :value="m.value" />
                    </ElSelect>
                  </ElFormItem>
                </div>

                <ElDivider />
                <div class="subsection-header">
                  <h4 class="subsection-title">筛选规则 ({{ getTarget(getFieldRowAction(field)!).filters?.length ?? 0 }})</h4>
                  <ElButton size="small" type="primary" link @click="addFilterRule(getTarget(getFieldRowAction(field)!))">+ 添加规则</ElButton>
                </div>
                <div v-for="(rule, ri) in getTarget(getFieldRowAction(field)!).filters" :key="ri" class="filter-rule-row">
                  <ElFormItem label="字段">
                    <ElInput :model-value="rule.field" placeholder="字段名" size="small" @update:model-value="(v: string) => updateFilterRule(getTarget(getFieldRowAction(field)!), ri, { field: v })" />
                  </ElFormItem>
                  <ElFormItem label="操作符">
                    <ElSelect :model-value="rule.operator" size="small" @update:model-value="(v: ActionFilterRule['operator']) => updateFilterRule(getTarget(getFieldRowAction(field)!), ri, { operator: v })">
                      <ElOption v-for="o in filterOperatorOptions" :key="o.value" :label="o.label" :value="o.value" />
                    </ElSelect>
                  </ElFormItem>
                  <ElFormItem label="值来源">
                    <ElSelect :model-value="rule.valueSource" size="small" @update:model-value="(v: ActionFilterRule['valueSource']) => updateFilterRule(getTarget(getFieldRowAction(field)!), ri, { valueSource: v })">
                      <ElOption v-for="s in valueSourceOptions" :key="s.value" :label="s.label" :value="s.value" />
                    </ElSelect>
                  </ElFormItem>
                  <ElFormItem v-if="rule.valueSource === 'static'" label="静态值">
                    <ElInput :model-value="String(rule.staticValue ?? '')" size="small" @update:model-value="(v: string) => updateFilterRule(getTarget(getFieldRowAction(field)!), ri, { staticValue: v || undefined })" />
                  </ElFormItem>
                  <ElFormItem v-if="rule.valueSource === 'from-row-context'" label="上下文字段">
                    <ElInput :model-value="rule.contextField ?? ''" size="small" @update:model-value="(v: string) => updateFilterRule(getTarget(getFieldRowAction(field)!), ri, { contextField: v || undefined })" />
                  </ElFormItem>
                  <ElButton size="small" type="danger" link @click="removeFilterRule(getTarget(getFieldRowAction(field)!), ri)">删除</ElButton>
                </div>

                <ElDivider />
                <div class="subsection-header">
                  <h4 class="subsection-title">表单字段 ({{ getTarget(getFieldRowAction(field)!).formFields?.length ?? 0 }})</h4>
                  <ElButton size="small" type="primary" link @click="addFormField(getTarget(getFieldRowAction(field)!))">+ 添加表单字段</ElButton>
                </div>
                <div v-for="(ff, fi) in getTarget(getFieldRowAction(field)!).formFields" :key="fi" class="form-field-row">
                  <ElFormItem label="Key">
                    <ElInput :model-value="ff.key" size="small" @update:model-value="(v: string) => updateFormField(getTarget(getFieldRowAction(field)!), fi, { key: v })" />
                  </ElFormItem>
                  <ElFormItem label="标签">
                    <ElInput :model-value="ff.label" size="small" @update:model-value="(v: string) => updateFormField(getTarget(getFieldRowAction(field)!), fi, { label: v })" />
                  </ElFormItem>
                  <ElFormItem label="类型">
                    <ElSelect :model-value="ff.type" size="small" @update:model-value="(v: ActionFormField['type']) => updateFormField(getTarget(getFieldRowAction(field)!), fi, { type: v })">
                      <ElOption v-for="t in formFieldTypeOptions" :key="t.value" :label="t.label" :value="t.value" />
                    </ElSelect>
                  </ElFormItem>
                  <ElFormItem label="必填">
                    <ElSwitch :model-value="!!ff.required" size="small" @update:model-value="(v: unknown) => updateFormField(getTarget(getFieldRowAction(field)!), fi, { required: Boolean(v) || undefined })" />
                  </ElFormItem>
                  <ElButton size="small" type="danger" link @click="removeFormField(getTarget(getFieldRowAction(field)!), fi)">删除</ElButton>
                </div>
              </ElForm>
            </template>
          </div>
        </div>
      </ElCollapseItem>
    </ElCollapse>
  </div>
</template>

<style scoped>
.actions-config-panel {
  max-width: 860px;
}
.section-content {
  padding: var(--sg-spacing-4) 0;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sg-spacing-6);
}
.section-desc {
  font-size: var(--sg-font-size-md);
  color: var(--sg-text-color-secondary);
}
.empty-hint {
  text-align: center;
  padding: var(--sg-spacing-12);
  color: var(--sg-text-color-secondary);
  font-size: var(--sg-font-size-md);
}
.action-card {
  border: 1px solid var(--sg-border-color-light);
  border-radius: var(--sg-radius-lg);
  padding: var(--sg-spacing-6) var(--sg-spacing-8);
  margin-bottom: var(--sg-spacing-6);
  background: var(--sg-fill-color-lighter);
}
.action-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sg-spacing-6);
}
.action-card-title {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-4);
}
.action-label {
  font-weight: 500;
  font-size: var(--sg-font-size-md);
}
.action-card-tools {
  display: flex;
  gap: var(--sg-spacing-2);
}
.action-form {
  max-width: 100%;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 var(--sg-spacing-8);
}
.subsection-title {
  margin: 0 0 var(--sg-spacing-4) 0;
  font-size: var(--sg-font-size-md);
  font-weight: 600;
}
.subsection-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.filter-rule-row,
.form-field-row {
  display: flex;
  align-items: flex-start;
  gap: var(--sg-spacing-4);
  padding: var(--sg-spacing-4);
  background: var(--sg-bg-color);
  border: 1px solid var(--sg-border-color-extra-light);
  border-radius: var(--sg-radius-md);
  margin-bottom: var(--sg-spacing-3);
  flex-wrap: wrap;
}
.filter-rule-row :deep(.el-form-item),
.form-field-row :deep(.el-form-item) {
  margin-bottom: 0;
  min-width: 120px;
  flex: 1;
}
.field-tag {
  font-family: monospace;
}
</style>