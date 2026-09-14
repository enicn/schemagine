<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElAlert, ElCheckbox, ElRadioGroup, ElRadioButton } from 'element-plus'
import SchemaEngine from '@/engine/entry/SchemaEngine.vue'

const props = defineProps<{
  /** 沙箱模块 ID */
  sandboxId: string
  /** 变更自增:修改 Schema 后 +1 触发引擎重载 */
  refreshKey: number
}>()

const emit = defineEmits<{
  /** 反查模式下的单元格点击 */
  'locate-field': [fieldKey: string]
}>()

const viewMode = ref<'list' | 'card' | 'create'>('list')
const reverseMode = ref(false)
const lastLocated = ref('')

const engineKey = computed(() => `${props.sandboxId}#${props.refreshKey}#${viewMode.value}`)

function handleCellClick(payload: { field: string; rowId: string | null }): void {
  if (!reverseMode.value || !payload.field) return
  lastLocated.value = payload.field
  emit('locate-field', payload.field)
}
</script>

<template>
  <div class="pg-preview">
    <div class="preview-toolbar">
      <ElRadioGroup v-model="viewMode" size="small">
        <ElRadioButton value="list">列表</ElRadioButton>
        <ElRadioButton value="card">卡片</ElRadioButton>
        <ElRadioButton value="create">新建</ElRadioButton>
      </ElRadioGroup>
      <ElCheckbox v-model="reverseMode" size="small">反查模式:点单元格定位配置项</ElCheckbox>
    </div>

    <ElAlert
      v-if="reverseMode"
      type="info"
      :closable="false"
      show-icon
      class="reverse-tip"
    >
      <template v-if="lastLocated">
        已定位字段:<code>{{ lastLocated }}</code>
      </template>
      <template v-else>点击预览中的任意单元格,左侧将定位到对应字段</template>
    </ElAlert>

    <div class="preview-container">
      <SchemaEngine
        :key="engineKey"
        :module-id="sandboxId"
        :initial-view-mode="viewMode"
        embedded
        table-height="100%"
        @cell-click="handleCellClick"
      />
    </div>
  </div>
</template>

<style scoped>
.pg-preview {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sg-spacing-3);
  padding-bottom: var(--sg-spacing-3);
  border-bottom: 1px solid var(--sg-border-color-light);
}
.reverse-tip {
  margin-top: var(--sg-spacing-2);
  padding: var(--sg-spacing-2) var(--sg-spacing-3);
}
.preview-container {
  flex: 1;
  min-height: 0;
  margin-top: var(--sg-spacing-3);
}
.preview-container :deep(.schema-engine) {
  height: 100%;
}
</style>
