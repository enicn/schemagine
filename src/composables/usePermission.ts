import { computed, getCurrentInstance, inject } from 'vue'
import { useSchemaMeta, RUNTIME_CONTEXT_KEY, type RuntimeContextState, type SchemaMetaState } from '@/composables/instanceState'
import { resolveDataOperations, type ResolvedDataOperations } from '@/utils/dataOperations'
import { resolveRoleOverride } from '@/utils/rolePermission'

/** 无 provider 时的角色上下文兜底（空角色 = roleBased 不参与判定） */
const EMPTY_RUNTIME: RuntimeContextState = {
  global: {},
  setGlobal: () => {},
  currentRoles: [],
  setRoles: () => {},
  $reset: () => {},
}

export function usePermission(schemaMetaParam?: SchemaMetaState, runtimeContextParam?: RuntimeContextState) {
  const schemaMeta = schemaMetaParam ?? useSchemaMeta()
  // 角色来源（docs/19 G3）：优先显式注入；引擎树内取运行时上下文；
  // 独立使用（无 provider，如单测/宿主直挂）回退空角色——roleBased 不生效、行为同旧版
  const runtimeContext = runtimeContextParam
    ?? (getCurrentInstance() ? (inject<RuntimeContextState>(RUNTIME_CONTEXT_KEY) ?? EMPTY_RUNTIME) : EMPTY_RUNTIME)
  const currentRoles = computed(() => runtimeContext.currentRoles)

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
    const override = resolveRoleOverride(field.permission?.roleBased, currentRoles.value)
    if (override === false) return false
    if (field.permission && !field.permission.visible && override !== true) return false
    return true
  }

  function isFieldEditable(fieldKey: string): boolean {
    const field = schemaMeta.getField(fieldKey)
    if (!field) return false
    if (field.readonly) return false
    const override = resolveRoleOverride(field.permission?.roleBased, currentRoles.value)
    if (override === false) return false
    if (field.permission && !field.permission.editable && override !== true) return false
    return override === true ? true : canEdit.value
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
