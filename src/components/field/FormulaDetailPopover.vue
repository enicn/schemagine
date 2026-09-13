<script setup lang="ts">
import { computed } from 'vue'
import { ElPopover, ElTag, ElDescriptions, ElDescriptionsItem } from 'element-plus'
import type { FormulaEvaluationContext } from '@/composables/useFormula'

const props = defineProps<{
  context: FormulaEvaluationContext | null
  trigger?: 'hover' | 'click' | 'focus'
  disabled?: boolean
}>()

const triggerMode = computed(() => props.trigger || 'click')

const statusTag = computed(() => {
  if (!props.context) return { type: 'info', text: '无公式' }
  if (props.context.result.success) return { type: 'success', text: '计算成功' }
  const errorType = props.context.result.errorType
  if (errorType === 'circular') return { type: 'danger', text: '循环依赖' }
  if (errorType === 'eval') return { type: 'warning', text: '计算异常' }
  if (errorType === 'missing_dependency') return { type: 'warning', text: '依赖缺失' }
  return { type: 'info', text: '未知状态' }
})
</script>

<template>
  <ElPopover
    :trigger="triggerMode"
    :disabled="disabled || !context"
    placement="bottom-start"
    :width="360"
    popper-class="formula-detail-popover"
  >
    <template #reference>
      <slot>
        <span class="formula-trigger">
          <ElTag :type="statusTag.type as any" size="small" effect="plain">
            {{ statusTag.text }}
          </ElTag>
        </span>
      </slot>
    </template>

    <template v-if="context">
      <div class="formula-detail-content">
        <h4 class="formula-title">公式计算上下文</h4>

        <ElDescriptions :column="1" size="small" border>
          <ElDescriptionsItem label="字段">
            {{ context.fieldKey }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="表达式">
            <code class="formula-expression">{{ context.expression }}</code>
          </ElDescriptionsItem>
          <ElDescriptionsItem label="依赖字段">
            <div class="dependency-list">
              <ElTag
                v-for="dep in context.dependencies"
                :key="dep"
                size="small"
                type="info"
                effect="plain"
              >
                {{ dep }}
              </ElTag>
            </div>
          </ElDescriptionsItem>
          <ElDescriptionsItem label="依赖值">
            <div class="dependency-values">
              <div
                v-for="(val, key) in context.dependencyValues"
                :key="key"
                class="dependency-item"
              >
                <span class="dep-key">{{ key }}:</span>
                <span class="dep-value">{{ val ?? '(空)' }}</span>
              </div>
            </div>
          </ElDescriptionsItem>
          <ElDescriptionsItem label="计算结果">
            <span v-if="context.result.success" class="result-success">
              {{ context.result.value }}
            </span>
            <span v-else class="result-error">
              {{ context.result.errorMessage }}
            </span>
          </ElDescriptionsItem>
        </ElDescriptions>
      </div>
    </template>
  </ElPopover>
</template>

<style scoped>
.formula-trigger {
  cursor: pointer;
}
.formula-detail-content {
  padding: var(--sg-spacing-2) 0;
}
.formula-title {
  margin: 0 0 var(--sg-spacing-6) 0;
  font-size: var(--sg-font-size-lg);
  font-weight: 600;
}
.formula-expression {
  background-color: var(--sg-fill-color-light);
  padding: var(--sg-spacing-1) var(--sg-spacing-3);
  border-radius: var(--sg-radius-sm);
  font-family: 'Courier New', monospace;
  font-size: var(--sg-font-size-md);
}
.dependency-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sg-spacing-2);
}
.dependency-values {
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-1);
}
.dependency-item {
  display: flex;
  gap: var(--sg-spacing-3);
  font-size: var(--sg-font-size-md);
}
.dep-key {
  color: var(--sg-text-color-secondary);
  font-weight: 500;
}
.dep-value {
  color: var(--sg-text-color-primary);
}
.result-success {
  color: var(--sg-color-success);
  font-weight: 600;
}
.result-error {
  color: var(--sg-color-danger);
}
</style>
