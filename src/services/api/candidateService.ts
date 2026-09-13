import type { ApiResponse, CandidateQueryParams, CandidateListResponse } from '@/types'
import { createErrorResponse, createServiceFallback } from './base'

export interface ICandidateService {
  query(params: CandidateQueryParams): Promise<ApiResponse<CandidateListResponse>>
}

let implementation: ICandidateService | null = null

export function setCandidateService(impl: ICandidateService): void {
  implementation = impl
}

export function getCandidateService(): ICandidateService {
  if (!implementation) {
    return getCandidateServiceFallback()
  }
  return implementation
}

const candidateServiceFallback: ICandidateService = {
  async query() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'CandidateService 未初始化')
  },
}

function getCandidateServiceFallback(): ICandidateService {
  return createServiceFallback('CandidateService', candidateServiceFallback)
}

export const candidateService: ICandidateService = {
  async query(params) {
    return getCandidateService().query(params)
  },
}
