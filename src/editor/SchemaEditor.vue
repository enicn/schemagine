<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  ElButton, ElMessage, ElMessageBox, ElTabs, ElTabPane, ElEmpty,
  ElInput, ElSelect, ElOption, ElSwitch, ElForm, ElFormItem, ElDivider,
} from 'element-plus'
import { useRouter } from 'vue-router'
import { schemaService } from '@/services/api/schemaService'
import type { ModuleSchema, FieldSchema, ModulePermissions, ListEditMode } from '@/types'
import ActionsConfigPanel from './components/ActionsConfigPanel.vue'
import FieldSchemaFormPanel from './components/FieldSchemaFormPanel.vue'
import FormulaBuilder from './components/FormulaBuilder.vue'
import RulesEditorPanel from './components/RulesEditorPanel.vue'
import SchemaPreview from './components/SchemaPreview.vue'
import JsonImportExport from './components/JsonImportExport.vue'
import DependencyGraph from './components/DependencyGraph.vue'

const router = useRouter()

const modules = ref<{ id: string; name: string }[]>([])
const selectedModuleId = ref('')
const currentSchema = ref<ModuleSchema | null>(null)
const selectedFieldKey = ref<string | null>(null)
const activeTab = ref('fields')
const isLoading = ref(false)
const isSaving = ref(false)
const isDirty = ref(false)

const moduleSchemas: Record<string, ModuleSchema> = {}

async function loadModuleList(): Promise<void> {
  isLoading.value = true
  try {
    const res = await schemaService.listModuleIds()
    if (res.success) {
      const ids = res.data
      modules.value = []
      for (const id of ids) {
        const schemaRes = await schemaService.loadModuleSchema(id)
        if (schemaRes.success) {
          moduleSchemas[id] = schemaRes.data
          modules.value.push({ id, name: schemaRes.data.name })
        }
      }
      if (modules.value.length > 0 && !selectedModuleId.value) {
        selectedModuleId.value = modules.value[0]?.id ?? ''
      }
    }
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadModuleList()
})

watch(selectedModuleId, (id) => {
  if (id && moduleSchemas[id]) {
    currentSchema.value = JSON.parse(JSON.stringify(moduleSchemas[id]))
    const schema = currentSchema.value
    if (schema) {
      selectedFieldKey.value = schema.fields[0]?.key ?? null
    }
    isDirty.value = false
  } else if (id) {
    currentSchema.value = null
    selectedFieldKey.value = null
  }
}, { immediate: true })

const sortedFields = computed(() => {
  if (!currentSchema.value) return []
  return [...currentSchema.value.fields].sort((a, b) => a.order - b.order)
})

const selectedField = computed(() => {
  if (!selectedFieldKey.value || !currentSchema.value) return null
  return currentSchema.value.fields.find(f => f.key === selectedFieldKey.value) ?? null
})

function handleFieldSelect(fieldKey: string): void {
  selectedFieldKey.value = fieldKey
}

function handleFieldUpdate(updatedField: FieldSchema): void {
  if (!currentSchema.value) return
  const index = currentSchema.value.fields.findIndex(f => f.key === updatedField.key)
  if (index >= 0) {
    currentSchema.value.fields[index] = updatedField
  }
  isDirty.value = true
}

function handleFieldAdd(): void {
  if (!currentSchema.value) return
  const newKey = `field-${Date.now()}`
  const newField: FieldSchema = {
    id: newKey,
    name: newKey,
    key: newKey,
    type: 'text',
    label: '新字段',
    required: false,
    readonly: false,
    order: currentSchema.value.fields.length,
    visible: true,
    sortable: false,
    filterable: false,
  }
  currentSchema.value.fields.push(newField)
  selectedFieldKey.value = newKey
  isDirty.value = true
}

async function handleFieldDelete(fieldKey: string): Promise<void> {
  if (!currentSchema.value) return
  currentSchema.value.fields = currentSchema.value.fields.filter(f => f.key !== fieldKey)
  if (selectedFieldKey.value === fieldKey) {
    selectedFieldKey.value = currentSchema.value.fields[0]?.key ?? null
  }
  isDirty.value = true
}

function handleFieldMove(fieldKey: string, direction: 'up' | 'down'): void {
  if (!currentSchema.value) return
  const fields = currentSchema.value.fields
  const index = fields.findIndex(f => f.key === fieldKey)
  if (index < 0) return
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= fields.length) return
  const current = fields[index]
  const target = fields[targetIndex]
  if (!current || !target) return
  const temp = current.order
  current.order = target.order
  target.order = temp
  currentSchema.value = { ...currentSchema.value, fields: [...fields] }
  isDirty.value = true
}

function handleSchemaImport(schema: ModuleSchema): void {
  currentSchema.value = schema
  selectedFieldKey.value = schema.fields[0]?.key ?? null
  moduleSchemas[schema.id] = schema
  isDirty.value = true
  ElMessage.success('Schema 已导入')
}

async function handleSave(): Promise<void> {
  if (!currentSchema.value) return
  isSaving.value = true
  try {
    const schema = JSON.parse(JSON.stringify(currentSchema.value))
    const res = await schemaService.saveModuleSchema(schema)
    if (res.success) {
      moduleSchemas[schema.id] = schema
      const mod = modules.value.find(m => m.id === schema.id)
      if (mod) {
        mod.name = schema.name
      }
      isDirty.value = false
      ElMessage.success('Schema 已保存')
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } finally {
    isSaving.value = false
  }
}

async function handleCreateModule(): Promise<void> {
  const newId = `module-new-${Date.now()}`
  const newSchema: ModuleSchema = {
    id: newId,
    name: '新建模块',
    version: '1.0.0',
    moduleType: 'list',
    fields: [],
    permissions: {
      view: true, create: true, edit: true, delete: true, export: true, configure: true,
    },
    defaultViewMode: 'list',
    status: 'active',
  }
  const res = await schemaService.saveModuleSchema(newSchema)
  if (res.success) {
    moduleSchemas[newId] = newSchema
    modules.value.push({ id: newId, name: newSchema.name })
    selectedModuleId.value = newId
    ElMessage.success('新建模块已创建')
  } else {
    ElMessage.error('创建模块失败')
  }
}

async function handleDeleteModule(): Promise<void> {
  if (!currentSchema.value) return
  try {
    await ElMessageBox.confirm(
      `确定要删除模块「${currentSchema.value.name}」吗？此操作不可恢复。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  const id = currentSchema.value.id
  delete moduleSchemas[id]
  modules.value = modules.value.filter(m => m.id !== id)
  if (selectedModuleId.value === id) {
    selectedModuleId.value = modules.value[0]?.id ?? ''
  }
  isDirty.value = false
  ElMessage.success('模块已删除')
}

function handleModuleMetaUpdate(partial: Partial<ModuleSchema>): void {
  if (!currentSchema.value) return
  Object.assign(currentSchema.value, partial)
  const mod = modules.value.find(m => m.id === currentSchema.value!.id)
  if (mod && partial.name) {
    mod.name = partial.name
  }
  isDirty.value = true
}

function handlePermissionsUpdate(key: keyof ModulePermissions, value: boolean): void {
  if (!currentSchema.value) return
  currentSchema.value.permissions[key] = value
  isDirty.value = true
}

function handleBack(): void {
  if (isDirty.value) {
    ElMessage.warning('有未保存的更改')
  }
  router.push('/')
}

const moduleTypeOptions = [
  { value: 'list', label: '列表' },
  { value: 'card', label: '卡片' },
  { value: 'both', label: '列表+卡片' },
]

const viewModeOptions = [
  { value: 'list', label: '列表' },
  { value: 'card', label: '卡片' },
  { value: 'create', label: '新建页' },
]

const listEditModeOptions: Array<{ value: ListEditMode; label: string }> = [
  { value: 'inline-dblclick', label: '双击单元格行内编辑' },
  { value: 'select-then-edit', label: '单击选中 + 右上角编辑' },
]

const statusOptions = [
  { value: 'active', label: '启用' },
  { value: 'disabled', label: '禁用' },
  { value: 'error', label: '异常' },
]
</script>

<template>
  <div class="schema-editor">
    <header class="editor-header">
      <div class="header-left">
        <ElButton size="small" @click="handleBack">&larr; 返回</ElButton>
        <h2 class="editor-title">Schema 编辑器</h2>
      </div>
      <div class="header-right">
        <select v-model="selectedModuleId" class="module-select">
          <option v-for="mod in modules" :key="mod.id" :value="mod.id">
            {{ mod.name }}
          </option>
        </select>
        <ElButton size="small" type="primary" @click="handleCreateModule">+ 新建模块</ElButton>
        <ElButton
          size="small" type="primary"
          :disabled="!isDirty || !currentSchema" :loading="isSaving"
          @click="handleSave"
        >
          保存
        </ElButton>
      </div>
    </header>

    <div v-if="isLoading" class="editor-empty">
      <ElEmpty description="加载中..." />
    </div>

    <div v-else-if="currentSchema" class="editor-body">
      <main class="editor-main">
        <ElTabs v-model="activeTab" class="editor-tabs">
          <ElTabPane label="模块配置" name="config">
            <div class="config-panel">
              <h3 class="panel-title">模块配置: {{ currentSchema.name }}</h3>
              <ElForm label-position="top" size="small">
                <div class="form-grid">
                  <ElFormItem label="模块 ID">
                    <ElInput :model-value="currentSchema.id" disabled />
                  </ElFormItem>
                  <ElFormItem label="模块名称">
                    <ElInput
                      :model-value="currentSchema.name"
                      @update:model-value="(v: string) => handleModuleMetaUpdate({ name: v })"
                    />
                  </ElFormItem>
                  <ElFormItem label="版本">
                    <ElInput
                      :model-value="currentSchema.version"
                      @update:model-value="(v: string) => handleModuleMetaUpdate({ version: v })"
                    />
                  </ElFormItem>
                  <ElFormItem label="模块类型">
                    <ElSelect
                      :model-value="currentSchema.moduleType"
                      @update:model-value="(v: 'list' | 'card' | 'both') => handleModuleMetaUpdate({ moduleType: v })"
                    >
                      <ElOption v-for="opt in moduleTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
                    </ElSelect>
                  </ElFormItem>
                  <ElFormItem label="默认视图">
                    <ElSelect
                      :model-value="currentSchema.defaultViewMode"
                      @update:model-value="(v: 'list' | 'card' | 'create') => handleModuleMetaUpdate({ defaultViewMode: v })"
                    >
                      <ElOption v-for="opt in viewModeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
                    </ElSelect>
                  </ElFormItem>
                  <ElFormItem v-if="currentSchema.moduleType !== 'card'" label="列表编辑模式">
                    <ElSelect
                      :model-value="currentSchema.listEditMode ?? 'inline-dblclick'"
                      @update:model-value="(v: ListEditMode) => handleModuleMetaUpdate({ listEditMode: v })"
                    >
                      <ElOption v-for="opt in listEditModeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
                    </ElSelect>
                  </ElFormItem>
                  <ElFormItem label="状态">
                    <ElSelect
                      :model-value="currentSchema.status"
                      @update:model-value="(v: 'active' | 'disabled' | 'error') => handleModuleMetaUpdate({ status: v })"
                    >
                      <ElOption v-for="opt in statusOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
                    </ElSelect>
                  </ElFormItem>
                </div>

                <ElDivider />

                <h4>模块权限</h4>
                <div class="perm-grid">
                  <ElFormItem label="查看">
                    <ElSwitch :model-value="currentSchema.permissions.view" @update:model-value="(v: unknown) => handlePermissionsUpdate('view', Boolean(v))" />
                  </ElFormItem>
                  <ElFormItem label="新建">
                    <ElSwitch :model-value="currentSchema.permissions.create" @update:model-value="(v: unknown) => handlePermissionsUpdate('create', Boolean(v))" />
                  </ElFormItem>
                  <ElFormItem label="编辑">
                    <ElSwitch :model-value="currentSchema.permissions.edit" @update:model-value="(v: unknown) => handlePermissionsUpdate('edit', Boolean(v))" />
                  </ElFormItem>
                  <ElFormItem label="删除">
                    <ElSwitch :model-value="currentSchema.permissions.delete" @update:model-value="(v: unknown) => handlePermissionsUpdate('delete', Boolean(v))" />
                  </ElFormItem>
                  <ElFormItem label="导出">
                    <ElSwitch :model-value="currentSchema.permissions.export" @update:model-value="(v: unknown) => handlePermissionsUpdate('export', Boolean(v))" />
                  </ElFormItem>
                  <ElFormItem label="配置">
                    <ElSwitch :model-value="currentSchema.permissions.configure" @update:model-value="(v: unknown) => handlePermissionsUpdate('configure', Boolean(v))" />
                  </ElFormItem>
                </div>

                <ElDivider />

                <div class="danger-zone">
                  <ElButton size="small" type="danger" @click="handleDeleteModule">删除此模块</ElButton>
                </div>
              </ElForm>
            </div>
          </ElTabPane>

          <ElTabPane label="字段编辑" name="fields">
            <div class="field-edit-layout">
              <div class="field-list-sidebar">
                <div class="sidebar-header">
                  <h3>字段列表</h3>
                  <ElButton size="small" type="primary" link @click="handleFieldAdd">+ 添加</ElButton>
                </div>
                <div class="field-list">
                  <div
                    v-for="field in sortedFields"
                    :key="field.key"
                    class="field-list-item"
                    :class="{ active: field.key === selectedFieldKey }"
                    @click="handleFieldSelect(field.key)"
                  >
                    <div class="field-item-info">
                      <span class="field-item-label">{{ field.label }}</span>
                      <span class="field-item-key">{{ field.key }} ({{ field.type }})</span>
                    </div>
                    <div class="field-item-actions">
                      <button
                        class="move-btn" title="上移"
                        :disabled="field.order === 0"
                        @click.stop="handleFieldMove(field.key, 'up')"
                      >&#9650;</button>
                      <button
                        class="move-btn" title="下移"
                        :disabled="field.order === sortedFields.length - 1"
                        @click.stop="handleFieldMove(field.key, 'down')"
                      >&#9660;</button>
                      <button
                        class="delete-btn" title="删除"
                        @click.stop="handleFieldDelete(field.key)"
                      >&times;</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="field-form-area">
                <FieldSchemaFormPanel
                  v-if="selectedField"
                  :field="selectedField"
                  :all-fields="currentSchema.fields"
                  @update="handleFieldUpdate"
                />
                <ElEmpty v-else description="选择一个字段进行编辑" />
              </div>
            </div>
          </ElTabPane>

          <ElTabPane label="公式构建" name="formula">
            <FormulaBuilder
              :schema="currentSchema"
              @update="(s: ModuleSchema) => { currentSchema = s; isDirty = true; }"
            />
          </ElTabPane>

          <ElTabPane label="规则编辑" name="rules">
            <RulesEditorPanel
              :schema="currentSchema"
              @update="(s: ModuleSchema) => { currentSchema = s; isDirty = true; }"
            />
          </ElTabPane>

          <ElTabPane label="预览" name="preview">
            <SchemaPreview :schema="currentSchema" />
          </ElTabPane>

          <ElTabPane label="导入/导出" name="import-export">
            <JsonImportExport
              :schema="currentSchema"
              @import="handleSchemaImport"
            />
          </ElTabPane>

          <ElTabPane label="动作配置" name="actions">
            <ActionsConfigPanel
              :schema="currentSchema"
              @update="(s: ModuleSchema) => { currentSchema = s; isDirty = true; }"
            />
          </ElTabPane>

          <ElTabPane label="依赖图" name="graph">
            <DependencyGraph
              :schema="currentSchema"
              @navigate-to-field="(key: string) => { selectedFieldKey = key; activeTab = 'fields'; }"
            />
          </ElTabPane>
        </ElTabs>
      </main>
    </div>

    <div v-else class="editor-empty">
      <ElEmpty description="请选择一个模块或新建模块">
        <template #extra>
          <ElButton type="primary" size="small" @click="handleCreateModule">新建模块</ElButton>
        </template>
      </ElEmpty>
    </div>
  </div>
</template>

<style scoped>
.schema-editor {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--sg-fill-color-light);
}
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sg-spacing-4) var(--sg-spacing-8);
  background: var(--sg-bg-color);
  border-bottom: 1px solid var(--sg-border-color-light);
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-6);
}
.header-right {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-6);
}
.editor-title {
  margin: 0;
  font-size: var(--sg-font-size-xl);
  font-weight: 600;
}
.module-select {
  border: 1px solid var(--sg-border-color);
  border-radius: var(--sg-radius-md);
  padding: var(--sg-spacing-2) var(--sg-spacing-4);
  font-size: var(--sg-font-size-lg);
  background: var(--sg-bg-color);
}
.editor-body {
  flex: 1;
  overflow: hidden;
}
.editor-main {
  height: 100%;
  padding: var(--sg-spacing-8);
  background: var(--sg-bg-color);
  box-sizing: border-box;
}
.editor-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.editor-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
}
.editor-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
}
.editor-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* --- field editing tab: left sidebar + right form --- */
.field-edit-layout {
  display: flex;
  gap: var(--sg-spacing-8);
  height: 100%;
}
.field-list-sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--sg-border-color-light);
  padding-right: var(--sg-spacing-8);
}
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 var(--sg-spacing-6) 0;
  border-bottom: 1px solid var(--sg-border-color-light);
  flex-shrink: 0;
}
.sidebar-header h3 {
  margin: 0;
  font-size: var(--sg-font-size-lg);
}
.field-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--sg-spacing-2) 0;
}
.field-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sg-spacing-4) var(--sg-spacing-6);
  cursor: pointer;
  border-left: 3px solid transparent;
  border-radius: var(--sg-radius-md);
}
.field-list-item:hover {
  background-color: var(--sg-fill-color-light);
}
.field-list-item.active {
  background-color: var(--sg-color-primary-light-9);
  border-left-color: var(--sg-color-primary);
}
.field-item-info {
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-1);
  min-width: 0;
  flex: 1;
}
.field-item-label {
  font-size: var(--sg-font-size-md);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.field-item-key {
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
}
.field-item-actions {
  display: flex;
  gap: var(--sg-spacing-1);
  opacity: 0;
  flex-shrink: 0;
}
.field-list-item:hover .field-item-actions {
  opacity: 1;
}
.move-btn,
.delete-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: var(--sg-font-size-sm);
  padding: var(--sg-spacing-1) var(--sg-spacing-2);
  color: var(--sg-text-color-secondary);
  line-height: 1;
}
.move-btn:disabled {
  color: var(--sg-border-color);
  cursor: not-allowed;
}
.delete-btn:hover {
  color: var(--sg-color-danger);
}
.field-form-area {
  flex: 1;
  overflow: auto;
}

/* --- config panel --- */
.config-panel {
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
.perm-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0 var(--sg-spacing-8);
}
.danger-zone {
  padding: var(--sg-spacing-4) 0;
}
</style>
