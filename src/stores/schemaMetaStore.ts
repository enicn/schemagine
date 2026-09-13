import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { ModuleSchema, UserViewConfig, FieldSchema, ModulePermissions, FieldPermission } from '@/types'

export const useSchemaMetaStore = defineStore('schemaMeta', () => {
  const schema = ref<ModuleSchema | null>(null)
  const viewConfig = ref<UserViewConfig | null>(null)
  const permissions = ref<ModulePermissions | null>(null)

  const isLoading = ref(false)
  const loadError = ref<string | null>(null)
  const isLoaded = computed(() => schema.value !== null)

  const visibleFields = computed<FieldSchema[]>(() => {
    if (!schema.value) return []
    return schema.value.fields
      .filter(f => {
        if (!f.visible) return false
        if (f.permission && !f.permission.visible) return false
        return true
      })
      .sort((a, b) => a.order - b.order)
  })

  const fieldMap = computed<Map<string, FieldSchema>>(() => {
    const map = new Map<string, FieldSchema>()
    if (!schema.value) return map
    schema.value.fields.forEach(f => map.set(f.key, f))
    return map
  })

  function getField(key: string): FieldSchema | undefined {
    return fieldMap.value.get(key)
  }

  function getFieldPermission(key: string): FieldPermission | undefined {
    const field = getField(key)
    return field?.permission
  }

  function setSchema(newSchema: ModuleSchema): void {
    schema.value = newSchema
    loadError.value = null
  }

  function setViewConfig(config: UserViewConfig): void {
    viewConfig.value = config
  }

  function setPermissions(p: ModulePermissions): void {
    permissions.value = p
  }

  function setLoading(state: boolean): void {
    isLoading.value = state
  }

  function setError(error: string | null): void {
    loadError.value = error
  }

  function $reset(): void {
    schema.value = null
    viewConfig.value = null
    permissions.value = null
    isLoading.value = false
    loadError.value = null
  }

  return {
    schema,
    viewConfig,
    permissions,
    isLoading,
    loadError,
    isLoaded,
    visibleFields,
    fieldMap,
    getField,
    getFieldPermission,
    setSchema,
    setViewConfig,
    setPermissions,
    setLoading,
    setError,
    $reset,
  }
})
