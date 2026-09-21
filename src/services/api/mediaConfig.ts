import { ref } from 'vue'

/**
 * 媒体接入模式（docs/17「媒体管理四种接入模式」）：
 * - url（默认）：字段值即图片 URL，只渲染不提供上传（纯表格组件零配置可用）
 * - oss：浏览器直传对象存储（S3 兼容 / 七牛），字段值存最终 URL
 * - api：宿主后端提供上传接口，按约定返回图片 URL，字段值存最终 URL
 * - library：宿主媒体库（setMediaService 注入 IMediaService），字段值存媒体 id
 *
 * 模式决定编辑面形态（MediaImageEditor 与表格行内编辑按此降级），
 * 由 setupMedia()（schemagine/media 子路径）或 setMediaService() 写入。
 */
export type MediaMode = 'url' | 'oss' | 'api' | 'library'

const mode = ref<MediaMode>('url')

export function setMediaMode(value: MediaMode): void {
  mode.value = value
}

/** 当前媒体模式（默认 'url'；setMediaService 会隐式切到 'library'） */
export function getMediaMode(): MediaMode {
  return mode.value
}

/** 响应式读取当前媒体模式（编辑器/行内编辑按模式渲染上传面） */
export function useMediaMode() {
  return mode
}
