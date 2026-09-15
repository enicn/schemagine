<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue'
import { ElInput, ElSelect, ElOption, ElButton, ElDatePicker, ElButtonGroup, ElTooltip, ElPopover, ElTag } from 'element-plus'
import type { FieldSchema, FilterClause, FilterCondition, FilterOperator, CandidateOption } from '@/types'
import { candidateService } from '@/services/api/candidateService'
import { composeBarConditions, splitBarConditions, flattenFilterConditions, type FilterMatchType } from '@/utils/filterConditions'

const props = defineProps<{
  fields: FieldSchema[]
  modelValue: FilterCondition[]
  infiniteScroll?: boolean
  showFilterStatus?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: FilterCondition[]]
  search: [payload: FilterCondition[]]
  reset: [payload: void]
  'remove-filter': [fieldKey: string]
}>()

type DateFilterMode = 'single' | 'range'

const supportedFilterTypes = new Set<FieldSchema['type']>(['text', 'select', 'multi-select', 'date', 'datetime', 'boolean', 'fk'])

const filterableFields = computed(() => props.fields.filter(f => f.filterable && supportedFilterTypes.has(f.type)))

// 本栏草稿只含「本栏可管理」的条件(受支持的可筛选字段);其余条件(如表头筛选产生的
// 其他字段子句)作为 foreign 原样透传,不参与本栏编辑(docs/19 批次 E1/E2)
const localClauses = ref<FilterClause[]>([])
const foreignClauses = ref<FilterClause[]>([])
const matchType = ref<FilterMatchType>('all')

function isBarManagedClause(clause: FilterClause): boolean {
  return filterableFields.value.some(f => f.key === clause.field)
}

const dateFilterModes = reactive<Record<string, DateFilterMode>>({})

const operatorSelections = reactive<Record<string, { baseOp: FilterOperator; exclude: boolean }>>({})

const nullFilterStates = reactive<Record<string, 'isNull' | 'isNotNull' | null>>({})

const fkOptions = reactive<Record<string, CandidateOption[]>>({})
const fkLoading = reactive<Record<string, boolean>>({})

function fieldSupportsNullFilter(field: FieldSchema): boolean {
  return field.nullableFilter === true
}

watch(filterableFields, () => {
  for (const field of filterableFields.value) {
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
function buildEmitConditions(): FilterCondition[] {
  return composeBarConditions(foreignClauses.value, localClauses.value, matchType.value)
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

function applyFilter(): void {
  const next = buildEmitConditions()
  emit('update:modelValue', next)
  emit('search', next)
}

import { buildFilterSummaryItems, type FilterSummaryItem } from '@/utils/filterSummary'

/** 摘要类型随共享工具走(兼容原组件导出) */
export type { FilterSummaryItem }

function buildFilterSummary(clauses?: FilterCondition[]): FilterSummaryItem[] {
  const items = flattenFilterConditions(clauses ?? localClauses.value)
  return buildFilterSummaryItems(items, props.fields, (field, value) => {
    const options = fkOptions[field.key] || []
    const opt = options.find(o => o.value === value)
    return opt ? opt.label : String(value ?? '')
  })
}

function getFilterSummary(): FilterSummaryItem[] {
  return buildFilterSummary(props.modelValue)
}

function getFilterSummaryText(): string {
  const items = buildFilterSummary(props.modelValue)
  return items.map(item => `${item.label} ${item.operatorLabel} ${item.valueLabel}`).join('，')
}

function handleRemoveTag(fieldKey: string): void {
  const idx = localClauses.value.findIndex(c => c.field === fieldKey)
  if (idx >= 0) localClauses.value.splice(idx, 1)
  const foreignIdx = foreignClauses.value.findIndex(c => c.field === fieldKey)
  if (foreignIdx >= 0) foreignClauses.value.splice(foreignIdx, 1)
  applyFilter()
}

function syncCommittedToDraft(): void {
  const { foreign, managed, matchType: parsedMatch } = splitBarConditions(props.modelValue, isBarManagedClause)
  localClauses.value = managed.map(c => ({ ...c }))
  foreignClauses.value = foreign.map(c => ({ ...c }))
  matchType.value = parsedMatch
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

const popoverVisible = ref(false)

function handlePopoverVisibleChange(visible: boolean): void {
  if (visible) {
    syncCommittedToDraft()
  }
  popoverVisible.value = visible
}

function handlePopoverConfirm(): void {
  applyFilter()
  popoverVisible.value = false
}

function handlePopoverReset(): void {
  resetFilters()
  applyFilter()
  popoverVisible.value = false
}

const activeFilterCount = computed(() => localClauses.value.length)

defineExpose({
  getFilterSummary,
  getFilterSummaryText,
  getFilterClauses: () => flattenFilterConditions(props.modelValue),
  resetFilters,
})
</script>

<template>
  <div v-if="filterableFields.length > 0" class="schema-filter-bar">
    <div class="filter-bar-header">
      <ElPopover
        :visible="popoverVisible"
        trigger="click"
        placement="bottom-start"
        :width="560"
        @update:visible="handlePopoverVisibleChange"
      >
        <template #reference>
          <ElButton size="small" :type="activeFilterCount > 0 ? 'primary' : ''">
            <span class="filter-btn-label">筛选</span>
            <ElTag v-if="activeFilterCount > 0" size="small" class="filter-count-badge" round>
              {{ activeFilterCount }}
            </ElTag>
          </ElButton>
        </template>

        <div class="filter-popover-body">
          <div class="filter-popover-items">
            <template v-for="field in filterableFields" :key="field.key">
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
                    @keyup.enter="handlePopoverConfirm"
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

          <div class="filter-popover-actions">
            <div v-if="localClauses.length > 1" class="match-toggle">
              <span class="match-label">匹配</span>
              <ElButtonGroup size="small">
                <ElButton size="small" :type="matchType === 'all' ? 'primary' : ''" @click="matchType = 'all'">全部条件</ElButton>
                <ElButton size="small" :type="matchType === 'any' ? 'primary' : ''" @click="matchType = 'any'">任一条件</ElButton>
              </ElButtonGroup>
            </div>
            <div class="popover-action-buttons">
              <ElButton size="small" type="primary" @click="handlePopoverConfirm">搜索</ElButton>
              <ElButton size="small" @click="handlePopoverReset">重置</ElButton>
            </div>
          </div>
        </div>
      </ElPopover></div>

    <!-- Active filter tags -->
    <div v-if="showFilterStatus && activeFilterCount > 0" class="filter-tags-row">
      <ElTag
        v-for="item in buildFilterSummary(props.modelValue)"
        :key="item.fieldKey"
        closable
        size="small"
        :type="item.operator === 'isNull' || item.operator === 'notIn' || item.operator === 'neq' || item.operator === 'notLike' || item.operator === 'notBetween' || item.operator === 'isNotNull' ? 'danger' : 'info'"
        @close="handleRemoveTag(item.fieldKey)"
        @click="popoverVisible = true"
      >
        <span class="tag-label">{{ item.label }}</span>
        <span class="tag-operator">{{ item.operatorLabel }}</span>
        <span class="tag-value">{{ item.valueLabel }}</span>
      </ElTag>
    </div>
  </div>
</template>

<style scoped>
.schema-filter-bar {
  padding: var(--sg-spacing-4) var(--sg-spacing-8);
  border-bottom: 1px solid var(--sg-border-color-light);
}
.filter-bar-header {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-4);
}
.filter-btn-label {
  margin-right: var(--sg-spacing-1);
}
.filter-count-badge {
  margin-left: var(--sg-spacing-1);
  background: var(--sg-bg-color);
  color: var(--sg-color-primary);
  border: none;
  font-weight: 600;
}
.filter-tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sg-spacing-3);
  margin-top: var(--sg-spacing-4);
}
.filter-tags-row .el-tag {
  cursor: pointer;
  transition: opacity var(--sg-duration-normal);
}
.filter-tags-row .el-tag:hover {
  opacity: 0.8;
}
.tag-label {
  font-weight: 600;
  margin-right: var(--sg-spacing-1);
}
.tag-operator {
  margin-right: var(--sg-spacing-1);
  color: var(--sg-text-color-secondary);
}
.tag-value {
  color: var(--sg-text-color-primary);
}

/* Popover form styles */
.filter-popover-body {
  max-height: 400px;
  display: flex;
  flex-direction: column;
}
.filter-popover-items {
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-4);
  overflow-y: auto;
  padding-right: var(--sg-spacing-2);
  flex: 1;
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
.filter-popover-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sg-spacing-4);
  padding-top: var(--sg-spacing-4);
  border-top: 1px solid var(--sg-border-color-light);
  margin-top: var(--sg-spacing-4);
}
.match-toggle {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
}
.match-label {
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
  white-space: nowrap;
}
.popover-action-buttons {
  display: flex;
  gap: var(--sg-spacing-4);
  margin-left: auto;
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
</style>
