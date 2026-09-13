<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElButton, ElPagination } from 'element-plus'
import SchemaCard from '@/components/card/SchemaCard.vue'
import { useRecords, useSchemaMeta } from '@/composables/instanceState'
import type { FieldSchema, CardLayoutConfig } from '@/types'

const props = defineProps<{
  editable?: boolean
  cardLayout?: CardLayoutConfig | null
  autoEdit?: boolean
}>()

const emit = defineEmits<{
  'field-change': [payload: { field: string; value: unknown; oldValue: unknown }]
  save: [payload: void]
  cancel: [payload: void]
  navigate: [payload: { direction: 'prev' | 'next'; index: number }]
  pageChange: [payload: { page: number }]
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
  <div class="card-view">
    <div v-if="!hasRecords" class="card-view-empty">
      <p>暂无记录</p>
    </div>

    <template v-else>
      <div class="card-navigator">
        <ElButton
          size="small"
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
          :disabled="currentIndex >= records.length - 1"
          @click="handleNext"
        >
          下一页
        </ElButton>
      </div>

      <SchemaCard
        v-if="currentRecord"
        :key="currentRecord.id"
        :record="currentRecord"
        :field-schemas="fieldSchemas"
        :editable="editable"
        :card-layout="props.cardLayout"
        :auto-edit="props.autoEdit"
        @field-change="handleFieldChange"
        @save="emit('save')"
        @cancel="emit('cancel')"
      />

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
  gap: var(--sg-spacing-6);
  padding: var(--sg-spacing-4) 0;
  flex-shrink: 0;
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
