// mock 演示数据的存储元信息与重置(docs/23 M4:通用读写已迁至 services/storage,本文件仅保留 mock 语义;
// mock 内部代码仍可从此处导入 read/write/remove,由下方 re-export 提供)。
import { readStorage, writeStorage, STORAGE_PREFIX, isLocalStorageAvailable } from '../storage'

export interface StorageMeta {
  initialized: boolean
  version: number
}

export { readStorage, writeStorage, removeStorage } from '../storage'
export { STORAGE_PREFIX, isLocalStorageAvailable } from '../storage'

const STORAGE_VERSION = 1

export function isStorageInitialized(): boolean {
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
