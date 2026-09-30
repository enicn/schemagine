// 通用 localStorage 存取(docs/23 M4:自 services/mock/mockStorage 迁出,引擎与 mock 共用)。
// 键统一加 schemagine: 前缀;环境不可用(SSR/隐私模式)时读侧回退 fallback、写侧静默丢弃。
const STORAGE_PREFIX = 'schemagine:'

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

export { STORAGE_PREFIX, isLocalStorageAvailable }

export function readStorage<T>(key: string, fallback: T): T {
  if (!isLocalStorageAvailable()) return fallback
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeStorage<T>(key: string, value: T): void {
  if (!isLocalStorageAvailable()) return
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value))
  } catch (e) {
    console.warn(`[storage] write failed for key "${key}"`, e)
  }
}

export function removeStorage(key: string): void {
  if (!isLocalStorageAvailable()) return
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${key}`)
  } catch {
  }
}
