<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElInput, ElSelect, ElOption, ElButton, ElTag, ElAlert, ElMessage } from 'element-plus'
import type { ModuleSchema } from '@/types'
import { validateRules, type Rule, type ConditionOperator } from '@/rules'
import { parse as mathParse, evaluate as mathEvaluate } from 'mathjs/number'

/**
 * 声明式规则编辑器（rules 包 authoring，compute/condition 两类先行）：
 * 模块级与字段级 rules 可视化增删改，实时结构校验（validateRules）与
 * 表达式语法检查（mathjs.parse）、示例值求值预览。
 */
const props = defineProps<{
  schema: ModuleSchema
}>()

const emit = defineEmits<{
  update: [payload: ModuleSchema]
}>()

const OPERATORS: Array<{ value: ConditionOperator; label: string }> = [
  { value: 'eq', label: '等于' },
  { value: 'neq', label: '不等于' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'in', label: '属于' },
  { value: 'notIn', label: '不属于' },
  { value: 'contains', label: '包含' },
  { value: 'isEmpty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
]

const scope = ref<string>('module')
const editTarget = ref('')
const editWatch = ref<string[]>([])
const editExpr = ref('')
const condField = ref('')
const condOperator = ref<ConditionOperator>('eq')
const condOperand = ref('')

const fieldKeys = computed(() => props.schema.fields.map(f => f.key))

const currentRules = computed<Rule[]>(() => {
  if (scope.value === 'module') return props.schema.rules ?? []
  const field = props.schema.fields.find(f => f.key === scope.value)
  return field?.rules ?? []
})

const diagnostics = computed(() => validateRules(currentRules.value).issues)

const exprSyntaxOk = computed(() => {
  if (!editExpr.value.trim()) return true
  try {
    mathParse(editExpr.value)
    return true
  } catch {
    return false
  }
})

const exprPreview = computed(() => {
  if (!editExpr.value.trim() || !exprSyntaxOk.value) return ''
  const scopeObj: Record<string, unknown> = {}
  for (const key of editWatch.value.length > 0 ? editWatch.value : fieldKeys.value) {
    scopeObj[key] = 1
  }
  try {
    return `示例求值（依赖均取 1）: ${String(mathEvaluate(editExpr.value, scopeObj))}`
  } catch {
    return '示例求值失败：检查依赖字段名'
  }
})

function switchScope(key: string): void {
  scope.value = key
}

function startCompute(): void {
  editTarget.value = ''
  editWatch.value = []
  editExpr.value = ''
}

function startCondition(): void {
  condField.value = ''
  condOperator.value = 'eq'
  condOperand.value = ''
}

/** 把操作数输入框解析为字面量：JSON 可解析则用解析值，否则原样字符串 */
function parseOperand(raw: string): unknown {
  const text = raw.trim()
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function commitCompute(): void {
  if (!editTarget.value || !editExpr.value.trim()) {
    ElMessage.warning('compute 需要目标字段与表达式')
    return
  }
  if (!exprSyntaxOk.value) {
    ElMessage.warning('表达式语法错误')
    return
  }
  const rule: Rule = {
    type: 'compute',
    target: editTarget.value,
    watch: editWatch.value.length > 0 ? [...editWatch.value] : [editTarget.value],
    expr: editExpr.value.trim(),
  }
  emitUpdate([...currentRules.value, rule])
  startCompute()
}

function commitCondition(): void {
  if (!condField.value) {
    ElMessage.warning('condition 需要左侧字段')
    return
  }
  const operand = parseOperand(condOperand.value)
  const rule: Rule = {
    type: 'condition',
    when: [condField.value, condOperator.value, operand],
  }
  emitUpdate([...currentRules.value, rule])
  startCondition()
}

function removeRule(index: number): void {
  const next = [...currentRules.value]
  next.splice(index, 1)
  emitUpdate(next)
}

function emitUpdate(rules: Rule[]): void {
  if (scope.value === 'module') {
    emit('update', { ...props.schema, rules })
    return
  }
  const fields = props.schema.fields.map(f =>
    f.key === scope.value ? { ...f, rules } : f,
  )
  emit('update', { ...props.schema, fields })
}

function ruleSummary(rule: Rule): string {
  if (rule.type === 'compute') return `compute: ${rule.target} = ${rule.expr}  (watch: ${rule.watch.join(', ')})`
  if (rule.type === 'condition') return 'condition 规则（引擎 visibleWhen 同族）'
  return `${rule.type} 规则（请在源码中维护）`
}
</script>

<template>
  <div class="rules-editor">
    <div class="rules-editor__scope">
      <span class="rules-editor__label">作用域</span>
      <ElSelect :model-value="scope" @update:model-value="switchScope">
        <ElOption label="模块级 rules" value="module" />
        <ElOption v-for="f in schema.fields" :key="f.key" :label="`字段: ${f.key}`" :value="f.key" />
      </ElSelect>
    </div>

    <ElAlert
      v-if="diagnostics.length > 0"
      type="error"
      :closable="false"
      class="rules-editor__issues"
    >
      <div v-for="(issue, i) in diagnostics" :key="i">
        [{{ issue.code }}] {{ issue.path }} — {{ issue.message }}
      </div>
    </ElAlert>

    <div class="rules-editor__list">
      <div v-if="currentRules.length === 0" class="rules-editor__empty">当前作用域暂无规则</div>
      <div v-for="(rule, i) in currentRules" :key="i" class="rules-editor__rule">
        <ElTag size="small">{{ rule.type }}</ElTag>
        <span class="rules-editor__summary">{{ ruleSummary(rule) }}</span>
        <ElButton size="small" text type="danger" @click="removeRule(i)">删除</ElButton>
      </div>
    </div>

    <div class="rules-editor__forms">
      <div class="rules-editor__form">
        <div class="rules-editor__form-title">compute（求值链）</div>
        <ElSelect v-model="editTarget" filterable placeholder="target 目标字段" clearable>
          <ElOption v-for="k in fieldKeys" :key="k" :label="k" :value="k" />
        </ElSelect>
        <ElSelect v-model="editWatch" multiple filterable placeholder="watch 依赖字段" class="rules-editor__watch">
          <ElOption v-for="k in fieldKeys" :key="k" :label="k" :value="k" />
        </ElSelect>
        <ElInput
          v-model="editExpr"
          placeholder="expr 表达式，如 price * quantity"
          :class="{ 'rules-editor__expr--bad': !exprSyntaxOk }"
        />
        <div class="rules-editor__hint">
          <span v-if="!exprSyntaxOk" class="rules-editor__hint--bad">表达式语法错误</span>
          <span v-else>{{ exprPreview }}</span>
        </div>
        <ElButton type="primary" size="small" @click="commitCompute">添加 compute 规则</ElButton>
      </div>

      <div class="rules-editor__form">
        <div class="rules-editor__form-title">condition（条件）</div>
        <ElSelect v-model="condField" filterable placeholder="左侧字段" clearable>
          <ElOption v-for="k in fieldKeys" :key="k" :label="k" :value="k" />
        </ElSelect>
        <ElSelect v-model="condOperator" placeholder="操作符">
          <ElOption v-for="op in OPERATORS" :key="op.value" :label="op.label" :value="op.value" />
        </ElSelect>
        <ElInput v-model="condOperand" placeholder="操作数（JSON 字面量；isEmpty 等可留空）" />
        <ElButton type="primary" size="small" @click="commitCondition">添加 condition 规则</ElButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rules-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rules-editor__scope {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 360px;
}
.rules-editor__label {
  font-size: 13px;
  color: var(--sg-color-text-secondary, #606266);
}
.rules-editor__issues {
  white-space: pre-wrap;
}
.rules-editor__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rules-editor__rule {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid var(--sg-border-color-lighter, #ebeef5);
  border-radius: 4px;
}
.rules-editor__summary {
  flex: 1;
  font-size: 12px;
  font-family: monospace;
}
.rules-editor__empty {
  font-size: 13px;
  color: var(--sg-color-text-secondary, #909399);
}
.rules-editor__forms {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}
.rules-editor__form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 280px;
  padding: 12px;
  border: 1px solid var(--sg-border-color-lighter, #ebeef5);
  border-radius: 6px;
}
.rules-editor__form-title {
  font-weight: 600;
  font-size: 13px;
}
.rules-editor__hint {
  font-size: 12px;
  color: var(--sg-color-text-secondary, #909399);
  min-height: 16px;
}
.rules-editor__hint--bad {
  color: var(--el-color-danger, #f56c6c);
}
.rules-editor__expr--bad :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger, #f56c6c) inset;
}
</style>
