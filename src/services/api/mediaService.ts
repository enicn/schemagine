import type { ApiResponse } from '@/types'
import { createErrorResponse, createServiceFallback } from './base'
import { setMediaMode } from './mediaConfig'

/** 媒体资源（宿主媒体库的一条记录，如后端 media 模块行） */
export interface MediaAsset {
  id: string
  /** 最终可访问 URL（CDN 直链或宿主代理直链） */
  url: string
  file_name?: string
  /** 资源大类：image / video / audio / file */
  kind?: string
  mime?: string
  size?: number
  [key: string]: unknown
}

export interface MediaListParams {
  keyword?: string
  /** 资源大类过滤（如 'image'）；不传返回全部 */
  kind?: string
  page: number
  pageSize: number
}

export interface MediaListResponse {
  items: MediaAsset[]
  total: number
  hasMore: boolean
}

/**
 * 媒体服务：mediaImage 字段的取数与解析由宿主注入实现。
 * - list：媒体库分页列表（选择器数据源）
 * - upload：上传新资源，成功返回含 id 的媒体记录（自动填入字段值）
 * - resolveUrls：批量 媒体id → 访问URL（列表/表单渲染用，宿主侧应做缓存）
 * 可选能力（未提供则媒体库组件自动隐藏对应入口）：
 * - remove：删除媒体记录（MediaLibrary 管理页删除按钮）
 * - createManual：手动登记外部 URL 资源（MediaLibrary 管理页「新建资源」）
 */
export interface IMediaService {
  list(params: MediaListParams): Promise<ApiResponse<MediaListResponse>>
  upload(file: File): Promise<ApiResponse<MediaAsset>>
  resolveUrls(ids: string[]): Promise<ApiResponse<Record<string, string>>>
  remove?(id: string): Promise<ApiResponse<null>>
  createManual?(fields: { file_name: string; url: string; kind?: string }): Promise<ApiResponse<MediaAsset>>
}

let implementation: IMediaService | null = null

export function setMediaService(impl: IMediaService): void {
  implementation = impl
  // 完整媒体服务注入即媒体库形态（docs/17 模式四）：编辑面按 library 模式渲染
  setMediaMode('library')
}

/** 探测媒体服务是否已注入（宿主侧与媒体库组件能力探测用，不触发 fallback 告警） */
export function peekMediaService(): IMediaService | null {
  return implementation
}

export function getMediaService(): IMediaService {
  if (!implementation) {
    return getMediaServiceFallback()
  }
  return implementation
}

const mediaServiceFallback: IMediaService = {
  async list() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'MediaService 未初始化')
  },
  async upload() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'MediaService 未初始化')
  },
  async resolveUrls() {
    return createErrorResponse('SERVICE_NOT_INITIALIZED', 'MediaService 未初始化')
  },
}

function getMediaServiceFallback(): IMediaService {
  return createServiceFallback('MediaService', mediaServiceFallback)
}

/**
 * 引擎内置代理面：remove/createManual 在代理内做「未实现」兜底，
 * 调用方（媒体库组件/宿主）无需对可选方法判空。
 */
export interface MediaServiceInvoker extends IMediaService {
  remove(id: string): Promise<ApiResponse<null>>
  createManual(fields: { file_name: string; url: string; kind?: string }): Promise<ApiResponse<MediaAsset>>
}

export const mediaService: MediaServiceInvoker = {
  async list(params) {
    return getMediaService().list(params)
  },
  async upload(file) {
    return getMediaService().upload(file)
  },
  async resolveUrls(ids) {
    return getMediaService().resolveUrls(ids)
  },
  async remove(id) {
    const impl = getMediaService()
    if (!impl.remove) return createErrorResponse('UNSUPPORTED', '当前 MediaService 不支持删除')
    return impl.remove(id)
  },
  async createManual(fields) {
    const impl = getMediaService()
    if (!impl.createManual) return createErrorResponse('UNSUPPORTED', '当前 MediaService 不支持手动登记')
    return impl.createManual(fields)
  },
}

/**
 * 媒体 id 形如 media-xxxxxxxx（8 位十六进制）。
 * 字段值命中该形态才走媒体解析；否则视为既有记录中的静态/外部 URL 原样渲染（向后兼容）。
 */
export function isMediaId(value: unknown): value is string {
  return typeof value === 'string' && /^media-[0-9a-f]{8}$/.test(value)
}

const resolvedUrlCache = new Map<string, string>()
const inflightResolves = new Map<string, Promise<string>>()

/**
 * 把字段值解析为可访问 URL：媒体 id 走 resolveUrls 批量解析（带缓存与去重），
 * 非媒体 id（静态/外部 URL）原样返回。解析失败返回空串。
 */
export function resolveMediaUrl(value: unknown): Promise<string> {
  if (value == null || value === '') return Promise.resolve('')
  if (!isMediaId(value)) return Promise.resolve(String(value))

  const id = value
  const cached = resolvedUrlCache.get(id)
  if (cached) return Promise.resolve(cached)

  const inflight = inflightResolves.get(id)
  if (inflight) return inflight

  const task = mediaService
    .resolveUrls([id])
    .then((res) => {
      const url = res.success ? (res.data[id] ?? '') : ''
      if (url) resolvedUrlCache.set(id, url)
      return url
    })
    .finally(() => {
      inflightResolves.delete(id)
    })
  inflightResolves.set(id, task)
  return task
}

/** 清空媒体 URL 解析缓存（媒体记录变更后由宿主调用，可选） */
export function clearMediaUrlCache(): void {
  resolvedUrlCache.clear()
}
