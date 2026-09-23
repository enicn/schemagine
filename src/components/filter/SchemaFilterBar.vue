<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Filter } from '@element-plus/icons-vue'
import { ElButton, ElButtonGroup, ElPopover, ElTag } from 'element-plus'
import type { FieldSchema, FilterCondition } from '@/types'
import { resolveFkLabelForSummary } from '@/composables/useFkLabelCache'
import { flattenFilterConditions, type FilterMatchType } from '@/utils/filterConditions'
import FilterConditionControls from './FilterConditionControls.vue'

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

const supportedFilterTypes = new Set<FieldSchema['type']>(['text', 'select', 'multi-select', 'date', 'datetime', 'boolean', 'fk'])

const filterableFields = computed(() => props.fields.filter(f => f.filterable && supportedFilterTypes.has(f.type)))

// 草稿状态（本栏子句/操作符切换/日期模式/空值筛选/FK 候选）在 FilterConditionControls 内单源维护，
// 弹层只负责开关时机（打开同步、确认/重置上抛）
const controlsRef = ref<InstanceType<typeof FilterConditionControls> | null>(null)
const matchType = ref<FilterMatchType>('all')

const popoverVisible = ref(false)

// 受控弹层的误报关闭守卫（0.3.9 起 teleport 到 body 后暴露）：ElPopover 在受控 :visible
// 模式下会把「内容内点击」「teleport 面板（.sg-filter-popper：下拉/日期面板挂 body）内点击」
// 误判为外部点击并发 update:visible(false)，导致选完一个条件弹层即被级联关闭。
// pointerdown 捕获段记录来源，落在弹层内容∪teleport 面板∪触发按钮内时吞掉关闭请求；
// 真外部点击与触发按钮二击照常关（确认/重置/摘要标签走各自的直接赋值，不经此处）。
let pointerInFilterSurface = false
function handleDocPointerDownCapture(event: PointerEvent): void {
  const target = event.target as Element | null
  pointerInFilterSurface = !!target?.closest?.('.filter-popover-body, .sg-filter-popper, .filter-bar-header .el-button')
}
onMounted(() => document.addEventListener('pointerdown', handleDocPointerDownCapture, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleDocPointerDownCapture, true))

function applyFilter(): void {
  const next = controlsRef.value?.apply() ?? []
  emit('update:modelValue', next)
  emit('search', next)
}

import { buildFilterSummaryItems, type FilterSummaryItem } from '@/utils/filterSummary'

/** 摘要类型随共享工具走(兼容原组件导出) */
export type { FilterSummaryItem }

function buildFilterSummary(clauses?: FilterCondition[]): FilterSummaryItem[] {
  const items = flattenFilterConditions(clauses ?? [])
  return buildFilterSummaryItems(items, props.fields, resolveFkLabelForSummary)
}

function getFilterSummary(): FilterSummaryItem[] {
  return controlsRef.value?.buildSummary(props.modelValue) ?? buildFilterSummary(props.modelValue)
}

function getFilterSummaryText(): string {
  return getFilterSummary().map(item => `${item.label} ${item.operatorLabel} ${item.valueLabel}`).join('，')
}

function handleRemoveTag(fieldKey: string): void {
  emit('remove-filter', fieldKey)
}

function handlePopoverVisibleChange(visible: boolean): void {
  if (visible) {
    controlsRef.value?.resync()
  } else if (pointerInFilterSurface) {
    return
  }
  popoverVisible.value = visible
}

function handlePopoverConfirm(): void {
  applyFilter()
  popoverVisible.value = false
}

function handlePopoverReset(): void {
  controlsRef.value?.reset()
  applyFilter()
  popoverVisible.value = false
}

const activeFilterCount = computed(() => props.modelValue.filter(c => filterableFields.value.some(f => f.key === (c as { field?: string }).field)).length)

const hasMultiDrafts = computed(() => (controlsRef.value?.activeCount ?? 0) > 1)

defineExpose({
  getFilterSummary,
  getFilterSummaryText,
  getFilterClauses: () => flattenFilterConditions(props.modelValue),
  resetFilters: () => controlsRef.value?.reset(),
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
        :z-index="4000"
        @update:visible="handlePopoverVisibleChange"
      >
        <template #reference>
          <ElButton size="small" :icon="Filter" :type="activeFilterCount > 0 ? 'primary' : ''">
            <span class="filter-btn-label">筛选</span>
            <ElTag v-if="activeFilterCount > 0" size="small" class="filter-count-badge" round>
              {{ activeFilterCount }}
            </ElTag>
          </ElButton>
        </template>

        <div class="filter-popover-body">
          <FilterConditionControls
            ref="controlsRef"
            :fields="filterableFields"
            :model-value="modelValue"
            :match-type="matchType"
            @submit="handlePopoverConfirm"
          />

          <div class="filter-popover-actions">
            <div v-if="hasMultiDrafts" class="match-toggle">
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
        v-for="item in getFilterSummary()"
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
.filter-popover-body :deep(.filter-condition-controls) {
  overflow-y: auto;
  padding-right: var(--sg-spacing-2);
  flex: 1;
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
</style>
