<script setup lang="ts">
import { computed } from 'vue'
import { ElDialog, ElButton, ElAlert } from 'element-plus'
import type { DynamicMaxResult } from '@/composables/useDynamicMax'

const props = defineProps<{
  visible: boolean
  payload: Record<string, unknown> | null
}>()

const emit = defineEmits<{
  confirm: [payload: void]
  cancel: [payload: void]
  close: [payload: void]
}>()

const result = computed<DynamicMaxResult | null>(() => {
  if (!props.payload) return null
  return props.payload as unknown as DynamicMaxResult
})

function handleConfirm(): void {
  emit('confirm')
}

function handleCancel(): void {
  emit('cancel')
}

function handleClose(): void {
  emit('close')
}
</script>

<template>
  <ElDialog
    :model-value="visible"
    title="动态最大值确认"
    width="420px"
    :close-on-click-modal="false"
    @update:model-value="handleClose"
  >
    <template v-if="result">
      <ElAlert
        title="输入值超过动态最大值限制"
        :description="result.message"
        type="warning"
        show-icon
        :closable="false"
      />
      <div class="dynamic-max-detail">
        <div class="detail-row">
          <span class="detail-label">来源字段值:</span>
          <span class="detail-value">{{ result.originalValue }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">计算最大值:</span>
          <span class="detail-value highlight">{{ result.maxValue }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">当前输入值:</span>
          <span class="detail-value highlight-warning">{{ result.targetValue }}</span>
        </div>
      </div>
    </template>

    <template #footer>
      <ElButton @click="handleCancel">取消</ElButton>
      <ElButton type="primary" @click="handleConfirm">确认提交</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.dynamic-max-detail {
  margin-top: var(--sg-spacing-8);
  padding: var(--sg-spacing-6);
  background-color: var(--sg-fill-color-lighter);
  border-radius: var(--sg-radius-md);
}
.detail-row {
  display: flex;
  justify-content: space-between;
  padding: var(--sg-spacing-2) 0;
  font-size: var(--sg-font-size-lg);
}
.detail-label {
  color: var(--sg-text-color-secondary);
}
.detail-value {
  font-weight: 500;
}
.detail-value.highlight {
  color: var(--sg-color-warning);
}
.detail-value.highlight-warning {
  color: var(--sg-color-danger);
}
</style>
