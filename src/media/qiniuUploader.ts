import { bytesToUrlSafeBase64, hmacSha1, utf8Bytes } from './hmac'
import { buildObjectKey, type OssUploadResult } from './s3Uploader'

/**
 * 七牛云 Kodo 浏览器直传：上传凭证（upload token）按官方算法在本地生成
 * （putPolicy → URL 安全 Base64 → HMAC-SHA1），不依赖七牛 SDK。
 *
 * 安全提示：AK/SK 暴露在前端仅适合内网后台；公网产品建议
 * setupMedia({ mode: 'api' }) 由宿主后端下发凭证或代理上传。
 */

export interface QiniuDirectConfig {
  provider: 'qiniu'
  accessKey: string
  secretKey: string
  bucket: string
  /** 外链域名（含协议，如 'https://cdn.example.com'）——最终 URL = domain + '/' + key */
  domain: string
  /** 存储区域：z0 华东 / z1 华北 / z2 华南 / na0 北美 / as0 东南亚 / cn-east-2 浙江2 */
  zone?: string
  /** 直传地址整体覆盖（私有云/网关代理），优先于 zone */
  uploadUrl?: string
  /** 对象 key 前缀，如 'images/' */
  keyPrefix?: string
  /** 自定义对象 key（默认 `keyPrefix + 时间戳-随机-安全化文件名`） */
  buildKey?: (file: File) => string
}

const ZONE_UPLOAD_URLS: Record<string, string> = {
  z0: 'https://upload.qiniup.com',
  'cn-east-1': 'https://upload.qiniup.com',
  'cn-east-2': 'https://upload-cn-east-2.qiniup.com',
  z1: 'https://upload-z1.qiniup.com',
  'cn-north-1': 'https://upload-z1.qiniup.com',
  z2: 'https://upload-z2.qiniup.com',
  'cn-south-1': 'https://upload-z2.qiniup.com',
  na0: 'https://upload-na0.qiniup.com',
  as0: 'https://upload-as0.qiniup.com',
}

function resolveUploadUrl(config: QiniuDirectConfig): string {
  if (config.uploadUrl) return config.uploadUrl
  const url = ZONE_UPLOAD_URLS[config.zone ?? 'z0']
  if (!url) throw new Error(`未知的七牛存储区域：${config.zone}（可用 z0/z1/z2/na0/as0/cn-east-2 或传 uploadUrl）`)
  return url
}

/** 生成七牛上传凭证：AK:sign:policy（sign/policy 均 URL 安全 Base64） */
export function createQiniuUploadToken(
  config: Pick<QiniuDirectConfig, 'accessKey' | 'secretKey' | 'bucket'>,
  key: string,
  deadlineSeconds?: number,
): string {
  const deadline = deadlineSeconds ?? Math.floor(Date.now() / 1000) + 3600
  const putPolicy = JSON.stringify({ scope: `${config.bucket}:${key}`, deadline })
  const encodedPolicy = bytesToUrlSafeBase64(utf8Bytes(putPolicy))
  const sign = bytesToUrlSafeBase64(hmacSha1(utf8Bytes(config.secretKey), utf8Bytes(encodedPolicy)))
  return `${config.accessKey}:${sign}:${encodedPolicy}`
}

/** 直传一个文件到七牛，成功返回最终 URL（即字段值） */
export async function uploadToQiniu(file: File, config: QiniuDirectConfig): Promise<OssUploadResult> {
  const key = config.buildKey ? config.buildKey(file) : buildObjectKey(file, config.keyPrefix)
  const token = createQiniuUploadToken(config, key)
  const form = new FormData()
  form.append('token', token)
  form.append('key', key)
  form.append('file', file)

  const res = await fetch(resolveUploadUrl(config), { method: 'POST', body: form })
  if (!res.ok) {
    throw new Error(`七牛直传失败（HTTP ${res.status}）：${(await res.text()).slice(0, 300)}`)
  }
  return {
    url: `${config.domain.replace(/\/+$/, '')}/${key}`,
    key,
  }
}
