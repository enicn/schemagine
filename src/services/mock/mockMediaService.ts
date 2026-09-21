import { createErrorResponse, createSuccessResponse } from '@/services/api/base'
import type { ApiResponse } from '@/types'
import type { IMediaService, MediaAsset, MediaListParams, MediaListResponse } from '@/services/api/mediaService'

/**
 * 演示/测试用内存媒体服务（IMediaService 全能力实现）：
 * 预置两条媒体记录，upload 经 FileReader 转 data URL（离线可渲染，e2e 可上传真实文件）。
 * 供 demo 页与 e2e 演示模式四（library）；真实宿主应接自己的后端。
 */

const seedAssets: MediaAsset[] = [
  { id: 'media-deadbeef', url: '/favicon.ico', file_name: 'favicon.ico', kind: 'image', mime: 'image/x-icon' },
]

const assets = new Map<string, MediaAsset>(seedAssets.map((a) => [a.id, { ...a }]))

let seq = 0
function nextId(): string {
  seq++
  return `media-${(0x10000000 + seq).toString(16).padStart(8, '0').slice(-8)}`
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

function kindOf(file: File): string {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'file'
}

export const mockMediaService: IMediaService = {
  async list(params: MediaListParams): Promise<ApiResponse<MediaListResponse>> {
    let all = [...assets.values()].sort((a, b) => a.id.localeCompare(b.id))
    if (params.kind) all = all.filter((a) => (a.kind ?? 'image') === params.kind)
    if (params.keyword) {
      const kw = params.keyword.toLowerCase()
      all = all.filter((a) => a.file_name?.toLowerCase().includes(kw) || a.id.toLowerCase().includes(kw))
    }
    const total = all.length
    const start = (params.page - 1) * params.pageSize
    return createSuccessResponse<MediaListResponse>({
      items: all.slice(start, start + params.pageSize),
      total,
      hasMore: start + params.pageSize < total,
    })
  },

  async upload(file: File): Promise<ApiResponse<MediaAsset>> {
    try {
      const url = await fileToDataUrl(file)
      const asset: MediaAsset = {
        id: nextId(),
        url,
        file_name: file.name,
        kind: kindOf(file),
        mime: file.type,
        size: file.size,
        source: 'upload',
      }
      assets.set(asset.id, asset)
      return createSuccessResponse(asset)
    } catch (e) {
      return createErrorResponse('UPLOAD_FAILED', e instanceof Error ? e.message : '上传失败')
    }
  },

  async resolveUrls(ids: string[]): Promise<ApiResponse<Record<string, string>>> {
    const map: Record<string, string> = {}
    for (const id of ids) {
      const asset = assets.get(id)
      if (asset) map[id] = asset.url
    }
    return createSuccessResponse(map)
  },

  async remove(id: string): Promise<ApiResponse<null>> {
    if (!assets.delete(id)) return createErrorResponse('NOT_FOUND', '媒体不存在')
    return createSuccessResponse(null)
  },

  async createManual(fields: { file_name: string; url: string; kind?: string }): Promise<ApiResponse<MediaAsset>> {
    if (!/^https?:\/\/|^\/.+/i.test(fields.url)) return createErrorResponse('INVALID_URL', 'URL 不合法')
    const asset: MediaAsset = {
      id: nextId(),
      url: fields.url,
      file_name: fields.file_name,
      kind: fields.kind ?? 'image',
      source: 'manual',
    }
    assets.set(asset.id, asset)
    return createSuccessResponse(asset)
  },
}

/** 清空并恢复种子数据（测试隔离用） */
export function resetMockMedia(): void {
  assets.clear()
  seedAssets.forEach((a) => assets.set(a.id, { ...a }))
  seq = 0
}
