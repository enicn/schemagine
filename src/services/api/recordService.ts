import type {
  ApiResponse,
  ListQueryParams,
  PatchFieldParams,
  CreateRecordParams,
  RecordEntity,
  RecordListResponse,
  FieldValueCandidateQueryParams,
  FieldValueCandidateListResponse,
} from '@/types'
import { createErrorResponse, createServiceFallback } from './base'

export interface IRecordService {
  list(params: ListQueryParams): Promise<ApiResponse<RecordListResponse>>
  listFieldValueCandidates(params: FieldValueCandidateQueryParams): Promise<ApiResponse<FieldValueCandidateListResponse>>
  getDetail(moduleId: string, recordId: string): Promise<ApiResponse<RecordEntity>>
  patchField(params: PatchFieldParams): Promise<ApiResponse<RecordEntity>>
  create(params: CreateRecordParams): Promise<ApiResponse<RecordEntity>>
  batchCreate(params: CreateRecordParams[]): Promise<ApiResponse<RecordEntity[]>>
}

let implementation: IRecordService | null = null

export function setRecordService(impl: IRecordService): void {
  implementation = impl
}

export function getRecordService(): IRecordService {
  if (!implementation) {
    return getRecordServiceFallback()
  }
  return implementation
}

const recordServiceFallback: IRecordService = {
  async list() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'RecordService 未初始化')
  },
  async listFieldValueCandidates() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'RecordService 未初始化')
  },
  async getDetail() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'RecordService 未初始化')
  },
  async patchField() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'RecordService 未初始化')
  },
  async create() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'RecordService 未初始化')
  },
  async batchCreate() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'RecordService 未初始化')
  },
}

function getRecordServiceFallback(): IRecordService {
  return createServiceFallback('RecordService', recordServiceFallback)
}

export const recordService: IRecordService = {
  async list(params) {
    return getRecordService().list(params)
  },
  async listFieldValueCandidates(params) {
    return getRecordService().listFieldValueCandidates(params)
  },
  async getDetail(moduleId, recordId) {
    return getRecordService().getDetail(moduleId, recordId)
  },
  async patchField(params) {
    return getRecordService().patchField(params)
  },
  async create(params) {
    return getRecordService().create(params)
  },
  async batchCreate(params) {
    return getRecordService().batchCreate(params)
  },
}
