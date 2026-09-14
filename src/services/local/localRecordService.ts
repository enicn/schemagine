import type {
  ApiResponse,
  ListQueryParams,
  PatchFieldParams,
  CreateRecordParams,
  RecordEntity,
  RecordListResponse,
  FieldValueCandidateQueryParams,
  FieldValueCandidateListResponse,
  FieldValueCandidateOption,
} from '@/types'
import type { IRecordService } from '@/services/api/recordService'
import { createSuccessResponse, createErrorResponse } from '@/services/api/base'
import { evaluateFilter } from '@/utils/evaluateFilter'

/**
 * 本地数据源(docs/19 批次 C1):数组进、内存分页/排序/过滤,完整实现 IRecordService。
 * 与 mock 同口径(evaluateFilter / 排序 / 候选值语义共用实现),零延迟、零持久化。
 *
 * 典型用法:
 *   setRecordService(createLocalRecordService(rows, { moduleId: 'module-demo' }))
 *
 * 与 mock 的差异:不做种子数据、不做字段默认值填充(autoFill)、不持久化;
 * list 响应带 hasMore(mock 亦已对齐),供游标之外的"加载更多"式消费。
 */

export interface LocalRecordServiceOptions {
  /** 绑定单模块:rows 归属该模块,其他 moduleId 的请求返回空结果;缺省时不限模块(同一池服务所有模块) */
  moduleId?: string
  /** 模拟延迟毫秒数,缺省 0(即时返回) */
  delayMs?: number
  /** 生成记录 id 的前缀,缺省 'rec-local' */
  idPrefix?: string
}

export interface LocalRecordService extends IRecordService {
  /** 读取当前内存记录(引用,慎改) */
  getRecords(): RecordEntity[]
  /** 整体替换内存记录(重新包一层实体) */
  setRecords(rows: Array<Record<string, unknown>>): void
}

let seq = 0
function nextId(prefix: string): string {
  seq += 1
  return `${prefix}-${Date.now().toString(36)}-${seq}`
}

function wrapRow(moduleId: string, fields: Record<string, unknown>, prefix: string): RecordEntity {
  return {
    id: nextId(prefix),
    moduleId,
    fields: { ...fields },
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function createLocalRecordService(
  rows: Array<Record<string, unknown>> = [],
  options: LocalRecordServiceOptions = {},
): LocalRecordService {
  const { moduleId: boundModuleId, delayMs = 0, idPrefix = 'rec-local' } = options
  let records: RecordEntity[] = rows.map(r => wrapRow(boundModuleId ?? 'local', r, idPrefix))

  async function delay(): Promise<void> {
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs))
  }

  /** 绑定模块时,不匹配的 moduleId 一律视为无数据 */
  function ownsModule(moduleId: string): boolean {
    return boundModuleId === undefined || moduleId === boundModuleId
  }

  function visibleRecords(moduleId: string): RecordEntity[] {
    return ownsModule(moduleId) ? records : []
  }

  return {
    async list(params: ListQueryParams): Promise<ApiResponse<RecordListResponse>> {
      await delay()
      let pool = visibleRecords(params.moduleId)

      const filters = params.filters
      if (filters && filters.length > 0) {
        pool = pool.filter(record => filters.every(clause => evaluateFilter(clause, record.fields[clause.field])))
      }

      const sort = params.sort
      if (sort) {
        pool = [...pool].sort((a, b) => {
          const aVal = a.fields[sort.field]
          const bVal = b.fields[sort.field]
          if (aVal == null) return 1
          if (bVal == null) return -1
          const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
          return sort.order === 'asc' ? cmp : -cmp
        })
      }

      const total = pool.length
      const start = (params.page - 1) * params.pageSize
      const paged = pool.slice(start, start + params.pageSize)

      return createSuccessResponse({
        records: paged,
        total,
        page: params.page,
        pageSize: params.pageSize,
        hasMore: start + params.pageSize < total,
      })
    },

    async listFieldValueCandidates(params: FieldValueCandidateQueryParams): Promise<ApiResponse<FieldValueCandidateListResponse>> {
      await delay()
      const { moduleId, field, keyword, page, pageSize, filters } = params
      let pool = visibleRecords(moduleId)

      if (filters && filters.length > 0) {
        pool = pool.filter(record => filters.every(clause => evaluateFilter(clause, record.fields[clause.field])))
      }

      const lowerKeyword = (keyword ?? '').toLowerCase().trim()
      const map = new Map<string, FieldValueCandidateOption>()

      const addValue = (val: unknown): void => {
        if (val === null || val === undefined || val === '') return
        const key = typeof val === 'string' ? `s:${val}` : typeof val === 'number' ? `n:${val}` : typeof val === 'boolean' ? `b:${val}` : `o:${String(val)}`
        const existing = map.get(key)
        if (existing) {
          existing.count++
          return
        }
        const label = typeof val === 'boolean' ? (val ? '是' : '否') : String(val)
        map.set(key, { value: val, label, count: 1 })
      }

      for (const r of pool) {
        const raw = r.fields[field]
        if (Array.isArray(raw)) {
          for (const item of raw) addValue(item)
        } else {
          addValue(raw)
        }
      }

      let options = Array.from(map.values())
      if (lowerKeyword) {
        options = options.filter(o => o.label.toLowerCase().includes(lowerKeyword))
      }
      options.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count
        return a.label.localeCompare(b.label, 'zh-CN')
      })

      const total = options.length
      const start = Math.max(0, (page - 1) * pageSize)
      const end = start + pageSize

      return createSuccessResponse({
        options: options.slice(start, end),
        total,
        hasMore: end < total,
      })
    },

    async getDetail(moduleId: string, recordId: string): Promise<ApiResponse<RecordEntity>> {
      await delay()
      const found = visibleRecords(moduleId).find(r => r.id === recordId)
      if (!found) return createErrorResponse('NOT_FOUND', '记录不存在')
      return createSuccessResponse({ ...found, fields: { ...found.fields } })
    },

    async patchField(params: PatchFieldParams): Promise<ApiResponse<RecordEntity>> {
      await delay()
      const { moduleId, recordId, field, value, expectedVersion, force } = params

      const found = visibleRecords(moduleId).find(r => r.id === recordId)
      if (!found) return createErrorResponse('NOT_FOUND', '记录不存在')

      if (!force && found.version !== expectedVersion) {
        return createErrorResponse('VERSION_CONFLICT', '数据已被其他用户修改，请刷新后重试')
      }

      found.fields[field] = value
      found.version += 1
      found.updatedAt = new Date().toISOString()
      return createSuccessResponse({ ...found, fields: { ...found.fields } })
    },

    async create(params: CreateRecordParams): Promise<ApiResponse<RecordEntity>> {
      await delay()
      const rec = wrapRow(params.moduleId, params.fields, idPrefix)
      records.push(rec)
      return createSuccessResponse({ ...rec, fields: { ...rec.fields } })
    },

    async batchCreate(params: CreateRecordParams[]): Promise<ApiResponse<RecordEntity[]>> {
      await delay()
      const created = params.map(p => wrapRow(p.moduleId, p.fields, idPrefix))
      records.push(...created)
      return createSuccessResponse(created.map(r => ({ ...r, fields: { ...r.fields } })))
    },

    getRecords(): RecordEntity[] {
      return records
    },

    setRecords(next: Array<Record<string, unknown>>): void {
      records = next.map(r => wrapRow(boundModuleId ?? 'local', r, idPrefix))
    },
  }
}
