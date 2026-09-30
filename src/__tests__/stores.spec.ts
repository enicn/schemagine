import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRuntimeCacheStore } from '@/stores/runtimeCacheStore'
import type { CandidateOption } from '@/types'

// stores/ 下唯一在用的 Pinia store(FK 候选/公式缓存,主链路经 runtimeCache 消费);
// record/schemaMeta/uiState 三个遗留 store 已随 docs/23 M5 删除——引擎主链路状态走
// composables/instanceState.ts 的四态工厂 + provide/inject(见 docs/04),其覆盖在 instanceState 相关 spec。

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('runtimeCacheStore', () => {
  it('候选值缓存按 模块:关键词 隔离并可按模块失效', () => {
    const store = useRuntimeCacheStore()
    const opts: CandidateOption[] = [{ value: 'a', label: 'A' }]
    store.setCandidates('module-ap', 'foo', opts)
    store.setCandidates('module-voucher', 'bar', opts)
    expect(store.getCandidates('module-ap', 'foo')).toEqual(opts)
    expect(store.getCandidates('module-ap', '')).toBeNull()
    store.invalidateCandidateCache('module-ap')
    expect(store.getCandidates('module-ap', 'foo')).toBeNull()
    expect(store.getCandidates('module-voucher', 'bar')).toEqual(opts)
    store.invalidateCandidateCache()
    expect(store.getCandidates('module-voucher', 'bar')).toBeNull()
  })

  it('公式结果缓存与失效', () => {
    const store = useRuntimeCacheStore()
    store.setFormulaResult('r1:total', 123)
    expect(store.getFormulaResult('r1:total')).toBe(123)
    store.invalidateFormulaCache()
    expect(store.getFormulaResult('r1:total')).toBeNull()
  })

  it('会话快照保存与清除', () => {
    const store = useRuntimeCacheStore()
    store.saveSnapshot({ a: 1 })
    expect(store.getSnapshot()).toEqual({ a: 1 })
    store.clearSnapshot()
    expect(store.getSnapshot()).toBeNull()
  })

  it('$reset 清空全部缓存', () => {
    const store = useRuntimeCacheStore()
    store.setCandidates('m', 'k', [])
    store.setFormulaResult('k', 1)
    store.saveSnapshot({ x: 1 })
    store.$reset()
    expect(store.getCandidates('m', 'k')).toBeNull()
    expect(store.getFormulaResult('k')).toBeNull()
    expect(store.getSnapshot()).toBeNull()
  })
})
