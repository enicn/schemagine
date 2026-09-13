<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElAlert, ElRadioGroup, ElRadioButton } from 'element-plus'
import SchemaEngine from '@/engine/entry/SchemaEngine.vue'
import type { ModuleSchema } from '@/types'

const props = defineProps<{
  schema: ModuleSchema
}>()

const previewModuleId = computed(() => `preview-${props.schema.id}`)

const previewMode = ref<'list' | 'card' | 'create'>('list')
</script>

<template>
  <div class="schema-preview">
    <div class="preview-toolbar">
      <h4>实时预览</h4>
      <ElRadioGroup v-model="previewMode" size="small">
        <ElRadioButton value="list">列表</ElRadioButton>
        <ElRadioButton value="card">卡片</ElRadioButton>
        <ElRadioButton value="create">新增</ElRadioButton>
      </ElRadioGroup>
    </div>

    <ElAlert
      v-if="schema.fields.length === 0"
      type="warning"
      title="当前 Schema 没有字段，预览将显示空状态"
      :closable="false"
      show-icon
    />

    <div class="preview-container">
      <SchemaEngine
        :key="previewModuleId"
        :module-id="previewModuleId"
        :initial-view-mode="previewMode"
        embedded
      />
    </div>
  </div>
</template>

<style scoped>
.schema-preview {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--sg-spacing-6);
  border-bottom: 1px solid var(--sg-border-color-light);
  margin-bottom: var(--sg-spacing-6);
}
.preview-toolbar h4 {
  margin: 0;
  font-size: var(--sg-font-size-lg);
}
.preview-container {
  flex: 1;
  border: 1px solid var(--sg-border-color-light);
  border-radius: var(--sg-radius-md);
  overflow: hidden;
  min-height: 400px;
}
</style>
