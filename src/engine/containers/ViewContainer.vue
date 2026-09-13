<script setup lang="ts">
import { computed } from 'vue'
import type { ModuleSchema, QueryState, RecordEntity, UserViewConfig, FilterClause } from '@/types'
import type { ViewMode } from '@/constants'

const props = defineProps<{
  schema: ModuleSchema | null
  viewMode: ViewMode
  records: RecordEntity[]
  queryState: QueryState
  viewConfig: UserViewConfig | null
  loading: boolean
}>()

defineEmits<{
  'query-change': [payload: { filters: FilterClause[]; sort: any; pagination: { page: number; pageSize: number } }]
  'cell-edit': [payload: { rowId: string; field: string; value: unknown; oldValue: unknown; mode: string; source: string }]
  'open-quick-create': [payload: { field: string; targetModuleId: string }]
}>()

const currentView = computed(() => {
  if (!props.schema) return null
  return props.viewMode
})
</script>

<template>
  <div class="view-container">
    <slot name="toolbar" />

    <div class="view-content">
      <slot name="list-view" v-if="currentView === 'list'" />
      <slot name="card-view" v-else-if="currentView === 'card'" />
      <slot name="create-view" v-else-if="currentView === 'create'" />
      <div v-else class="empty-view">
        <p>无可用视图</p>
      </div>
    </div>

    <slot name="pagination" />
  </div>
</template>

<style scoped>
.view-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.view-content {
  flex: 1;
  overflow: auto;
}
.empty-view {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--sg-text-color-secondary);
}
</style>
