// ============================================================
// schemagine/media —— 媒体管理可选导出（subpath entry）
// ============================================================
// 宿主按需引入：import { setupMedia, MediaLibrary } from 'schemagine/media'
// 不需要媒体能力的宿主只引主入口 'schemagine'，不为此付出体积。
// 本入口同样引入 --sg-* 样式 token（单独引本子路径时也有基线样式）。

import '../styles/tokens.css'

// === 统一配置入口（四模式） ===
export { setupMedia } from './setupMedia'
export type { MediaSetupConfig, OssDirectConfig } from './setupMedia'
export { mediaKindOf } from './setupMedia'

// === 对象存储直传（模式二；可脱离引擎独立使用） ===
export { uploadToS3, signS3Request, resolveS3Urls, buildObjectKey, uriEncode } from './s3Uploader'
export type { S3DirectConfig, S3SignOptions, OssUploadResult } from './s3Uploader'
export { uploadToQiniu, createQiniuUploadToken } from './qiniuUploader'
export type { QiniuDirectConfig } from './qiniuUploader'

// === 宿主上传 API（模式三） ===
export { uploadViaApi } from './apiUploader'
export type { ApiUploadConfig } from './apiUploader'

// === 媒体库通用 HTTP 实现（模式四的零胶水客户端） ===
export { createHttpMediaService } from './httpMediaService'
export type { HttpMediaServiceConfig } from './httpMediaService'

// === 媒体库组件：管理页 ===
export { default as MediaLibrary } from './MediaLibrary.vue'

// === 媒体契约与组件复导出（一处 import 拿全媒体面） ===
export { setMediaService, peekMediaService } from '@/services/api/mediaService'
export type { IMediaService, MediaAsset, MediaListParams, MediaListResponse } from '@/services/api/mediaService'
export { isMediaId, resolveMediaUrl, clearMediaUrlCache, mediaService } from '@/services/api/mediaService'
export { default as MediaPickerDialog } from '@/components/media/MediaPickerDialog.vue'
export { default as MediaImageCell } from '@/components/field/MediaImageCell.vue'
export { default as MediaImageEditor } from '@/components/field/editors/MediaImageEditor.vue'
export { setMediaMode, getMediaMode, useMediaMode } from '@/services/api/mediaConfig'
export type { MediaMode } from '@/services/api/mediaConfig'
