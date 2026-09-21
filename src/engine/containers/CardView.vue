<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { ElButton, ElPagination } from 'element-plus'
import SchemaCard from '@/components/card/SchemaCard.vue'
import { useRecords, useSchemaMeta } from '@/composables/instanceState'
import type { FieldSchema, CardLayoutConfig } from '@/types'

const props = defineProps<{
  editable?: boolean
  cardLayout?: CardLayoutConfig | null
  autoEdit?: boolean
  /** 卡片密度（docs/20 appearance.cardDensity）：compact=普通字段每行 4 个并收紧间距 */
  density?: 'default' | 'compact'
}>()

const emit = defineEmits<{
  'field-change': [payload: { field: string; value: unknown; oldValue: unknown }]
  save: [payload: void]
  cancel: [payload: void]
  navigate: [payload: { direction: 'prev' | 'next'; index: number }]
  pageChange: [payload: { page: number }]
  /** 卡片头部 schema 动作上抛(docs/20):SchemaCard → CardView → SchemaEngine → 宿主 */
  'row-action': [payload: { rowId: string; field: string; actionId: string }]
}>()

const recordStore = useRecords()
const schemaMeta = useSchemaMeta()

const records = computed(() => recordStore.records)
const totalRecords = computed(() => recordStore.totalRecords)
const currentPage = computed(() => recordStore.queryState.pagination.page)
const pageSize = computed(() => recordStore.queryState.pagination.pageSize)

const currentIndex = ref(0)

const currentRecord = computed(() => {
  return records.value[currentIndex.value] || null
})

watch(
  [() => recordStore.currentRecord?.id ?? null, () => records.value],
  ([activeId]) => {
    if (!activeId) return
    const idx = records.value.findIndex(r => r.id === activeId)
    if (idx >= 0) {
      currentIndex.value = idx
    }
  },
  { immediate: true },
)

const fieldSchemas = computed<FieldSchema[]>(() => {
  return schemaMeta.visibleFields
})

const hasRecords = computed(() => records.value.length > 0)

function handlePrev(): void {
  if (currentIndex.value > 0) {
    currentIndex.value--
    emit('navigate', { direction: 'prev', index: currentIndex.value })
  }
}

function handleNext(): void {
  if (currentIndex.value < records.value.length - 1) {
    currentIndex.value++
    emit('navigate', { direction: 'next', index: currentIndex.value })
  }
}

function handleFieldChange(payload: { field: string; value: unknown; oldValue: unknown }): void {
  emit('field-change', payload)
}

function handlePageChange(page: number): void {
  emit('pageChange', { page })
}
</script>

<template>
  <div class="card-view" :class="{ 'card-view--compact': props.density === 'compact' }">
    <div v-if="!hasRecords" class="card-view-empty">
      <p>暂无记录</p>
    </div>

    <template v-else>
      <SchemaCard
        v-if="currentRecord"
        :key="currentRecord.id"
        :record="currentRecord"
        :field-schemas="fieldSchemas"
        :editable="editable"
        :card-layout="props.cardLayout"
        :auto-edit="props.autoEdit"
        :density="props.density"
        @field-change="handleFieldChange"
        @save="emit('save')"
        @cancel="emit('cancel')"
        @row-action="(p) => emit('row-action', p)"
      >
        <!-- 翻页器移入卡片头部中槽(docs/20)：利用头部空白，整卡更紧凑 -->
        <template #header-center>
          <div class="card-navigator">
            <ElButton
              size="small"
              :icon="ArrowLeft"
              :disabled="currentIndex <= 0"
              @click="handlePrev"
            >
              上一页
            </ElButton>
            <span class="navigator-info">
              记录 {{ currentIndex + 1 }} / {{ records.length }}
              <span class="navigator-total">（共 {{ totalRecords }} 条）</span>
            </span>
            <ElButton
              size="small"
              :icon="ArrowRight"
              :disabled="currentIndex >= records.length - 1"
              @click="handleNext"
            >
              下一页
            </ElButton>
          </div>
        </template>
        <!-- 卡片头部动作透传（docs/20）：宿主业务动作（如审核）注入卡片头 -->
        <template #extra-actions="slotProps">
          <slot name="extra-actions" v-bind="slotProps" />
        </template>
      </SchemaCard>

      <ElPagination
        v-if="totalRecords > pageSize"
        :current-page="currentPage"
        :page-size="pageSize"
        :total="totalRecords"
        layout="prev, pager, next"
        size="small"
        class="card-pagination"
        @current-change="handlePageChange"
      />
    </template>
  </div>
</template>

<style scoped>
.card-view {
  padding: var(--sg-spacing-8);
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-6);
  height: 100%;
}
.card-view-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--sg-text-color-secondary);
}
.card-navigator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sg-spacing-3);
  flex-shrink: 0;
  min-width: 0;
}

/* 紧凑密度（docs/20）：容器内边距去除、卡片体收紧，配合头部翻页器尽可能免滚动 */
.card-view--compact {
  gap: var(--sg-spacing-2);
  padding: 0;
}
.card-view--compact :deep(.schema-card .el-card__body) {
  padding: var(--sg-spacing-4) var(--sg-spacing-5);
}
.card-view--compact :deep(.schema-card.el-card) {
  border-radius: 0;
}
.card-view--compact .navigator-info {
  font-size: var(--sg-font-size-sm);
  white-space: nowrap;
}
.card-view--compact .card-navigator :deep(.el-button + .el-button) {
  margin-left: var(--sg-spacing-2);
}
.navigator-info {
  font-size: var(--sg-font-size-lg);
  color: var(--sg-text-color-regular);
}
.navigator-total {
  color: var(--sg-text-color-secondary);
}
.card-pagination {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}
</style>
