import type { ApiResponse, RelationEntry, RecordEntity } from '@/types'
import { createErrorResponse, createServiceFallback } from './base'

export interface IRelationService {
  getRelations(sourceModuleId: string, sourceRecordId: string, fieldKey: string): RelationEntry[]
  getTargetRelations(targetModuleId: string, targetRecordId: string, fieldKey: string): RelationEntry[]
  getSourceRecords(targetModuleId: string, targetRecordId: string, fieldKey: string): RecordEntity[]
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
  getRelations() {
    return []
  },
  getTargetRelations() {
    return []
  },
  getSourceRecords() {
    return []
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
  getRelations(sourceModuleId, sourceRecordId, fieldKey) {
    return getRelationService().getRelations(sourceModuleId, sourceRecordId, fieldKey)
  },
  getTargetRelations(targetModuleId, targetRecordId, fieldKey) {
    return getRelationService().getTargetRelations(targetModuleId, targetRecordId, fieldKey)
  },
  getSourceRecords(targetModuleId, targetRecordId, fieldKey) {
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
