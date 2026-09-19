/**
 * FK 候选值缓存（docs/19 批次 F 前置拆分）：从 VxeTableWrapper 抽出外键
 * 选项的预取/按需解析/缓存，供行内编辑（下拉候选）与单元格渲染（label 回显、
 * 截断浮层全文）共用同一份缓存。
 */
import { ref } from 'vue'
import { candidateService } from '@/services/api/candidateService'
import { recordService } from '@/services/api/recordService'
import { cacheFkLabel, cacheFkOptions } from '@/composables/useFkLabelCache'
import type { CandidateOption } from '@/types'
import type { WrapperColumn } from './wrapperTypes'

export function useFkOptions(props: { columns: WrapperColumn[] }) {
  const fkOptionsCache = ref<Map<string, CandidateOption[]>>(new Map())
  const resolvingFkIds = ref<Set<string>>(new Set())

  /** 预取全部 fk 列的候选（挂载时与数据刷新后各一次） */
  function preloadFkOptions(): void {
    const fkColumns = props.columns.filter(c => c.fieldType === 'fk' && c.targetModule)
    for (const col of fkColumns) {
      const module = col.targetModule!
      reloadFkOptionsForModule(module)
    }
  }

  async function reloadFkOptionsForModule(module: string): Promise<void> {
    try {
      const res = await candidateService.query({
        targetModule: module,
        page: 1,
        pageSize: 500,
      })
      if (res.success) {
        const cache = new Map(fkOptionsCache.value)
        cache.set(module, res.data.options)
        fkOptionsCache.value = cache
        cacheFkOptions(module, res.data.options)
      }
    } catch {
      // keep existing cache on error
    }
  }

  /** 单个 fk 值 → label：getDetail 解析后写入缓存（成功用真实 label，失败用原始 id 兜底） */
  async function resolveFkLabel(targetModule: string, id: string): Promise<void> {
    const dedupeKey = `${targetModule}:${id}`
    if (resolvingFkIds.value.has(dedupeKey)) return
    // 已缓存（含失败 fallback）则不再请求，避免重渲染时无限重试
    const cached = fkOptionsCache.value.get(targetModule)
    if (cached && cached.some(o => String(o.value) === id)) return
    resolvingFkIds.value = new Set([...resolvingFkIds.value, dedupeKey])

    let resolvedLabel: string | null = null
    try {
      const res = await recordService.getDetail(targetModule, id)
      if (res.success) {
        const record = res.data
        const labelField = record.fields.name ?? record.fields.label ?? record.fields.title
        if (typeof labelField === 'string') resolvedLabel = labelField
      }
    } catch {
      // keep showing raw value
    } finally {
      // 无论成功失败都写入 fallback 缓存：成功用真实 label，失败用原始 id
      // 这样下次 formatDisplay 命中缓存，不再触发请求
      const label = resolvedLabel ?? id
      const newOpt: CandidateOption = { value: id, label }
      const cache = new Map(fkOptionsCache.value)
      const existing = cache.get(targetModule) || []
      if (!existing.some(o => String(o.value) === id)) {
        cache.set(targetModule, [newOpt, ...existing])
      }
      fkOptionsCache.value = cache
      cacheFkLabel(targetModule, id, label)
      const next = new Set(resolvingFkIds.value)
      next.delete(dedupeKey)
      resolvingFkIds.value = next
    }
  }

  /** 编辑会话拉取某模块候选（分页口径与预取一致，500 条封顶） */
  async function fetchModuleOptions(module: string): Promise<CandidateOption[] | null> {
    try {
      const res = await candidateService.query({
        targetModule: module,
        page: 1,
        pageSize: 500,
      })
      if (res.success) {
        const cache = new Map(fkOptionsCache.value)
        cache.set(module, res.data.options)
        fkOptionsCache.value = cache
        cacheFkOptions(module, res.data.options)
        return res.data.options
      }
    } catch {
      // keep existing cache on error
    }
    return null
  }

  /** 把候选（如快速新建产物）并入模块缓存头部 */
  function prependCacheOptions(module: string, options: CandidateOption[]): void {
    const cache = new Map(fkOptionsCache.value)
    cache.set(module, options)
    fkOptionsCache.value = cache
    cacheFkOptions(module, options)
  }

  return {
    fkOptionsCache,
    preloadFkOptions,
    reloadFkOptionsForModule,
    resolveFkLabel,
    fetchModuleOptions,
    prependCacheOptions,
  }
}
