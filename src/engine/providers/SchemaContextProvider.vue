<script setup lang="ts">
import { provide, computed } from 'vue'
import { useSchema } from '@/composables/useSchema'
import { useSchemaMeta, useRecords, useUi } from '@/composables/instanceState'
import type { ViewMode } from '@/constants'

defineProps<{
  moduleId: string
  initialViewMode?: ViewMode
}>()

const schemaMeta = useSchemaMeta()
const recordStore = useRecords()
const uiState = useUi()
const schema = useSchema()

interface SchemaContext {
  schema: typeof schemaMeta.schema
  viewConfig: typeof schemaMeta.viewConfig
  permissions: typeof schemaMeta.permissions
  records: typeof recordStore.records
  queryState: typeof recordStore.queryState
  isSchemaLoading: typeof schemaMeta.isLoading
  isRecordsLoading: typeof recordStore.isLoading
  viewMode: typeof uiState.viewMode
  loadModule: typeof schema.loadModule
  setViewMode: typeof schema.setViewMode
}

const context = computed<SchemaContext>(() => ({
  schema: schemaMeta.schema,
  viewConfig: schemaMeta.viewConfig,
  permissions: schemaMeta.permissions,
  records: recordStore.records,
  queryState: recordStore.queryState,
  isSchemaLoading: schemaMeta.isLoading,
  isRecordsLoading: recordStore.isLoading,
  viewMode: uiState.viewMode,
  loadModule: schema.loadModule,
  setViewMode: schema.setViewMode,
}))

provide('schemaContext', context)
</script>

<template>
  <slot />
</template>
