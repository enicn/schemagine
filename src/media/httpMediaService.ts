import { createErrorResponse, createSuccessResponse } from '@/services/api/base'
import type { ApiResponse } from '@/types'
import type { IMediaService, MediaAsset, MediaListParams, MediaListResponse } from '@/services/api/mediaService'
import { mediaKindOf } from './setupMedia'

/**
 * 媒体库模式的通用 HTTP 实现（docs/17 模式四）：按约定对接四个（后两个可选）
 * 接口即得完整媒体库，宿主零胶水；鉴权/信封等差异经 headers / unwrap 配置吸收。
 *
 * 约定（默认路径，可改）：
 * - GET  {base}/media/list?page=&page_size=&kind=&keyword= → { items: MediaAsset[], total }
 * - POST {base}/media/upload（multipart 字段 file）         → { id, url, file_name?, kind?, mime?, size? }
 * - POST {base}/media/lookup { ids }                        → { items: MediaAsset[] }（未命中静默跳过）
 * - DELETE {removePath}/{id}                                → 2xx（提供 removePath 才开放删除）
 * - POST {createManualPath} { file_name, url, kind }        → 媒体记录（提供路径才开放手动登记）
 */

export interface HttpMediaServiceConfig {
  /** 接口前缀，如 '/api/v1'；缺省当前站点根 */
  baseUrl?: string
  listPath?: string
  uploadPath?: string
  lookupPath?: string
  /** 删除接口前缀（实际 DELETE {base}{removePath}/{id}）；不提供则媒体库隐藏删除按钮 */
  removePath?: string
  /** 手动登记接口（实际 POST {base}{createManualPath}）；不提供则隐藏「新建资源」 */
  createManualPath?: string
  /** 附加请求头（如鉴权）；静态对象或动态函数 */
  headers?: Record<string, string> | (() => Record<string, string>)
  withCredentials?: boolean
  /** 响应解包：默认取 JSON 本体（约定接口无信封）；宿主若包 {code,data} 在此剥离 */
  unwrap?: (body: unknown) => unknown
  /** 上传文件字段名，默认 'file' */
  uploadFieldName?: string
  /** 上传附带字段（如 merchant_id 等业务归属） */
  uploadExtraFields?: Record<string, string> | ((file: File) => Record<string, string>)
}

function error<T>(message: string, code = 'MEDIA_REQUEST_FAILED'): ApiResponse<T> {
  return createErrorResponse(code, message)
}

/** 单项归一：宿主行缺失 kind 时按 url 猜（图片域名/扩展名不可靠时由宿主在响应里给全） */
function toAsset(row: Record<string, unknown>): MediaAsset {
  return {
    id: String(row.id ?? ''),
    url: String(row.url ?? ''),
    file_name: row.file_name == null ? undefined : String(row.file_name),
    kind: row.kind == null ? undefined : String(row.kind),
    mime: row.mime == null ? undefined : String(row.mime),
    size: typeof row.size === 'number' ? row.size : undefined,
    ...row,
  }
}

async function request(config: HttpMediaServiceConfig, url: string, init: RequestInit): Promise<unknown> {
  const headers = typeof config.headers === 'function' ? config.headers() : config.headers
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...headers, ...init.headers },
      credentials: config.withCredentials ? 'include' : 'same-origin',
    })
  } catch {
    throw new Error('网络异常，媒体服务不可达')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`媒体接口失败（HTTP ${res.status}）：${text.slice(0, 200)}`)
  }
  let body: unknown = await res.text()
  try {
    body = JSON.parse(body as string)
  } catch {
    // 204/空体等
  }
  return config.unwrap ? config.unwrap(body) : body
}

export function createHttpMediaService(config: HttpMediaServiceConfig = {}): IMediaService {
  const base = (config.baseUrl ?? '').replace(/\/+$/, '')
  const listPath = config.listPath ?? '/media/list'
  const uploadPath = config.uploadPath ?? '/media/upload'
  const lookupPath = config.lookupPath ?? '/media/lookup'

  // id→URL 结果缓存 + 同批合并去重（列表里大量媒体 id 只发一次 lookup）
  const urlCache = new Map<string, string>()
  const inflight = new Map<string, Promise<Record<string, string>>>()

  async function lookup(ids: string[]): Promise<Record<string, string>> {
    const body = await request(config, `${base}${lookupPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    const items = Array.isArray((body as { items?: unknown[] }).items) ? (body as { items: Record<string, unknown>[] }).items : []
    const map: Record<string, string> = {}
    for (const row of items) {
      const asset = toAsset(row)
      if (asset.id && asset.url) {
        map[asset.id] = asset.url
        urlCache.set(asset.id, asset.url)
      }
    }
    return map
  }

  return {
    async list(params: MediaListParams): Promise<ApiResponse<MediaListResponse>> {
      try {
        const query = new URLSearchParams({
          page: String(params.page),
          page_size: String(params.pageSize),
        })
        if (params.kind) query.set('kind', params.kind)
        if (params.keyword) query.set('keyword', params.keyword)
        const body = await request(config, `${base}${listPath}?${query.toString()}`, { method: 'GET' })
        const obj = (body ?? {}) as { items?: Record<string, unknown>[]; total?: number }
        const items = (obj.items ?? []).map(toAsset)
        const total = typeof obj.total === 'number' ? obj.total : items.length
        return createSuccessResponse<MediaListResponse>({
          items,
          total,
          hasMore: params.page * params.pageSize < total,
        })
      } catch (e) {
        return error(e instanceof Error ? e.message : '媒体列表加载失败')
      }
    },

    async upload(file: File): Promise<ApiResponse<MediaAsset>> {
      try {
        const form = new FormData()
        form.append(config.uploadFieldName ?? 'file', file)
        const extra =
          typeof config.uploadExtraFields === 'function' ? config.uploadExtraFields(file) : config.uploadExtraFields
        for (const [k, v] of Object.entries(extra ?? {})) form.append(k, v)
        const body = await request(config, `${base}${uploadPath}`, { method: 'POST', body: form })
        const asset = toAsset((body ?? {}) as Record<string, unknown>)
        if (!asset.url) return error('上传接口响应缺少 url 字段')
        urlCache.set(asset.id, asset.url)
        return createSuccessResponse(asset)
      } catch (e) {
        return error(e instanceof Error ? e.message : '上传失败')
      }
    },

    async resolveUrls(ids: string[]): Promise<ApiResponse<Record<string, string>>> {
      const result: Record<string, string> = {}
      const missing: string[] = []
      for (const id of ids) {
        const cached = urlCache.get(id)
        if (cached) result[id] = cached
        else missing.push(id)
      }
      if (missing.length) {
        try {
          // 同参数并发去重：同一批 id 只发一次 lookup
          const key = [...missing].sort().join(',')
          let task = inflight.get(key)
          if (!task) {
            task = lookup(missing)
            inflight.set(key, task)
            task.finally(() => inflight.delete(key))
          }
          Object.assign(result, await task)
        } catch (e) {
          return error(e instanceof Error ? e.message : '媒体解析失败')
        }
      }
      return createSuccessResponse(result)
    },

    ...(config.removePath
      ? {
          async remove(id: string): Promise<ApiResponse<null>> {
            try {
              await request(config, `${base}${config.removePath}/${encodeURIComponent(id)}`, { method: 'DELETE' })
              urlCache.delete(id)
              return createSuccessResponse(null)
            } catch (e) {
              return error(e instanceof Error ? e.message : '删除失败')
            }
          },
        }
      : {}),

    ...(config.createManualPath
      ? {
          async createManual(fields: { file_name: string; url: string; kind?: string }): Promise<ApiResponse<MediaAsset>> {
            try {
              const body = await request(config, `${base}${config.createManualPath}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ ...fields, source: 'manual' }),
              })
              const asset = toAsset((body ?? {}) as Record<string, unknown>)
              if (!asset.id) return error('登记接口响应缺少 id 字段')
              urlCache.set(asset.id, asset.url)
              return createSuccessResponse(asset)
            } catch (e) {
              return error(e instanceof Error ? e.message : '登记失败')
            }
          },
        }
      : {}),
  }
}

export { mediaKindOf }
