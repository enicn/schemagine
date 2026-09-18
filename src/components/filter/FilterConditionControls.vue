<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue'
import { ElInput, ElSelect, ElOption, ElButton, ElDatePicker, ElButtonGroup, ElTooltip } from 'element-plus'
import type { FieldSchema, FilterClause, FilterCondition, FilterOperator, CandidateOption } from '@/types'
import { candidateService } from '@/services/api/candidateService'
import { composeBarConditions, splitBarConditions, flattenFilterConditions, type FilterMatchType } from '@/utils/filterConditions'
import { buildFilterSummaryItems, type FilterSummaryItem } from '@/utils/filterSummary'

/**
 * 筛选值控件集（管理端移动适配 §3.6 自 SchemaFilterBar 抽取，逻辑单源）：
 * 按字段类型分派的 text/fk/select/date/boolean 控件模板 + 本栏草稿状态。
 * 桌面 popover 与移动端筛选底部抽屉两处消费；父级持有 matchType（匹配方式切换 UI 在父级），
 * 交互：resync()（打开时从已提交条件同步草稿）→ 用户改控件 → apply()（组装上抛条件）。
 */
const props = defineProps<{
  /** 可筛选字段（已按受支持类型过滤） */
  fields: FieldSchema[]
  /** 已提交的完整条件列表（含外来子句；本栏草稿只管理受管字段） */
  modelValue: FilterCondition[]
  /** 匹配方式（全部/任一），由父级持有与切换 */
  matchType: FilterMatchType
}>()

const emit = defineEmits<{
  /** 文本框回车等「立即应用」意图，由父级决定动作（桌面=确认弹层，移动=应用抽屉） */
  submit: []
}>()

type DateFilterMode = 'single' | 'range'

const localClauses = ref<FilterClause[]>([])
const foreignClauses = ref<FilterClause[]>([])

const dateFilterModes = reactive<Record<string, DateFilterMode>>({})

const operatorSelections = reactive<Record<string, { baseOp: FilterOperator; exclude: boolean }>>({})

const nullFilterStates = reactive<Record<string, 'isNull' | 'isNotNull' | null>>({})

const fkOptions = reactive<Record<string, CandidateOption[]>>({})
const fkLoading = reactive<Record<string, boolean>>({})

function fieldSupportsNullFilter(field: FieldSchema): boolean {
  return field.nullableFilter === true
}

watch(() => props.fields, (fields) => {
  for (const field of fields) {
    if (field.type === 'fk' && field.targetModule && !fkOptions[field.key]) {
      loadFkOptions(field)
    }
  }
}, { immediate: true })

async function loadFkOptions(field: FieldSchema): Promise<void> {
  const targetModule = field.targetModule
  if (!targetModule || fkLoading[field.key]) return
  fkLoading[field.key] = true
  try {
    const res = await candidateService.query({ targetModule, page: 1, pageSize: 200 })
    if (res.success) {
      fkOptions[field.key] = res.data.options
    }
  } finally {
    fkLoading[field.key] = false
  }
}

function resetFilters(): void {
  localClauses.value = []
  for (const key of Object.keys(dateFilterModes)) {
    delete dateFilterModes[key]
  }
  for (const key of Object.keys(operatorSelections)) {
    delete operatorSelections[key]
  }
  for (const key of Object.keys(nullFilterStates)) {
    delete nullFilterStates[key]
  }
}

/** 组装要上抛的完整条件列表(外来子句 + 本栏草稿按匹配方式组合) */
function buildConditions(): FilterCondition[] {
  return composeBarConditions(foreignClauses.value, localClauses.value, props.matchType)
}

function setClause(fieldKey: string, clause: FilterClause | null): void {
  const idx = localClauses.value.findIndex(c => c.field === fieldKey)
  if (clause === null) {
    if (idx >= 0) localClauses.value.splice(idx, 1)
  } else {
    if (idx >= 0) {
      localClauses.value[idx] = clause
    } else {
      localClauses.value.push(clause)
    }
  }
}

function getClause(fieldKey: string): FilterClause | undefined {
  return localClauses.value.find(c => c.field === fieldKey)
}

function getFieldOperator(field: FieldSchema): { baseOp: FilterOperator; exclude: boolean } {
  const key = field.key
  if (!operatorSelections[key]) {
    let defaultBaseOp: FilterOperator
    if (field.type === 'text') {
      defaultBaseOp = 'like'
    } else if (field.type === 'fk') {
      defaultBaseOp = 'in'
    } else {
      defaultBaseOp = 'eq'
    }
    operatorSelections[key] = { baseOp: defaultBaseOp, exclude: false }
  }
  return operatorSelections[key]
}

function setBaseOp(fieldKey: string, op: FilterOperator): void {
  if (!operatorSelections[fieldKey]) {
    operatorSelections[fieldKey] = { baseOp: op, exclude: false }
  } else {
    operatorSelections[fieldKey].baseOp = op
  }
}

function toggleExclude(fieldKey: string): void {
  if (!operatorSelections[fieldKey]) return
  operatorSelections[fieldKey].exclude = !operatorSelections[fieldKey].exclude
}

function resolveOperator(baseOp: FilterOperator, exclude: boolean): FilterOperator {
  if (!exclude) return baseOp
  const negMap: Partial<Record<FilterOperator, FilterOperator>> = {
    eq: 'neq',
    like: 'notLike',
    in: 'notIn',
    between: 'notBetween',
  }
  return negMap[baseOp] || baseOp
}

function getDateFilterMode(fieldKey: string): DateFilterMode {
  return dateFilterModes[fieldKey] || 'single'
}

function setDateFilterMode(fieldKey: string, mode: DateFilterMode): void {
  dateFilterModes[fieldKey] = mode
  if (!operatorSelections[fieldKey]) {
    operatorSelections[fieldKey] = { baseOp: mode === 'range' ? 'between' : 'eq', exclude: false }
  } else {
    operatorSelections[fieldKey].baseOp = mode === 'range' ? 'between' : 'eq'
  }
  setClause(fieldKey, null)
}

function commitFilter(field: FieldSchema): void {
  const clause = getClause(field.key)
  if (clause) {
    const { baseOp, exclude } = getFieldOperator(field)
    clause.operator = resolveOperator(baseOp, exclude)
  }
}

function handleTextInput(field: FieldSchema, value: string): void {
  if (!value) {
    setClause(field.key, null)
    commitFilter(field)
    return
  }
  setClause(field.key, { field: field.key, operator: 'like', value })
  commitFilter(field)
}

function handleSelectChange(field: FieldSchema, value: unknown): void {
  if (value == null || value === '') {
    setClause(field.key, null)
    commitFilter(field)
    return
  }
  setClause(field.key, { field: field.key, operator: 'eq', value })
  commitFilter(field)
}

function handleDateSingleChange(field: FieldSchema, value: string | null): void {
  if (!value) {
    setClause(field.key, null)
    commitFilter(field)
    return
  }
  setClause(field.key, { field: field.key, operator: 'eq', value })
  commitFilter(field)
}

function handleDateRangeChange(field: FieldSchema, value: [string, string] | null): void {
  if (!value || !value[0] || !value[1]) {
    setClause(field.key, null)
    commitFilter(field)
    return
  }
  setClause(field.key, { field: field.key, operator: 'between', values: [value[0], value[1]] })
  commitFilter(field)
}

function handleBoolChange(field: FieldSchema, value: unknown): void {
  if (value == null || value === '') {
    setClause(field.key, null)
    commitFilter(field)
    return
  }
  setClause(field.key, { field: field.key, operator: 'eq', value })
  commitFilter(field)
}

function handleFkMultiChange(field: FieldSchema, values: unknown[]): void {
  if (!values || values.length === 0) {
    setClause(field.key, null)
    commitFilter(field)
    return
  }
  setClause(field.key, { field: field.key, operator: 'in', values })
  commitFilter(field)
}

function toggleTextSearchMode(field: FieldSchema): void {
  const { exclude } = getFieldOperator(field)
  const newBase = operatorSelections[field.key]?.baseOp === 'like' ? 'eq' : 'like'
  setBaseOp(field.key, newBase)
  const existing = getClause(field.key)
  if (existing && existing.value) {
    existing.operator = resolveOperator(newBase, exclude)
    commitFilter(field)
  }
}

function handleExcludeToggle(field: FieldSchema): void {
  toggleExclude(field.key)
  const existing = getClause(field.key)
  if (existing && (existing.value != null || (existing.values && existing.values.length > 0))) {
    const { baseOp, exclude } = getFieldOperator(field)
    existing.operator = resolveOperator(baseOp, exclude)
    commitFilter(field)
  }
}

function isActive(fieldKey: string): boolean {
  return !!getClause(fieldKey)
}

function getNullFilterState(fieldKey: string): 'isNull' | 'isNotNull' | null {
  return nullFilterStates[fieldKey] ?? null
}

function handleNullFilterToggle(field: FieldSchema): void {
  const current = nullFilterStates[field.key]
  if (current === null) {
    nullFilterStates[field.key] = 'isNull'
    setClause(field.key, { field: field.key, operator: 'isNull', value: null })
  } else if (current === 'isNull') {
    nullFilterStates[field.key] = 'isNotNull'
    setClause(field.key, { field: field.key, operator: 'isNotNull', value: null })
  } else {
    delete nullFilterStates[field.key]
    setClause(field.key, null)
  }
  commitFilter(field)
}

function syncCommittedToDraft(): void {
  const isBarManagedClause = (clause: FilterClause): boolean =>
    props.fields.some(f => f.key === clause.field)
  const { foreign, managed, matchType: parsedMatch } = splitBarConditions(props.modelValue, isBarManagedClause)
  localClauses.value = managed.map(c => ({ ...c }))
  foreignClauses.value = foreign.map(c => ({ ...c }))
  for (const key of Object.keys(dateFilterModes)) {
    delete dateFilterModes[key]
  }
  for (const key of Object.keys(operatorSelections)) {
    delete operatorSelections[key]
  }
  for (const key of Object.keys(nullFilterStates)) {
    delete nullFilterStates[key]
  }
  for (const clause of localClauses.value) {
    const field = props.fields.find(f => f.key === clause.field)
    if (field && (field.type === 'date' || field.type === 'datetime')) {
      if (clause.operator === 'between' || clause.operator === 'notBetween') {
        dateFilterModes[clause.field] = 'range'
        operatorSelections[clause.field] = { baseOp: 'between', exclude: clause.operator === 'notBetween' }
      } else if (clause.operator === 'eq' || clause.operator === 'neq') {
        dateFilterModes[clause.field] = 'single'
        operatorSelections[clause.field] = { baseOp: 'eq', exclude: clause.operator === 'neq' }
      }
    }
  }
}

const activeCount = computed(() => localClauses.value.length)

/** 摘要（FK 候选值已加载时出人读标签），供父级标签行/expose 同口径 */
function buildSummary(clauses?: FilterCondition[]): FilterSummaryItem[] {
  const items = flattenFilterConditions(clauses ?? props.modelValue)
  return buildFilterSummaryItems(items, props.fields, (field, value) => {
    const options = fkOptions[field.key] || []
    const opt = options.find(o => o.value === value)
    return opt ? opt.label : String(value ?? '')
  })
}

defineExpose({
  /** 打开抽屉/弹层时调用：从已提交条件重建本栏草稿 */
  resync: syncCommittedToDraft,
  /** 组装上抛条件（不改草稿） */
  apply: buildConditions,
  reset: resetFilters,
  activeCount,
  buildSummary,
  getFilterClauses: () => flattenFilterConditions(props.modelValue),
})

export type { FilterSummaryItem }
</script>

<template>
  <div class="filter-condition-controls">
    <template v-for="field in fields" :key="field.key">
      <div class="filter-popover-item" :class="{ 'is-active': isActive(field.key) }">
        <label class="filter-popover-label">
          {{ field.label }}
          <ElTooltip
            v-if="isActive(field.key) && !getNullFilterState(field.key)"
            :content="getFieldOperator(field).exclude ? '点击取消排除' : '点击排除'"
            placement="top"
          >
            <ElButton
              size="small"
              :type="getFieldOperator(field).exclude ? 'danger' : ''"
              class="exclude-btn"
              @click="handleExcludeToggle(field)"
            >≠</ElButton>
          </ElTooltip>
          <ElTooltip
            v-if="fieldSupportsNullFilter(field)"
            :content="getNullFilterState(field.key) === 'isNull' ? '点击切换为非空' : getNullFilterState(field.key) === 'isNotNull' ? '点击取消空值筛选' : '点击筛选空值'"
            placement="top"
          >
            <ElButton
              size="small"
              :type="getNullFilterState(field.key) ? 'primary' : ''"
              class="null-toggle-btn"
              @click="handleNullFilterToggle(field)"
            >空</ElButton>
          </ElTooltip>
        </label>

        <!-- Null filter active badge -->
        <div v-if="getNullFilterState(field.key)" class="null-filter-badge">
          <span>{{ getNullFilterState(field.key) === 'isNull' ? '值为空' : '值不为空' }}</span>
        </div>

        <!-- Text field: like/eq + exclude toggle -->
        <div v-else-if="field.type === 'text'" class="field-control-group">
          <ElTooltip
            :content="getFieldOperator(field).baseOp === 'like' ? '当前: 模糊匹配' : '当前: 精确匹配'"
            placement="top"
          >
            <ElButton
              size="small"
              class="op-toggle-btn"
              @click="toggleTextSearchMode(field)"
            >
              {{ getFieldOperator(field).baseOp === 'like' ? '模糊' : '精确' }}
            </ElButton>
          </ElTooltip>
          <ElInput
            :model-value="(getClause(field.key)?.value as string) || ''"
            :placeholder="`搜索${field.label}`"
            size="small"
            clearable
            class="filter-input"
            @input="(val: string | number) => handleTextInput(field, String(val))"
            @keyup.enter="emit('submit')"
          />
        </div>

        <!-- FK field: multi-select in/notIn -->
        <ElSelect
          v-else-if="field.type === 'fk'"
          :model-value="(getClause(field.key)?.values as string[]) || []"
          :placeholder="`选择${field.label}`"
          size="small"
          clearable
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          :loading="fkLoading[field.key]"
          :teleported="false"
          class="filter-fk-select"
          @update:model-value="(val: unknown) => handleFkMultiChange(field, val as unknown[])"
        >
          <ElOption
            v-for="opt in fkOptions[field.key] || []"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
            :disabled="opt.disabled"
          />
        </ElSelect>

        <!-- Select field: eq/neq -->
        <ElSelect
          v-else-if="field.type === 'select' || field.type === 'multi-select'"
          :model-value="getClause(field.key)?.value as string | number | boolean"
          :placeholder="`选择${field.label}`"
          size="small"
          clearable
          :teleported="false"
          class="filter-select"
          @update:model-value="(val: unknown) => handleSelectChange(field, val)"
        >
          <ElOption
            v-for="opt in field.options"
            :key="String(opt.value)"
            :label="opt.label"
            :value="opt.value"
          />
        </ElSelect>

        <!-- Date/datetime field: single eq / range between + exclude -->
        <div v-else-if="field.type === 'date' || field.type === 'datetime'" class="date-filter-group">
          <ElButtonGroup size="small" class="date-mode-toggle">
            <ElButton
              :type="getDateFilterMode(field.key) === 'single' ? 'primary' : ''"
              size="small"
              @click="setDateFilterMode(field.key, 'single')"
            >单日</ElButton>
            <ElButton
              :type="getDateFilterMode(field.key) === 'range' ? 'primary' : ''"
              size="small"
              @click="setDateFilterMode(field.key, 'range')"
            >范围</ElButton>
          </ElButtonGroup>
          <ElDatePicker
            v-if="getDateFilterMode(field.key) === 'single'"
            :model-value="getClause(field.key)?.value as string"
            :type="field.type === 'datetime' ? 'datetime' : 'date'"
            :format="field.type === 'datetime' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD'"
            :value-format="field.type === 'datetime' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD'"
            :placeholder="`选择${field.label}`"
            size="small"
            clearable
            :teleported="false"
            style="width: 160px"
            @update:model-value="(val: string | null) => handleDateSingleChange(field, val)"
          />
          <ElDatePicker
            v-else
            :model-value="getClause(field.key)?.values as [string, string]"
            :type="field.type === 'datetime' ? 'datetimerange' : 'daterange'"
            :format="field.type === 'datetime' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD'"
            :value-format="field.type === 'datetime' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD'"
            range-separator="至"
            :start-placeholder="`开始${field.label}`"
            :end-placeholder="`结束${field.label}`"
            size="small"
            clearable
            :teleported="false"
            style="width: 260px"
            @update:model-value="(val: [string, string] | null) => handleDateRangeChange(field, val)"
          />
        </div>

        <!-- Boolean field: eq/neq -->
        <ElSelect
          v-else-if="field.type === 'boolean'"
          :model-value="getClause(field.key)?.value as string | number | boolean"
          :placeholder="`选择${field.label}`"
          size="small"
          clearable
          :teleported="false"
          class="filter-select"
          @update:model-value="(val: unknown) => handleBoolChange(field, val)"
        >
          <ElOption label="是" :value="true" />
          <ElOption label="否" :value="false" />
        </ElSelect>
      </div>
    </template>
  </div>
</template>

<style scoped>
.filter-condition-controls {
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-4);
}
.filter-popover-item {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-3);
  padding: var(--sg-spacing-2) var(--sg-spacing-3);
  border-radius: var(--sg-radius-md);
  border: 1px solid transparent;
  min-height: 32px;
}
.filter-popover-item.is-active {
  background: var(--sg-color-primary-light-9);
  border-color: var(--sg-color-primary-light-7);
}
.filter-popover-label {
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-regular);
  white-space: nowrap;
  min-width: 56px;
  display: inline-flex;
  align-items: center;
  gap: var(--sg-spacing-1);
  flex-shrink: 0;
}
.exclude-btn {
  padding: 0 var(--sg-spacing-2);
  font-size: var(--sg-font-size-base);
  font-weight: bold;
  min-width: 20px;
  height: 20px;
}
.field-control-group {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-1);
}
.op-toggle-btn {
  padding: 0 var(--sg-spacing-3);
  font-size: var(--sg-font-size-sm);
  min-width: 32px;
  height: 24px;
}
.filter-input {
  width: 180px;
}
.filter-select {
  min-width: 140px;
}
.filter-fk-select {
  min-width: 200px;
}
.date-filter-group {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
}
.date-mode-toggle {
  flex-shrink: 0;
}
.null-toggle-btn {
  padding: 0 var(--sg-spacing-2);
  font-size: var(--sg-font-size-sm);
  min-width: 22px;
  height: 20px;
  font-weight: 600;
}
.null-filter-badge {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--sg-spacing-5);
  height: 24px;
  font-size: var(--sg-font-size-base);
  color: var(--sg-color-primary);
  background: var(--sg-color-primary-light-9);
  border-radius: var(--sg-radius-md);
  border: 1px solid var(--sg-color-primary-light-8);
  white-space: nowrap;
}

/* 移动端筛选抽屉内的形态：控件纵排铺满行宽（桌面 popover 横排不变） */
@media (max-width: 767.98px) {
  .filter-popover-item {
    flex-wrap: wrap;
  }
  .filter-popover-label {
    min-width: 0;
    width: 100%;
  }
  .field-control-group,
  .date-filter-group,
  .filter-select,
  .filter-fk-select,
  .filter-input {
    width: 100%;
  }
  .filter-input :deep(.el-input__wrapper),
  .filter-select,
  .filter-fk-select {
    max-width: none;
  }
  .filter-input {
    flex: 1;
  }
}
</style>
