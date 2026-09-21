import { bytesToHex, hmacSha256, sha256, utf8Bytes } from './hmac'

/**
 * S3（及 S3 兼容存储：MinIO/OSS S3 端点/COS S3 端点…）浏览器直传。
 * SigV4 纯 JS 签名（见 ./hmac），payload 用 UNSIGNED-PAYLOAD 免整文件哈希——
 * 管理后台的图片体量下比引入 aws-sdk 轻三个数量级。
 *
 * 安全提示：AK/SK 暴露在前端仅适合内网后台或配额受限的 IAM 凭证；
 * 公网产品建议改走 setupMedia({ mode: 'api' }) 让宿主后端签名。
 */

export interface S3DirectConfig {
  provider: 's3'
  bucket: string
  /** 服务区域；缺省 us-east-1（MinIO 等自建存储填任意合法值即可） */
  region?: string
  accessKeyId: string
  secretAccessKey: string
  /** STS 临时凭证的会话令牌（可选） */
  sessionToken?: string
  /** 端点 origin；缺省 AWS `https://s3.<region>.amazonaws.com`。MinIO 传完整 origin（可带端口） */
  endpoint?: string
  /** 寻址风格：virtual-host（默认）| path（MinIO 常用）。自建/带端口端点建议 path */
  addressStyle?: 'virtual-host' | 'path'
  /** 对象 key 前缀，如 'images/' */
  keyPrefix?: string
  /** 自定义对象 key（默认 `keyPrefix + 时间戳-随机-安全化文件名`） */
  buildKey?: (file: File) => string
  /** 最终访问 URL 前缀（CDN/自定义域名，含协议）；缺省由 endpoint + bucket 推导 */
  publicUrlBase?: string
  /** 上传后对象 ACL（如 'public-read'），参与签名 */
  acl?: string
}

export interface OssUploadResult {
  /** 最终可访问 URL（写入字段值的值） */
  url: string
  key: string
}

const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD'

/** RFC 3986 严格百分号编码（SigV4 规范集：保留 A-Za-z0-9-._~，'/' 按 encodeSlash 决定） */
export function uriEncode(value: string, encodeSlash = true): string {
  return value
    .split('')
    .map((ch) => {
      if (/[A-Za-z0-9\-._~]/.test(ch)) return ch
      if (ch === '/') return encodeSlash ? '%2F' : '/'
      return Array.from(new TextEncoder().encode(ch))
        .map((b) => '%' + b.toString(16).toUpperCase().padStart(2, '0'))
        .join('')
    })
    .join('')
}

function amzDates(date?: Date): { amzDate: string; dateStamp: string } {
  const d = date ?? new Date()
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  const amzDate =
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  return { amzDate, dateStamp: amzDate.slice(0, 8) }
}

/** 拼对象 key：安全化文件名 + 前缀 + 防碰撞段（可被 config.buildKey 整体接管） */
export function buildObjectKey(file: File, keyPrefix?: string): string {
  const base = file.name.split(/[\\/]/).pop() ?? 'file'
  const safe = base.replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_') || 'file'
  const nonce = Math.random().toString(36).slice(2, 8)
  return `${keyPrefix ?? ''}${Date.now().toString(36)}-${nonce}-${safe}`
}

/**
 * 解析出 PUT 目标与最终公开访问 URL（virtual-host 与 path 两种寻址风格）。
 * key 传入前应已完成逐段 URL 编码；配置 publicUrlBase（CDN/自定义域名）时
 * 公开 URL 用它拼接，否则公开 URL 即 PUT 目标本身。
 */
export function resolveS3Urls(config: S3DirectConfig, key: string): { targetUrl: string; publicUrl: string } {
  const endpoint = config.endpoint ?? `https://s3.${config.region ?? 'us-east-1'}.amazonaws.com`
  const base = new URL(endpoint)
  const basePath = base.pathname.replace(/\/+$/, '')
  const publicPrefix = config.publicUrlBase ? `${config.publicUrlBase.replace(/\/+$/, '')}/` : null
  if ((config.addressStyle ?? 'virtual-host') === 'path') {
    const targetUrl = `${base.origin}${basePath}/${config.bucket}/${key}`
    return { targetUrl, publicUrl: publicPrefix ? `${publicPrefix}${key}` : targetUrl }
  }
  const virtualHost = `${base.protocol}//${config.bucket}.${base.host}`
  const targetUrl = `${virtualHost}${basePath}/${key}`
  return { targetUrl, publicUrl: publicPrefix ? `${publicPrefix}${key}` : targetUrl }
}

export interface S3SignOptions {
  method: string
  /** 完整目标 URL（query 会进 canonical query） */
  url: string
  /** 需要一并签名的头（如 x-amz-acl / content-type）；host 与 x-amz-* 自动补齐 */
  headers?: Record<string, string>
  /** payload 哈希占位；缺省 UNSIGNED-PAYLOAD */
  payloadHash?: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  region: string
  service?: string
  /** 注入签名时间（ISO basic yyyymmddThhmmssZ）；缺省当前 UTC 时间，测试钉向量用 */
  now?: Date
}

/** 计算 SigV4 签名，返回需附加到请求的头（不含 host——浏览器 fetch 自动带） */
export function signS3Request(o: S3SignOptions): Record<string, string> {
  const service = o.service ?? 's3'
  const url = new URL(o.url)
  const { amzDate, dateStamp } = amzDates(o.now)
  const payloadHash = o.payloadHash ?? UNSIGNED_PAYLOAD

  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(o.headers ?? {})) headers[k.toLowerCase()] = String(v).trim()
  headers['host'] = url.host
  headers['x-amz-date'] = amzDate
  headers['x-amz-content-sha256'] = payloadHash
  if (o.sessionToken) headers['x-amz-security-token'] = o.sessionToken

  const sortedNames = Object.keys(headers).sort()
  const canonicalHeaders = sortedNames.map((k) => `${k}:${headers[k]}\n`).join('')
  const signedHeaders = sortedNames.join(';')

  // S3 规则：canonical URI = 实际发送的请求路径（URL 解析器已做过一次编码，不再二次编码）。
  // 调用方经 resolveS3Urls/uploadToS3 构造 URL 时已对 key 逐段 encodeURIComponent。
  const canonicalUri = url.pathname || '/'
  const pairs: string[] = []
  for (const [k, v] of [...url.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    pairs.push(`${uriEncode(k)}=${uriEncode(v)}`)
  }
  const canonicalQuery = pairs.join('&')

  const canonicalRequest = [
    o.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const scope = `${dateStamp}/${o.region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    bytesToHex(sha256(utf8Bytes(canonicalRequest))),
  ].join('\n')

  const kDate = hmacSha256(utf8Bytes(`AWS4${o.secretAccessKey}`), utf8Bytes(dateStamp))
  const kRegion = hmacSha256(kDate, utf8Bytes(o.region))
  const kService = hmacSha256(kRegion, utf8Bytes(service))
  const kSigning = hmacSha256(kService, utf8Bytes('aws4_request'))
  const signature = bytesToHex(hmacSha256(kSigning, utf8Bytes(stringToSign)))

  return {
    ...Object.fromEntries(
      Object.entries(headers).filter(([k]) => k !== 'host'),
    ),
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${o.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}

/** 直传一个文件到 S3 兼容存储，成功返回最终 URL（即字段值） */
export async function uploadToS3(file: File, config: S3DirectConfig): Promise<OssUploadResult> {
  const key = config.buildKey ? config.buildKey(file) : buildObjectKey(file, config.keyPrefix)
  // 请求路径与公开 URL 统一走编码后的 key（空格/中文/+ 在 URL 中必须转义）
  const keyPath = key.split('/').map((seg) => encodeURIComponent(seg)).join('/')
  const { targetUrl, publicUrl } = resolveS3Urls(config, keyPath)
  const headers: Record<string, string> = { 'content-type': file.type || 'application/octet-stream' }
  if (config.acl) headers['x-amz-acl'] = config.acl

  const signed = signS3Request({
    method: 'PUT',
    url: targetUrl,
    headers,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    sessionToken: config.sessionToken,
    region: config.region ?? 'us-east-1',
  })

  const res = await fetch(targetUrl, { method: 'PUT', headers: signed, body: file })
  if (!res.ok) {
    throw new Error(`S3 直传失败（HTTP ${res.status}）：${(await res.text()).slice(0, 300)}`)
  }
  return { url: publicUrl, key }
}
