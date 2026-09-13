<script setup lang="ts">
import { ref } from 'vue'
import { ElPagination } from 'element-plus'

const props = defineProps<{
  page: number
  pageSize: number
  total: number
  loading?: boolean
}>()

const emit = defineEmits<{
  'page-change': [payload: { page: number; pageSize: number }]
  'page-size-change': [payload: { pageSize: number }]
}>()

const localPageSize = ref(props.pageSize)

function handleCurrentChange(val: number): void {
  emit('page-change', { page: val, pageSize: localPageSize.value })
}

function handleSizeChange(val: number): void {
  localPageSize.value = val
  emit('page-size-change', { pageSize: val })
}
</script>

<template>
  <div class="schema-pagination">
    <ElPagination
      v-if="total > 0"
      :current-page="page"
      :page-size="pageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      :disabled="loading"
      layout="total, sizes, prev, pager, next, jumper"
      background
      size="small"
      @update:current-page="handleCurrentChange"
      @update:page-size="handleSizeChange"
    />
    <span v-else class="pagination-empty"></span>
  </div>
</template>

<style scoped>
.schema-pagination {
  display: flex;
  justify-content: flex-end;
  padding: var(--sg-spacing-4) var(--sg-spacing-8);
  border-top: 1px solid var(--sg-border-color-light);
}
.pagination-empty {
  height: 32px;
}
</style>
