/**
 * 宿主上传 API 直传（docs/17 模式三）：宿主后端实现一个上传接口，
 * 引擎按约定解析返回的图片 URL 写入字段值。
 *
 * 约定：POST multipart，文件字段名默认 `file`；响应 JSON 中的 URL 取值顺序
 * `url` → `data.url` → `data.data.url`（兼容 `{code:0,data:{url}}` 信封）；
 * 相对路径按当前站点 origin 补全。以上都可通过 parseResponse 整体接管。
 */

export interface ApiUploadConfig {
  /** 上传接口地址（相对路径按当前站点解析） */
  endpoint: string
  method?: string
  /** multipart 文件字段名，默认 'file' */
  field?: string
  /** 附加表单字段；静态对象或按文件动态生成（如业务 id、目录） */
  extraFields?: Record<string, string> | ((file: File) => Record<string, string>)
  headers?: Record<string, string>
  withCredentials?: boolean
  /** 自定义响应解析：入参为解析后的响应体（JSON 或纯文本），返回图片 URL */
  parseResponse?: (body: unknown, file: File) => string
}

function pickUrl(body: unknown): string {
  if (typeof body === 'string') {
    const text = body.trim()
    if (/^(https?:)?\/\/|^\/[^/]/i.test(text)) return text
    return ''
  }
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>
    if (typeof obj.url === 'string') return obj.url
    if (obj.data) return pickUrl(obj.data)
  }
  return ''
}

function joinOrigin(url: string): string {
  if (!/^\/[^/]/.test(url)) return url
  if (typeof location === 'undefined') return url
  return `${location.origin}${url}`
}

/** 调宿主上传接口，成功返回图片 URL（即字段值） */
export async function uploadViaApi(file: File, config: ApiUploadConfig): Promise<{ url: string }> {
  const form = new FormData()
  form.append(config.field ?? 'file', file)
  const extra = typeof config.extraFields === 'function' ? config.extraFields(file) : config.extraFields
  for (const [k, v] of Object.entries(extra ?? {})) form.append(k, v)

  const res = await fetch(config.endpoint, {
    method: config.method ?? 'POST',
    headers: config.headers,
    credentials: config.withCredentials ? 'include' : 'same-origin',
    body: form,
  })
  if (!res.ok) {
    throw new Error(`上传接口失败（HTTP ${res.status}）：${(await res.text()).slice(0, 300)}`)
  }

  let body: unknown = await res.text()
  try {
    body = JSON.parse(body as string)
  } catch {
    // 非 JSON 响应（如直接回写 URL 文本）交给 pickUrl 的文本分支
  }
  const url = config.parseResponse
    ? config.parseResponse(body, file)
    : pickUrl(body)
  if (!url) throw new Error('上传接口响应中未找到图片 URL（约定见 docs/17：url 或 data.url）')
  return { url: joinOrigin(url) }
}
