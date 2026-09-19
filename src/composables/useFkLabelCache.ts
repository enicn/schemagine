/**
 * 全局 FK ID→label 共享缓存（模块级单例）：表格预取候选、筛选弹层候选、
 * 单值 getDetail 解析各自加载到的映射统一并入这里，筛选摘要 chip 等
 * 只读方同步取标签；未命中时后台 getDetail 兜底解析，写入后靠响应式
 * Map 触发重渲染（与 useCellRendering 渲染期惰性解析同一模式）。
 */
import { reactive } from 'vue'
import { recordService } from '@/services/api/recordService'
import type { CandidateOption, FieldSchema } from '@/types'

const labelsByModule = reactive<Map<string, Map<string, string>>>(new Map())
const resolvingKeys = new Set<string>()

function moduleMap(module: string): Map<string, string> {
  let m = labelsByModule.get(module)
  if (!m) {
    m = new Map()
    labelsByModule.set(module, m)
  }
  return m
}

/** 批量并入某模块的候选映射（candidateService 返回的 options） */
export function cacheFkOptions(module: string, options: CandidateOption[]): void {
  const m = moduleMap(module)
  for (const opt of options) {
    m.set(String(opt.value), opt.label)
  }
}

export function cacheFkLabel(module: string, id: string, label: string): void {
  moduleMap(module).set(String(id), label)
}

export function getCachedFkLabel(module: string, id: string): string | undefined {
  return moduleMap(module).get(String(id))
}

/** 后台解析单个 ID（并发去重；成功用 name/label/title，失败落原始 id 防重试风暴） */
function ensureFkLabel(module: string, id: string): void {
  const key = `${module}:${id}`
  if (resolvingKeys.has(key)) return
  resolvingKeys.add(key)
  recordService.getDetail(module, id)
    .then((res) => {
      let label: string | null = null
      if (res.success) {
        const labelField = res.data.fields.name ?? res.data.fields.label ?? res.data.fields.title
        if (typeof labelField === 'string') label = labelField
      }
      cacheFkLabel(module, id, label ?? id)
    })
    .catch(() => {
      cacheFkLabel(module, id, id)
    })
    .finally(() => {
      resolvingKeys.delete(key)
    })
}

/**
 * 筛选摘要等同步取标签的统一入口：命中缓存出人读标签；未命中先出原始值
 * 并触发后台解析，解析完成后响应式更新 chip 文案。
 */
export function resolveFkLabelForSummary(field: Pick<FieldSchema, 'targetModule'>, value: unknown): string {
  if (!field.targetModule) return String(value ?? '')
  const id = String(value ?? '')
  const cached = getCachedFkLabel(field.targetModule, id)
  if (cached !== undefined) return cached
  ensureFkLabel(field.targetModule, id)
  return id
}
