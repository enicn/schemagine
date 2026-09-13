import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { CandidateOption } from '@/types'

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

export const useRuntimeCacheStore = defineStore('runtimeCache', () => {
  const candidateCache = ref<Map<string, CacheEntry<CandidateOption[]>>>(new Map())
  const formulaResultCache = ref<Map<string, CacheEntry<unknown>>>(new Map())
  const sessionSnapshot = ref<Record<string, unknown> | null>(null)

  const CACHE_TTL = 5 * 60 * 1000

  function getCandidateCacheKey(targetModule: string, keyword: string): string {
    return `${targetModule}:${keyword || '*'}`
  }

  function getCandidates(targetModule: string, keyword: string): CandidateOption[] | null {
    const key = getCandidateCacheKey(targetModule, keyword)
    const entry = candidateCache.value.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      candidateCache.value.delete(key)
      return null
    }
    return entry.data
  }

  function setCandidates(targetModule: string, keyword: string, options: CandidateOption[]): void {
    const key = getCandidateCacheKey(targetModule, keyword)
    candidateCache.value.set(key, {
      data: options,
      expiresAt: Date.now() + CACHE_TTL,
    })
  }

  function invalidateCandidateCache(targetModule?: string): void {
    if (targetModule) {
      candidateCache.value.forEach((_, key) => {
        if (key.startsWith(`${targetModule}:`)) {
          candidateCache.value.delete(key)
        }
      })
    } else {
      candidateCache.value.clear()
    }
  }

  function getFormulaResult(key: string): unknown | null {
    const entry = formulaResultCache.value.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      formulaResultCache.value.delete(key)
      return null
    }
    return entry.data
  }

  function setFormulaResult(key: string, value: unknown): void {
    formulaResultCache.value.set(key, {
      data: value,
      expiresAt: Date.now() + CACHE_TTL,
    })
  }

  function invalidateFormulaCache(): void {
    formulaResultCache.value.clear()
  }

  function saveSnapshot(data: Record<string, unknown>): void {
    sessionSnapshot.value = data
  }

  function getSnapshot(): Record<string, unknown> | null {
    return sessionSnapshot.value
  }

  function clearSnapshot(): void {
    sessionSnapshot.value = null
  }

  function invalidateAll(): void {
    candidateCache.value.clear()
    formulaResultCache.value.clear()
  }

  function $reset(): void {
    invalidateAll()
    sessionSnapshot.value = null
  }

  return {
    candidateCache,
    formulaResultCache,
    sessionSnapshot,
    getCandidates,
    setCandidates,
    invalidateCandidateCache,
    getFormulaResult,
    setFormulaResult,
    invalidateFormulaCache,
    saveSnapshot,
    getSnapshot,
    clearSnapshot,
    invalidateAll,
    $reset,
  }
})
