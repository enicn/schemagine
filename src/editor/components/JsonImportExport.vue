<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElButton, ElInput, ElMessage, ElAlert } from 'element-plus'
import type { ModuleSchema } from '@/types'

const props = defineProps<{
  schema: ModuleSchema
}>()

const emit = defineEmits<{
  import: [payload: ModuleSchema]
}>()

const jsonText = ref('')
const importError = ref('')
const mode = ref<'export' | 'import'>('export')

const exportJson = computed(() => {
  try {
    return JSON.stringify(props.schema, null, 2)
  } catch {
    return '序列化失败'
  }
})

function switchToImport(): void {
  mode.value = 'import'
  jsonText.value = ''
  importError.value = ''
}

function switchToExport(): void {
  mode.value = 'export'
  jsonText.value = exportJson.value
}

function handleCopy(): void {
  navigator.clipboard.writeText(exportJson.value).then(() => {
    ElMessage.success('已复制到剪贴板')
  })
}

function handleImport(): void {
  importError.value = ''
  try {
    const parsed = JSON.parse(jsonText.value)
    if (!parsed.id || !parsed.fields || !Array.isArray(parsed.fields)) {
      importError.value = '无效的 Schema 格式：必须包含 id 和 fields 属性'
      return
    }
    for (let i = 0; i < parsed.fields.length; i++) {
      const f = parsed.fields[i]
      if (!f.key || !f.type || !f.label) {
        importError.value = `字段 #${i + 1} 缺少必要属性 (key, type, label)`
        return
      }
    }
    emit('import', parsed as ModuleSchema)
    ElMessage.success('Schema 导入成功')
    mode.value = 'export'
  } catch (err) {
    importError.value = `JSON 解析错误: ${err instanceof Error ? err.message : '未知错误'}`
  }
}
</script>

<template>
  <div class="json-import-export">
    <div class="toolbar">
      <ElButton
        :type="mode === 'export' ? 'primary' : 'default'"
        size="small"
        @click="switchToExport"
      >
        导出
      </ElButton>
      <ElButton
        :type="mode === 'import' ? 'primary' : 'default'"
        size="small"
        @click="switchToImport"
      >
        导入
      </ElButton>
    </div>

    <div v-if="mode === 'export'" class="section">
      <div class="section-header">
        <h4>当前 Schema JSON</h4>
        <ElButton size="small" @click="handleCopy">复制</ElButton>
      </div>
      <ElInput
        :model-value="exportJson"
        type="textarea"
        :rows="20"
        readonly
        class="json-area"
      />
    </div>

    <div v-else class="section">
      <div class="section-header">
        <h4>粘贴 Schema JSON</h4>
      </div>
      <ElInput
        v-model="jsonText"
        type="textarea"
        :rows="16"
        placeholder='{"id": "my-module", "name": "My Module", "fields": [...]}'
        class="json-area"
      />
      <ElAlert
        v-if="importError"
        :title="importError"
        type="error"
        :closable="false"
        show-icon
        class="import-error"
      />
      <ElButton
        type="primary"
        :disabled="!jsonText.trim()"
        class="import-btn"
        @click="handleImport"
      >
        导入 Schema
      </ElButton>
    </div>
  </div>
</template>

<style scoped>
.json-import-export {
  max-width: 800px;
}
.toolbar {
  display: flex;
  gap: var(--sg-spacing-4);
  margin-bottom: var(--sg-spacing-8);
}
.section {
  border: 1px solid var(--sg-border-color-light);
  border-radius: var(--sg-radius-md);
  padding: var(--sg-spacing-8);
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sg-spacing-6);
}
.section-header h4 {
  margin: 0;
  font-size: var(--sg-font-size-lg);
}
.json-area :deep(textarea) {
  font-family: 'Courier New', monospace;
  font-size: var(--sg-font-size-md);
  line-height: 1.5;
}
.import-error {
  margin-top: var(--sg-spacing-6);
}
.import-btn {
  margin-top: var(--sg-spacing-6);
}
</style>
