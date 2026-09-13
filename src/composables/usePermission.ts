import { computed } from 'vue'
import { useSchemaMeta, type SchemaMetaState } from '@/composables/instanceState'
import { resolveDataOperations, type ResolvedDataOperations } from '@/utils/dataOperations'

export function usePermission(schemaMetaParam?: SchemaMetaState) {
  const schemaMeta = schemaMetaParam ?? useSchemaMeta()

  const canView = computed(() => schemaMeta.permissions?.view ?? false)
  const canCreate = computed(() => schemaMeta.permissions?.create ?? false)
  const canEdit = computed(() => schemaMeta.permissions?.edit ?? false)
  const canDelete = computed(() => schemaMeta.permissions?.delete ?? false)
  const canExport = computed(() => schemaMeta.permissions?.export ?? false)
  const canConfigure = computed(() => schemaMeta.permissions?.configure ?? false)

  // 标准数据操作（删除）：配置 × 权限 双重门控
  const deleteOperations = computed<ResolvedDataOperations>(() =>
    resolveDataOperations(schemaMeta.schema, schemaMeta.permissions),
  )
  const canDeleteRecords = computed(() => deleteOperations.value.canDelete)
  const canBatchDeleteRecords = computed(() => deleteOperations.value.canBatchDelete)

  function isFieldVisible(fieldKey: string): boolean {
    const field = schemaMeta.getField(fieldKey)
    if (!field) return false
    if (!field.visible) return false
    if (field.permission && !field.permission.visible) return false
    return true
  }

  function isFieldEditable(fieldKey: string): boolean {
    const field = schemaMeta.getField(fieldKey)
    if (!field) return false
    if (field.readonly) return false
    if (field.permission && !field.permission.editable) return false
    return canEdit.value
  }

  function filterVisibleFields(fields: Array<{ key: string }>): Array<{ key: string }> {
    return fields.filter(f => isFieldVisible(f.key))
  }

  return {
    canView,
    canCreate,
    canEdit,
    canDelete,
    canExport,
    canConfigure,
    deleteOperations,
    canDeleteRecords,
    canBatchDeleteRecords,
    isFieldVisible,
    isFieldEditable,
    filterVisibleFields,
  }
}
