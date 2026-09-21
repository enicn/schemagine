import { createErrorResponse, createSuccessResponse } from '@/services/api/base'
import { setMediaMode, type MediaMode } from '@/services/api/mediaConfig'
import { setMediaService, type IMediaService, type MediaAsset } from '@/services/api/mediaService'
import { uploadViaApi, type ApiUploadConfig } from './apiUploader'
import { uploadToQiniu, type QiniuDirectConfig } from './qiniuUploader'
import { uploadToS3, type S3DirectConfig } from './s3Uploader'

/**
 * 媒体接入统一配置入口（docs/17「媒体管理四种接入模式」）。
 * 一处声明模式，引擎的表单编辑器、表格行内编辑、媒体选择与媒体库组件全部随之适配：
 * - mode 'url'（默认）：不调用本函数即可。字段值即图片 URL，编辑面只有 URL 输入
 * - mode 'oss'：浏览器直传对象存储（provider: 's3' | 'qiniu'），字段值存最终 URL
 * - mode 'api'：宿主上传接口返回图片 URL，字段值存最终 URL
 * - mode 'library'：宿主媒体库，setMediaService 注入 IMediaService（本函数仅同步模式标记）
 */
export type OssDirectConfig = S3DirectConfig | QiniuDirectConfig

export interface MediaSetupConfig {
  mode: MediaMode
  /** mode 'oss' 必填：对象存储直传配置 */
  oss?: OssDirectConfig
  /** mode 'api' 必填：宿主上传接口配置 */
  api?: ApiUploadConfig
}

/** File → 资源大类（媒体库列表/选择器的 kind 过滤口径） */
export function mediaKindOf(file: File): string {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'file'
}

function toAsset(url: string, file: File): MediaAsset {
  return {
    id: url,
    url,
    file_name: file.name,
    kind: mediaKindOf(file),
    mime: file.type,
    size: file.size,
  }
}

/** oss/api 模式的媒体服务：值即 URL——resolveUrls 恒等映射，list 不适用（无清单可列） */
function buildUrlModeService(upload: (file: File) => Promise<MediaAsset>): IMediaService {
  return {
    async list() {
      return createErrorResponse('MEDIA_LIST_UNSUPPORTED', '当前媒体模式（直传/上传API）没有媒体清单，媒体库选择仅在 library 模式可用')
    },
    async upload(file) {
      try {
        return createSuccessResponse(await upload(file))
      } catch (e) {
        return createErrorResponse('UPLOAD_FAILED', e instanceof Error ? e.message : '上传失败')
      }
    },
    async resolveUrls(ids) {
      return createSuccessResponse(Object.fromEntries(ids.map((id) => [id, id])))
    },
  }
}

/**
 * 应用媒体配置。应在 SchemaEngine 挂载前调用（模式决定编辑面形态）。
 * library 模式请另行 setMediaService(impl)——或直接用 createHttpMediaService()。
 */
export function setupMedia(config: MediaSetupConfig): void {
  if (config.mode === 'url') {
    setMediaMode('url')
    return
  }
  if (config.mode === 'library') {
    setMediaMode('library')
    return
  }
  if (config.mode === 'oss') {
    const oss = config.oss
    if (!oss) throw new Error('setupMedia: mode=oss 需要提供 oss 配置（provider: s3 | qiniu）')
    const upload =
      oss.provider === 'qiniu'
        ? async (file: File) => toAsset((await uploadToQiniu(file, oss)).url, file)
        : async (file: File) => toAsset((await uploadToS3(file, oss)).url, file)
    setMediaService(buildUrlModeService(upload))
    setMediaMode('oss')
    return
  }
  // mode 'api'
  const api = config.api
  if (!api) throw new Error('setupMedia: mode=api 需要提供 api 配置（宿主上传接口）')
  setMediaService(
    buildUrlModeService(async (file: File) => {
      const { url } = await uploadViaApi(file, api)
      return toAsset(url, file)
    }),
  )
  setMediaMode('api')
}
