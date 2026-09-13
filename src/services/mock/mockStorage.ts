const STORAGE_PREFIX = 'schemagine:'
const STORAGE_VERSION = 1

export interface StorageMeta {
  initialized: boolean
  version: number
}

function isLocalStorageAvailable(): boolean {
  try {
    const key = `${STORAGE_PREFIX}_test`
    localStorage.setItem(key, '1')
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

function getStorageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`
}

export function readStorage<T>(key: string, fallback: T): T {
  if (!isLocalStorageAvailable()) return fallback
  try {
    const raw = localStorage.getItem(getStorageKey(key))
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeStorage<T>(key: string, value: T): void {
  if (!isLocalStorageAvailable()) return
  try {
    localStorage.setItem(getStorageKey(key), JSON.stringify(value))
  } catch (e) {
    console.warn(`[mockStorage] write failed for key "${key}"`, e)
  }
}

export function removeStorage(key: string): void {
  if (!isLocalStorageAvailable()) return
  try {
    localStorage.removeItem(getStorageKey(key))
  } catch {
  }
}

export function isStorageInitialized(): boolean {
  if (!isLocalStorageAvailable()) return false
  const meta = readStorage<StorageMeta>('_meta', { initialized: false, version: 0 })
  return meta.initialized && meta.version === STORAGE_VERSION
}

export function markStorageInitialized(): void {
  writeStorage<StorageMeta>('_meta', { initialized: true, version: STORAGE_VERSION })
}

export function resetAllStorage(): void {
  if (!isLocalStorageAvailable()) return
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(STORAGE_PREFIX)) {
      keysToRemove.push(k)
    }
  }
  keysToRemove.forEach(k => {
    localStorage.removeItem(k)
  })
}
