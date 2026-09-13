<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import { ElButton } from 'element-plus'

interface ErrorInfo {
  message: string
  timestamp: number
}

const hasError = ref(false)
const errors = ref<ErrorInfo[]>([])
const errorKey = ref(0)

onErrorCaptured((err: Error, instance, info) => {
  if (info === 'render function' || info.includes('render') || info.includes('setup')) {
    errors.value.push({
      message: err.message || String(err),
      timestamp: Date.now(),
    })
    hasError.value = true
    return false
  }
  return false
})

function handleRetry(): void {
  hasError.value = false
  errorKey.value++
}
</script>

<template>
  <div v-if="hasError" class="error-boundary">
    <div class="error-boundary-card">
      <div class="error-boundary-icon">&#9888;</div>
      <h3 class="error-boundary-title">渲染异常</h3>
      <p class="error-boundary-desc">该组件渲染时发生错误，不影响引擎其他部分</p>
      <div class="error-boundary-details">
        <div v-for="(err, i) in errors" :key="i" class="error-boundary-item">
          {{ err.message }}
        </div>
      </div>
      <ElButton type="primary" size="small" @click="handleRetry">重试</ElButton>
    </div>
  </div>
  <slot v-else :key="errorKey" />
</template>

<style scoped>
.error-boundary {
  padding: var(--sg-spacing-12);
  display: flex;
  align-items: center;
  justify-content: center;
}
.error-boundary-card {
  text-align: center;
  padding: var(--sg-spacing-16);
  border: 1px solid var(--sg-color-danger-light-8);
  border-radius: var(--sg-radius-xl);
  background: var(--sg-color-danger-light-9);
  max-width: 480px;
  width: 100%;
}
.error-boundary-icon {
  font-size: var(--sg-font-size-3xl);
  color: var(--sg-color-danger);
  margin-bottom: var(--sg-spacing-4);
}
.error-boundary-title {
  margin: 0 0 var(--sg-spacing-4) 0;
  font-size: var(--sg-font-size-xl);
  font-weight: 600;
  color: var(--sg-color-danger);
}
.error-boundary-desc {
  margin: 0 0 var(--sg-spacing-6) 0;
  font-size: var(--sg-font-size-md);
  color: var(--sg-text-color-secondary);
}
.error-boundary-details {
  text-align: left;
  margin-bottom: var(--sg-spacing-8);
  padding: var(--sg-spacing-4) var(--sg-spacing-6);
  background: var(--sg-color-danger-light-9);
  border-radius: var(--sg-radius-md);
  border: 1px solid var(--sg-color-danger-light-8);
  max-height: 120px;
  overflow-y: auto;
  font-size: var(--sg-font-size-base);
  font-family: 'Courier New', monospace;
  color: var(--sg-color-warning);
  word-break: break-all;
}
.error-boundary-item {
  padding: var(--sg-spacing-1) 0;
}
</style>
