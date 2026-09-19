<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElDialog, ElButton, ElMessage } from 'element-plus'
import { useUi } from '@/composables/instanceState'
import { useRecordHistory } from '@/composables/useRecordHistory'
import { useFormula } from '@/composables/useFormula'
import { getDialogComponent } from '@/engine/registry/dialogRegistry'
import DynamicMaxConfirmDialog from './DynamicMaxConfirmDialog.vue'
import QuickCreateDialog from './QuickCreateDialog.vue'
import FormulaDetailPopover from '@/components/field/FormulaDetailPopover.vue'
import type { FormulaEvaluationContext } from '@/composables/useFormula'
import type { RecordEntity } from '@/types'

const uiState = useUi()
const formula = useFormula()
const history = useRecordHistory()

const visible = computed(() => uiState.dialogVisible)
const dialogType = computed(() => uiState.dialogType)
const payload = computed(() => uiState.dialogState.payload)

/** 宿主经 registerDialog 注册的自定义弹窗组件(docs/19 B4);命中时优先于内置渲染 */
const customDialog = computed(() => (dialogType.value ? getDialogComponent(dialogType.value) : undefined))

const formulaContext = ref<FormulaEvaluationContext | null>(null)

watch(dialogType, (type) => {
  if (type === 'formula-detail') {
    const p = payload.value
    if (p && typeof p.fieldKey === 'string') {
      formulaContext.value = formula.getEvaluationContext(p.fieldKey, p.recordId as string | undefined)
    }
  } else {
    formulaContext.value = null
  }
})

const dialogTitle = computed(() => {
  const titles: Record<string, string> = {
    'quick-create': '快速创建',
    'column-settings': '列表设置',
    'formula-detail': '公式详情',
    'dynamic-max-confirm': '动态最大值确认',
    'version-conflict': '版本冲突',
    confirm: '确认操作',
    alert: '提示',
  }
  return titles[dialogType.value || ''] || '提示'
})

function handleClose(): void {
  uiState.closeDialog()
}

function handleConfirm(): void {
  uiState.closeDialog()
}

function handleDynamicMaxConfirm(): void {
  uiState.closeDialog()
}

function handleDynamicMaxCancel(): void {
  uiState.closeDialog()
}

function handleQuickCreateCreated(payload: { id: string; label: string; value: string; record: RecordEntity }): void {
  // docs/19 H3:快速创建入栈;目标模块记录不在实例列表时 pushCreate 自动跳过(引擎无 delete 无法回放)
  history.pushCreate([payload.record])
  uiState.closeDialog()
  ElMessage.success(`已创建: ${payload.label}`)
}

function handleQuickCreateCancel(): void {
  uiState.closeDialog()
}
</script>

<template>
  <!-- 自定义注册弹窗(docs/19 B4):约定 props { visible, payload },emit close -->
  <component
    :is="customDialog"
    v-if="customDialog"
    :visible="visible"
    :payload="payload"
    @close="handleClose"
  />

  <DynamicMaxConfirmDialog
    :visible="dialogType === 'dynamic-max-confirm' && visible"
    :payload="payload"
    @confirm="handleDynamicMaxConfirm"
    @cancel="handleDynamicMaxCancel"
    @close="handleClose"
  />

  <QuickCreateDialog
    :visible="dialogType === 'quick-create' && visible"
    :target-module-id="(payload?.targetModuleId as string) || ''"
    :prefill-data="payload?.prefillData as Record<string, unknown> | undefined"
    @created="handleQuickCreateCreated"
    @cancel="handleQuickCreateCancel"
    @close="handleClose"
  />

  <ElDialog
    :model-value="visible && dialogType !== 'dynamic-max-confirm' && dialogType !== 'quick-create'"
    :title="dialogTitle"
    :width="dialogType === 'column-settings' ? '600px' : '420px'"
    :close-on-click-modal="false"
    @update:model-value="handleClose"
  >
    <template v-if="dialogType === 'version-conflict'">
      <div class="conflict-message">
        <span class="conflict-icon">&#9888;</span>
        <p>{{ payload?.message || '数据已被其他用户修改' }}</p>
      </div>
    </template>

    <template v-else-if="dialogType === 'formula-detail'">
      <div class="formula-detail-wrapper">
        <FormulaDetailPopover :context="formulaContext" trigger="click" :disabled="false">
          <span />
        </FormulaDetailPopover>
        <div v-if="formulaContext" class="formula-summary">
          <div class="summary-row">
            <span class="summary-label">表达式</span>
            <code class="summary-expression">{{ formulaContext.expression }}</code>
          </div>
          <div class="summary-row">
            <span class="summary-label">结果</span>
            <span :class="formulaContext.result.success ? 'result-ok' : 'result-err'">
              {{ formulaContext.result.success ? formulaContext.result.value : formulaContext.result.errorMessage }}
            </span>
          </div>
        </div>
        <p v-else class="no-formula">未找到公式配置</p>
      </div>
    </template>

    <template v-else-if="dialogType === 'alert' || dialogType === 'confirm'">
      <p>{{ payload?.message || '' }}</p>
    </template>

    <template v-else>
      <p>弹窗内容待实现: {{ dialogType }}</p>
    </template>

    <template #footer>
      <ElButton @click="handleClose">关闭</ElButton>
      <ElButton
        v-if="dialogType === 'version-conflict'"
        type="primary"
        @click="handleConfirm"
      >
        刷新数据
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.conflict-message {
  display: flex;
  align-items: flex-start;
  gap: var(--sg-spacing-6);
}
.conflict-message p {
  margin: 0;
  line-height: 1.6;
}
.formula-detail-wrapper {
  padding: var(--sg-spacing-4) 0;
}
.formula-summary {
  margin-top: var(--sg-spacing-6);
  padding: var(--sg-spacing-6);
  background-color: var(--sg-fill-color-light);
  border-radius: var(--sg-radius-md);
}
.summary-row {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-4);
  padding: var(--sg-spacing-2) 0;
  font-size: var(--sg-font-size-lg);
}
.summary-label {
  color: var(--sg-text-color-secondary);
  min-width: 60px;
}
.summary-expression {
  font-family: 'Courier New', monospace;
  background: var(--sg-border-color-light);
  padding: var(--sg-spacing-1) var(--sg-spacing-3);
  border-radius: var(--sg-radius-sm);
  font-size: var(--sg-font-size-md);
}
.result-ok {
  color: var(--sg-color-success);
  font-weight: 600;
}
.result-err {
  color: var(--sg-color-danger);
}
.no-formula {
  color: var(--sg-text-color-secondary);
  text-align: center;
}
</style>
