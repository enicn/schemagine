import type { ApiResponse, ModuleSchema, ModulePermissions } from '@/types'
import { createErrorResponse, createServiceFallback } from './base'

export interface ISchemaService {
  loadModuleSchema(moduleId: string): Promise<ApiResponse<ModuleSchema>>
  loadModulePermissions(moduleId: string): Promise<ApiResponse<ModulePermissions>>
  validateSchema(moduleId: string): Promise<ApiResponse<boolean>>
  saveModuleSchema(schema: ModuleSchema): Promise<ApiResponse<void>>
  listModuleIds(): Promise<ApiResponse<string[]>>
}

let implementation: ISchemaService | null = null

export function setSchemaService(impl: ISchemaService): void {
  implementation = impl
}

export function getSchemaService(): ISchemaService {
  if (!implementation) {
    return getSchemaServiceFallback()
  }
  return implementation
}

const schemaServiceFallback: ISchemaService = {
  async loadModuleSchema() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'SchemaService 未初始化')
  },
  async loadModulePermissions() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'SchemaService 未初始化')
  },
  async validateSchema() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'SchemaService 未初始化')
  },
  async saveModuleSchema() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'SchemaService 未初始化')
  },
  async listModuleIds() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'SchemaService 未初始化')
  },
}

function getSchemaServiceFallback(): ISchemaService {
  return createServiceFallback('SchemaService', schemaServiceFallback)
}

export const schemaService: ISchemaService = {
  async loadModuleSchema(moduleId) {
    return getSchemaService().loadModuleSchema(moduleId)
  },
  async loadModulePermissions(moduleId) {
    return getSchemaService().loadModulePermissions(moduleId)
  },
  async validateSchema(moduleId) {
    return getSchemaService().validateSchema(moduleId)
  },
  async saveModuleSchema(schema) {
    return getSchemaService().saveModuleSchema(schema)
  },
  async listModuleIds() {
    return getSchemaService().listModuleIds()
  },
}
