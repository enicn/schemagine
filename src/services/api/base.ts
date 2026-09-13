import type { ApiResponse } from '@/types'

let mockEnabled = false

export function setMockEnabled(enabled: boolean): void {
  mockEnabled = enabled
}

export function isMockEnabled(): boolean {
  return mockEnabled
}

export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    message: undefined,
    errorCode: undefined,
  }
}

export function createErrorResponse<T = never>(code: string, message: string, details?: unknown[]): ApiResponse<T> {
  return {
    success: false,
    data: null as unknown as T,
    message,
    errorCode: code,
    details,
  }
}

export function createServiceFallback<T>(serviceName: string, fallback: T): T {
  console.error(`[SchemaEngine] ${serviceName} not initialized. Call set${serviceName.replace('Service', 'Service')}() first. Using fallback.`)
  return fallback
}
