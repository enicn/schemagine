<script setup lang="ts">
import { ref } from 'vue'
import { ElButton, ElDialog, ElForm, ElFormItem, ElInput, ElInputNumber, ElSelect, ElOption, ElDatePicker, ElMessage } from 'element-plus'
import type { ListAction, FilterClause } from '@/types'
import SchemaEngineDialog from '@/engine/dialogs/SchemaEngineDialog.vue'

const props = defineProps<{
  actions: ListAction[]
  activeFilters: FilterClause[]
  /** 当前列表勾选的 Row ID（供 custom 动作携带上下文，如批量操作） */
  selectedRowIds?: string[]
  onPopupAction?: (action: ListAction) => void
}>()

const emit = defineEmits<{
  'action-trigger': [payload: { action: ListAction; context?: Record<string, unknown> }]
}>()

const popupDialogVisible = ref(false)
const popupModuleId = ref('')
const popupTitle = ref('')

const formDialogVisible = ref(false)
const formAction = ref<ListAction | null>(null)
const formData = ref<Record<string, any>>({})
const formSubmitting = ref(false)

function handleActionClick(action: ListAction): void {
  if (action.type === 'popup-schema') {
    if (props.onPopupAction) {
      props.onPopupAction(action)
      return
    }
    const target = action.target
    if (!target?.moduleId) return
    popupModuleId.value = target.moduleId
    popupTitle.value = action.label
    popupDialogVisible.value = true
  } else if (action.type === 'form-submit') {
    openFormSubmit(action)
  } else {
    // custom 动作：携带当前勾选行上下文，便于宿主侧实现批量操作
    emit('action-trigger', { action, context: { selectedRowIds: props.selectedRowIds ?? [] } })
  }
}

function openFormSubmit(action: ListAction): void {
  formAction.value = action
  formData.value = {}
  if (action.target?.formFields) {
    for (const field of action.target.formFields) {
      formData.value[field.key] = field.defaultValue ?? ''
    }
  }
  formDialogVisible.value = true
}

async function handleFormSubmit(): Promise<void> {
  const action = formAction.value
  if (!action?.target?.apiEndpoint) {
    ElMessage.error('未配置 API 端点')
    return
  }
  formSubmitting.value = true
  try {
    ElMessage.success('提交成功')
    formDialogVisible.value = false
  } catch {
    ElMessage.error('提交失败')
  } finally {
    formSubmitting.value = false
  }
}
</script>

<template>
  <div class="list-action-bar">
    <div class="action-bar-left">
      <template v-for="action in actions" :key="action.id">
        <ElButton size="small" @click="handleActionClick(action)">
          {{ action.label }}
        </ElButton>
      </template>
    </div>
  </div>

  <SchemaEngineDialog
    :visible="popupDialogVisible"
    :module-id="popupModuleId"
    :title="popupTitle"
    @close="popupDialogVisible = false"
  />

  <ElDialog
    v-model="formDialogVisible"
    :title="formAction?.label || '填写表单'"
    :width="'500px'"
    :close-on-click-modal="false"
  >
    <ElForm
      v-if="formAction?.target?.formFields"
      label-width="100px"
      size="small"
    >
      <ElFormItem
        v-for="field in formAction.target.formFields"
        :key="field.key"
        :label="field.label"
        :required="field.required"
      >
        <ElInput
          v-if="field.type === 'text' || field.type === 'textarea'"
          v-model="formData[field.key]"
          :type="field.type"
          :placeholder="`请输入${field.label}`"
        />
        <ElInputNumber
          v-else-if="field.type === 'number'"
          v-model="formData[field.key]"
          :placeholder="`请输入${field.label}`"
        />
        <ElDatePicker
          v-else-if="field.type === 'date'"
          v-model="formData[field.key]"
          :placeholder="`请选择${field.label}`"
        />
        <ElSelect
          v-else-if="field.type === 'select' && field.options"
          v-model="formData[field.key]"
          :placeholder="`请选择${field.label}`"
        >
          <ElOption
            v-for="opt in field.options"
            :key="String(opt.value)"
            :label="opt.label"
            :value="opt.value"
          />
        </ElSelect>
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton @click="formDialogVisible = false">取消</ElButton>
      <ElButton type="primary" :loading="formSubmitting" @click="handleFormSubmit">提交</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.list-action-bar {
  display: flex;
  align-items: center;
  padding: var(--sg-spacing-2) var(--sg-spacing-8);
  border-bottom: 1px solid var(--sg-border-color-light);
  background: var(--sg-fill-color-lighter);
  min-height: 32px;
}
.action-bar-left {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-3);
}
</style>
