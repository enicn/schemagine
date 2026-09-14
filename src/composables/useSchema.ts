import { computed, ref } from 'vue'
import { useSchemaMeta, useUi, type SchemaMetaState, type UiState } from '@/composables/instanceState'
import { schemaService } from '@/services/api/schemaService'
import { userViewConfigService } from '@/services/api/userViewConfigService'
import { readStorage, writeStorage } from '@/services/mock/mockStorage'
import { applyBuiltinOperations } from '@/utils/dataOperations'
import type { ModuleSchema, UserViewConfig, ModulePermissions, RecordEntity } from '@/types'
import type { ViewMode } from '@/constants'

export function useSchema(schemaMetaParam?: SchemaMetaState, uiStateParam?: UiState) {
  const loadingModuleId = ref<string | null>(null)
  const schemaMeta = schemaMetaParam ?? useSchemaMeta()
  const uiState = uiStateParam ?? useUi()

  const isSchemaLoaded = computed(() => schemaMeta.isLoaded)
  const currentSchema = computed(() => schemaMeta.schema)
  const currentViewConfig = computed(() => schemaMeta.viewConfig)
  const currentPermissions = computed(() => schemaMeta.permissions)
  const visibleFields = computed(() => schemaMeta.visibleFields)
  const schemaError = computed(() => schemaMeta.loadError)
  const isSchemaLoading = computed(() => schemaMeta.isLoading)
  const viewMode = computed(() => uiState.viewMode)

  async function loadModule(moduleId: string): Promise<void> {
    loadingModuleId.value = moduleId
    schemaMeta.$reset()
    uiState.$reset()
    schemaMeta.setLoading(true)

    try {
      const [schemaRes, permRes, configRes] = await Promise.all([
        schemaService.loadModuleSchema(moduleId),
        schemaService.loadModulePermissions(moduleId),
        userViewConfigService.load(moduleId),
      ])

      if (loadingModuleId.value !== moduleId) return

      if (!schemaRes.success) {
        schemaMeta.setError(schemaRes.message || '加载Schema失败')
        return
      }
      if (!permRes.success) {
        schemaMeta.setError(permRes.message || '加载权限失败')
        return
      }

      const schema: ModuleSchema = schemaRes.data
      const permissions: ModulePermissions = permRes.data
      let viewConfig: UserViewConfig = configRes.success ? configRes.data : createDefaultConfig(moduleId)

      if (loadingModuleId.value !== moduleId) return

      runFieldKeyMigration(schema, moduleId)
      viewConfig = ensureViewConfigCompatibility(schema, viewConfig)
      // 标准数据操作（删除）：按配置×权限合成内置操作字段（在列配置兼容处理之后，避免混入用户列设置）
      schemaMeta.setSchema(applyBuiltinOperations(schema, permissions))
      schemaMeta.setPermissions(permissions)
      schemaMeta.setViewConfig(viewConfig)

      const defaultMode: ViewMode = schema.defaultViewMode
      if (permissions.view) {
        uiState.setViewMode(defaultMode)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载模块时发生未知错误'
      schemaMeta.setError(message)
    } finally {
      schemaMeta.setLoading(false)
    }
  }

  function setViewMode(mode: ViewMode): void {
    if (!currentPermissions.value) return
    if (mode === 'list' && !currentPermissions.value.view) return
    if (mode === 'create' && !currentPermissions.value.create) return
    uiState.setViewMode(mode)
  }

  async function saveViewConfig(config: UserViewConfig): Promise<void> {
    const res = await userViewConfigService.save(config)
    if (res.success) {
      schemaMeta.setViewConfig(config)
    }
  }

  return {
    loadingModuleId,
    isSchemaLoaded,
    currentSchema,
    currentViewConfig,
    currentPermissions,
    visibleFields,
    schemaError,
    isSchemaLoading,
    viewMode,
    loadModule,
    setViewMode,
    saveViewConfig,
  }
}

function runFieldKeyMigration(schema: ModuleSchema, moduleId: string): void {
  const renamedFields = schema.fields.filter(f => f.previousKeys && f.previousKeys.length > 0)
  if (renamedFields.length === 0) return

  const RECORDS_KEY = `records:${moduleId}`
  const CONFIGS_KEY = `configs:${moduleId}`

  const records = readStorage<RecordEntity[]>(RECORDS_KEY, [])
  if (records.length > 0) {
    let changed = false
    for (const record of records) {
      for (const field of renamedFields) {
        for (const oldKey of (field.previousKeys ?? [])) {
          if (oldKey in record.fields && !(field.key in record.fields)) {
            record.fields[field.key] = record.fields[oldKey]
            delete record.fields[oldKey]
            changed = true
          }
        }
      }
    }
    if (changed) {
      writeStorage(RECORDS_KEY, records)
      console.log(
        `[SchemaMigration] 已迁移 ${moduleId} 的记录，涉及字段: ${renamedFields.map(f => `${f.previousKeys?.join('/')} → ${f.key}`).join(', ')}`
      )
    }
  }

  const config = readStorage<{ columns?: Array<{ field: string }> }>(CONFIGS_KEY, {} as any)
  if (config && config.columns && config.columns.length > 0) {
    let configChanged = false
    for (const col of config.columns) {
      for (const field of renamedFields) {
        for (const oldKey of (field.previousKeys ?? [])) {
          if (col.field === oldKey) {
            col.field = field.key
            configChanged = true
          }
        }
      }
    }
    if (configChanged) {
      writeStorage(CONFIGS_KEY, config)
    }
  }
}

function ensureViewConfigCompatibility(
  schema: ModuleSchema,
  config: UserViewConfig,
): UserViewConfig {
  const validKeys = new Set(schema.fields.map(f => f.key))

  const cleanColumns = config.columns.filter(c => validKeys.has(c.field))

  const existingKeys = new Set(cleanColumns.map(c => c.field))
  let maxOrder = cleanColumns.length > 0
    ? Math.max(...cleanColumns.map(c => c.order))
    : -1

  for (const field of schema.fields) {
    if (!existingKeys.has(field.key) && field.visible !== false) {
      maxOrder++
      cleanColumns.push({
        field: field.key,
        width: field.width,
        visible: true,
        order: maxOrder,
        sortable: !!field.sortable,
      })
    }
  }

  const removedCount = config.columns.length - cleanColumns.length
  const addedCount = cleanColumns.length - cleanColumns.filter(c => existingKeys.has(c.field)).length

  if (removedCount > 0 || addedCount > 0) {
    console.log(
      `[ViewConfig] ${schema.id}: 清理 ${removedCount} 列，补充 ${addedCount} 列`
    )
  }

  return { ...config, columns: cleanColumns }
}

function createDefaultConfig(moduleId: string): UserViewConfig {
  return {
    moduleId,
    version: 1,
    columns: [],
    pageSize: 20,
  }
}
