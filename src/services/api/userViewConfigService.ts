import type { ApiResponse, UserViewConfig } from '@/types'
import { createErrorResponse, createServiceFallback } from './base'

export interface IUserViewConfigService {
  load(moduleId: string): Promise<ApiResponse<UserViewConfig>>
  save(config: UserViewConfig): Promise<ApiResponse<void>>
}

let implementation: IUserViewConfigService | null = null

export function setUserViewConfigService(impl: IUserViewConfigService): void {
  implementation = impl
}

export function getUserViewConfigService(): IUserViewConfigService {
  if (!implementation) {
    return getUserViewConfigServiceFallback()
  }
  return implementation
}

const userViewConfigServiceFallback: IUserViewConfigService = {
  async load() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'UserViewConfigService 未初始化')
  },
  async save() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'UserViewConfigService 未初始化')
  },
}

function getUserViewConfigServiceFallback(): IUserViewConfigService {
  return createServiceFallback('UserViewConfigService', userViewConfigServiceFallback)
}

export const userViewConfigService: IUserViewConfigService = {
  async load(moduleId) {
    return getUserViewConfigService().load(moduleId)
  },
  async save(config) {
    return getUserViewConfigService().save(config)
  },
}
