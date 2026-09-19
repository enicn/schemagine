import type { ApiResponse, RelationEntry, RecordEntity } from '@/types'
import { createErrorResponse, createServiceFallback } from './base'

/**
 * 关联服务契约(《06》T0.5 异步化):
 * 三个读方法同步签名 → Promise<ApiResponse<...>>,为 HTTP 化铺路
 * (HTTP 服务层全部异步;mock 实现包一层 Promise 保持语义)。
 */
export interface IRelationService {
  getRelations(sourceModuleId: string, sourceRecordId: string, fieldKey: string): Promise<ApiResponse<RelationEntry[]>>
  getTargetRelations(targetModuleId: string, targetRecordId: string, fieldKey: string): Promise<ApiResponse<RelationEntry[]>>
  getSourceRecords(targetModuleId: string, targetRecordId: string, fieldKey: string): Promise<ApiResponse<RecordEntity[]>>
  addRelation(entry: Omit<RelationEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<RelationEntry>>
  updateRelation(id: string, extraFields: Record<string, unknown>): Promise<ApiResponse<RelationEntry>>
  removeRelation(id: string): Promise<ApiResponse<void>>
}

let implementation: IRelationService | null = null

export function setRelationService(impl: IRelationService): void {
  implementation = impl
}

export function getRelationService(): IRelationService {
  if (!implementation) {
    return getRelationServiceFallback()
  }
  return implementation
}

const relationServiceFallback: IRelationService = {
  async getRelations() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'RelationService 未初始化')
  },
  async getTargetRelations() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'RelationService 未初始化')
  },
  async getSourceRecords() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'RelationService 未初始化')
  },
  async addRelation() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'RelationService 未初始化')
  },
  async updateRelation() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'RelationService 未初始化')
  },
  async removeRelation() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'RelationService 未初始化')
  },
}

function getRelationServiceFallback(): IRelationService {
  return createServiceFallback('RelationService', relationServiceFallback)
}

export const relationService: IRelationService = {
  async getRelations(sourceModuleId, sourceRecordId, fieldKey) {
    return getRelationService().getRelations(sourceModuleId, sourceRecordId, fieldKey)
  },
  async getTargetRelations(targetModuleId, targetRecordId, fieldKey) {
    return getRelationService().getTargetRelations(targetModuleId, targetRecordId, fieldKey)
  },
  async getSourceRecords(targetModuleId, targetRecordId, fieldKey) {
    return getRelationService().getSourceRecords(targetModuleId, targetRecordId, fieldKey)
  },
  async addRelation(entry) {
    return getRelationService().addRelation(entry)
  },
  async updateRelation(id, extraFields) {
    return getRelationService().updateRelation(id, extraFields)
  },
  async removeRelation(id) {
    return getRelationService().removeRelation(id)
  },
}
