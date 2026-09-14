<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElButton, ElMessage, ElRadioButton, ElRadioGroup, ElSelect, ElOption } from 'element-plus'
import { useRouter } from 'vue-router'
import type { FieldSchema, ModuleSchema } from '@/types'
import type { PropertyMeta } from '@/schemaMeta'
import {
  FIELD_TYPE_VALUES,
  getFieldProperties,
  getModuleProperties,
} from '@/schemaMeta'
import { peekRecordService, recordService, setRecordService } from '@/services/api/recordService'
import type { IRecordService } from '@/services/api/recordService'
import { createLocalRecordService } from '@/services/local/localRecordService'
import { schemaService } from '@/services/api/schemaService'
import PlaygroundTree from './components/PlaygroundTree.vue'
import PropertyDocTable from './components/PropertyDocTable.vue'
import PropertyEditForm from './components/PropertyEditForm.vue'
import PlaygroundPreview from './components/PlaygroundPreview.vue'

const router = useRouter()

/** 沙箱模块固定 ID:Schema 每次模板加载/修改后覆盖保存,记录首次从模板模块复制 */
const SANDBOX_ID = 'module-playground'
const AUTOSAVE_DEBOUNCE_MS = 800

const schema = ref<ModuleSchema | null>(null)
const selectedKey = ref<string | null>(null)
const mode = ref<'docs' | 'edit'>('docs')
const highlightKey = ref<string | null>(null)
const refreshKey = ref(0)
const isLoading = ref(false)
const sourceModules = ref<Array<{ id: string; name: string }>>([])
const currentSourceId = ref('')

const typeLabels = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const t of FIELD_TYPE_VALUES) map[t.value] = t.label
  return map
})

/** 当前选中目标(模块节点或字段)适用的属性元数据 */
const applicableMetas = computed<PropertyMeta[]>(() => {
  if (!schema.value) return []
  if (selectedKey.value === null) return getModuleProperties()
  const field = schema.value.fields.find(f => f.key === selectedKey.value)
  return field ? getFieldProperties(field.type) : []
})

/** 编辑表单的操作对象:模块节点用整个 schema,字段节点用字段对象 */
const editTarget = computed<Record<string, unknown>>(() => {
  if (!schema.value) return {}
  if (selectedKey.value === null) return schema.value as unknown as Record<string, unknown>
  return (schema.value.fields.find(f => f.key === selectedKey.value) ?? {}) as Record<string, unknown>
})

let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let dirty = false
/** loadSandbox 期间抑制深度 watch 触发的自动保存(加载流程自行保存) */
let suppressAutosave = false

function scheduleAutosave(): void {
  dirty = true
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(async () => {
    autosaveTimer = null
    if (!schema.value || !dirty) return
    dirty = false
    const res = await schemaService.saveModuleSchema(JSON.parse(JSON.stringify(schema.value)))
    if (res.success) {
      refreshKey.value++
    }
  }, AUTOSAVE_DEBOUNCE_MS)
}

onBeforeUnmount(() => {
  if (autosaveTimer) clearTimeout(autosaveTimer)
  // 恢复进入前的全局 RecordService(沙箱数据只存在于内存本地源,不落 localStorage)
  if (savedRecordService) {
    setRecordService(savedRecordService)
    savedRecordService = null
  }
})

watch(schema, () => {
  if (!suppressAutosave) scheduleAutosave()
}, { deep: true })

onMounted(async () => {
  savedRecordService = peekRecordService()
  isLoading.value = true
  try {
    const res = await schemaService.listModuleIds()
    if (res.success) {
      for (const id of res.data) {
        if (id === SANDBOX_ID) continue
        const schemaRes = await schemaService.loadModuleSchema(id)
        if (schemaRes.success) {
          sourceModules.value.push({ id, name: schemaRes.data.name })
        }
      }
    }
    currentSourceId.value = sourceModules.value[0]?.id ?? ''
    await loadSandbox(currentSourceId.value)
  } finally {
    isLoading.value = false
  }
})

/**
 * 沙箱数据源(docs/19 批次 C1):记录经 createLocalRecordService 常驻内存,
 * 模板记录在换源前从原服务(通常是 mock)复制,退出页面恢复原服务。
 */
let savedRecordService: IRecordService | null = null

async function collectSourceRows(sourceId: string): Promise<Array<Record<string, unknown>>> {
  const source = savedRecordService ?? recordService
  const collected: Array<Record<string, unknown>> = []
  let page = 1
  while (page <= 50) {
    const r = await source.list({ moduleId: sourceId, page, pageSize: 100 })
    if (!r.success || r.data.records.length === 0) break
    for (const rec of r.data.records) {
      collected.push({ ...rec.fields })
    }
    if (!r.data.hasMore) break
    page++
  }
  return collected
}

/** 从模板模块复制 Schema 到沙箱,并把沙箱记录装载进内存本地数据源 */
async function loadSandbox(sourceId: string): Promise<void> {
  if (!sourceId) return
  const res = await schemaService.loadModuleSchema(sourceId)
  if (!res.success) {
    ElMessage.error(res.message || '加载模板 Schema 失败')
    return
  }
  const copy = JSON.parse(JSON.stringify(res.data)) as ModuleSchema
  copy.id = SANDBOX_ID
  copy.name = `${copy.name} · 演示沙箱`
  suppressAutosave = true
  schema.value = copy
  selectedKey.value = null
  highlightKey.value = null
  await nextTick()
  suppressAutosave = false

  const saved = await schemaService.saveModuleSchema(JSON.parse(JSON.stringify(copy)))
  if (!saved.success) {
    ElMessage.error(saved.message || '初始化沙箱 Schema 失败')
    return
  }

  try {
    const rows = await collectSourceRows(sourceId)
    setRecordService(createLocalRecordService(rows, { moduleId: SANDBOX_ID }))
  } catch {
    // 记录装载失败不阻塞 Schema 演示(空表仍可看列结构)
  }
  refreshKey.value++
}

function handleSelect(key: string | null): void {
  selectedKey.value = key
  highlightKey.value = null
}

function handleAddField(): void {
  if (!schema.value) return
  const newKey = `field_${Date.now().toString(36)}`
  const newField: FieldSchema = {
    id: newKey,
    name: newKey,
    key: newKey,
    type: 'text',
    label: '新字段',
    required: false,
    readonly: false,
    order: schema.value.fields.length,
    visible: true,
    sortable: false,
    filterable: false,
  }
  schema.value.fields.push(newField)
  selectedKey.value = newKey
  mode.value = 'edit'
}

function handleRemoveField(key: string): void {
  if (!schema.value) return
  schema.value.fields = schema.value.fields.filter(f => f.key !== key)
  if (selectedKey.value === key) selectedKey.value = null
}

function handleMoveField(key: string, direction: 'up' | 'down'): void {
  if (!schema.value) return
  const fields = [...schema.value.fields].sort((a, b) => a.order - b.order)
  const index = fields.findIndex(f => f.key === key)
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || targetIndex < 0 || targetIndex >= fields.length) return
  const current = fields[index]
  const target = fields[targetIndex]
  if (!current || !target) return
  const temp = current.order
  current.order = target.order
  target.order = temp
  schema.value = { ...schema.value, fields: [...fields] }
}

function handleValueChange(key: string, value: unknown): void {
  if (!schema.value) return
  if (selectedKey.value === null) {
    (schema.value as unknown as Record<string, unknown>)[key] = value
  } else {
    const field = schema.value.fields.find(f => f.key === selectedKey.value)
    if (field) (field as unknown as Record<string, unknown>)[key] = value
  }
}

/** 反查:预览中点击单元格 → 定位字段并切到文档模式 */
function handleLocateField(fieldKey: string): void {
  if (!schema.value) return
  const exists = schema.value.fields.some(f => f.key === fieldKey)
  if (!exists) return
  selectedKey.value = fieldKey
  mode.value = 'docs'
  highlightKey.value = null
  requestAnimationFrame(() => {
    highlightKey.value = fieldKey
  })
}

async function handleTemplateChange(sourceId: string): Promise<void> {
  currentSourceId.value = sourceId
  await loadSandbox(sourceId)
  ElMessage.success('已切换演示模板')
}

async function handleReset(): Promise<void> {
  await loadSandbox(currentSourceId.value)
  ElMessage.success('已重置为模板初始状态')
}
</script>

<template>
  <div class="schema-playground">
    <header class="pg-header">
      <div class="header-left">
        <ElButton size="small" @click="router.push('/')">&larr; 返回</ElButton>
        <h2 class="pg-title">Schema Playground</h2>
        <span class="pg-subtitle">可视化编辑 Schema · 配置项文档 · 实时效果预览</span>
      </div>
      <div class="header-right">
        <span class="template-label">演示模板</span>
        <ElSelect
          class="template-select"
          :model-value="currentSourceId"
          size="small"
          @update:model-value="(v: string) => handleTemplateChange(v)"
        >
          <ElOption v-for="m in sourceModules" :key="m.id" :label="m.name" :value="m.id" />
        </ElSelect>
        <ElButton size="small" @click="handleReset">重置</ElButton>
      </div>
    </header>

    <div v-if="isLoading" class="pg-loading">加载中…</div>

    <div v-else-if="schema" class="pg-body">
      <aside class="pg-left">
        <PlaygroundTree
          :schema="schema"
          :selected-key="selectedKey"
          :type-labels="typeLabels"
          @select="handleSelect"
          @add-field="handleAddField"
          @remove-field="handleRemoveField"
          @move-field="handleMoveField"
        />
      </aside>

      <main class="pg-center">
        <div class="pg-mode-bar">
          <ElRadioGroup v-model="mode" size="small">
            <ElRadioButton value="docs">配置项文档</ElRadioButton>
            <ElRadioButton value="edit">可视化编辑</ElRadioButton>
          </ElRadioGroup>
          <span class="mode-hint">
            {{ selectedKey === null ? '正在查看:模块配置' : `正在查看字段:${selectedKey}` }}
          </span>
        </div>
        <div class="pg-workspace">
          <PropertyDocTable
            v-if="mode === 'docs'"
            :metas="applicableMetas"
            :highlight-key="highlightKey"
          />
          <PropertyEditForm
            v-else
            :metas="applicableMetas"
            :value="editTarget"
            :highlight-key="highlightKey"
            @change="handleValueChange"
          />
        </div>
      </main>

      <aside class="pg-right">
        <PlaygroundPreview
          :sandbox-id="SANDBOX_ID"
          :refresh-key="refreshKey"
          @locate-field="handleLocateField"
        />
      </aside>
    </div>

    <div v-else class="pg-loading">请选择演示模板</div>
  </div>
</template>

<style scoped>
.schema-playground {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--sg-bg-color);
}
.pg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sg-spacing-3) var(--sg-spacing-6);
  border-bottom: 1px solid var(--sg-border-color-light);
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-4);
}
.pg-title {
  margin: 0;
  font-size: var(--sg-font-size-xl);
  font-weight: 600;
}
.pg-subtitle {
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
}
.header-right {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-3);
}
.template-label {
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
}
.template-select {
  width: 200px;
}
.pg-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sg-text-color-secondary);
}
.pg-body {
  flex: 1;
  display: flex;
  gap: var(--sg-spacing-4);
  padding: var(--sg-spacing-4) var(--sg-spacing-6);
  min-height: 0;
  box-sizing: border-box;
}
.pg-left {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--sg-border-color-light);
  padding-right: var(--sg-spacing-3);
  min-height: 0;
}
.pg-center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.pg-mode-bar {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-4);
  margin-bottom: var(--sg-spacing-3);
}
.mode-hint {
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
}
.pg-workspace {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.pg-right {
  width: 40%;
  min-width: 420px;
  flex-shrink: 0;
  min-height: 0;
}
</style>
