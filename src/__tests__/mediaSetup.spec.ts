import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMediaMode, setMediaMode } from '@/services/api/mediaConfig'
import { clearMediaUrlCache, isMediaId, resolveMediaUrl, setMediaService } from '@/services/api/mediaService'
import { createHttpMediaService } from '@/media/httpMediaService'
import { setupMedia } from '@/media/setupMedia'

function mockFile(name = 'a.png', type = 'image/png'): File {
  return new File([new Uint8Array([1])], name, { type })
}

afterEach(() => {
  vi.unstubAllGlobals()
  setMediaMode('url')
})

describe('setupMedia 四模式', () => {
  it('默认 url 模式；setupMedia({mode:url}) 显式回落', () => {
    setMediaMode('api')
    setupMedia({ mode: 'url' })
    expect(getMediaMode()).toBe('url')
  })

  it('oss 模式缺配置：报错', () => {
    expect(() => setupMedia({ mode: 'oss' })).toThrow(/oss 配置/)
    expect(() => setupMedia({ mode: 'api' })).toThrow(/api 配置/)
  })

  it('oss(qiniu) 模式：upload 走直传并把最终 URL 作为 id 填值，resolveUrls 恒等', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => new Response(JSON.stringify({ key: 'k' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    setupMedia({
      mode: 'oss',
      oss: { provider: 'qiniu', accessKey: 'ak', secretKey: 'sk', bucket: 'b', domain: 'https://cdn.mock', uploadUrl: '/mock/qiniu-upload' },
    })
    expect(getMediaMode()).toBe('oss')
    const res = await setupMediaSpec_upload()
    expect(res.success).toBe(true)
    expect(res.data!.id).toMatch(/^https:\/\/cdn\.mock\//)
    expect(res.data!.kind).toBe('image')

    const resolved = await setupMediaSpec_resolve(res.data!.id)
    expect(resolved.success).toBe(true)
    expect(resolved.data![res.data!.id]).toBe(res.data!.id)

    const list = await setupMediaSpec_list()
    expect(list.success).toBe(false)
    expect(list.errorCode).toBe('MEDIA_LIST_UNSUPPORTED')
  })

  it('oss(s3) 模式：PUT 直传成功', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    setupMedia({ mode: 'oss', oss: { provider: 's3', bucket: 'bk', accessKeyId: 'ak', secretAccessKey: 'sk' } })
    const res = await setupMediaSpec_upload()
    expect(res.success).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('PUT')
    expect(url).toContain('bk.s3.us-east-1.amazonaws.com/')
  })

  it('api 模式：upload 经宿主接口解析 URL，直传失败转 ApiResponse 失败', async () => {
    vi.stubGlobal('fetch', vi.fn<() => Promise<Response>>(async () => new Response(JSON.stringify({ url: 'https://x/y.png' }), { status: 200 })))
    setupMedia({ mode: 'api', api: { endpoint: '/upload' } })
    expect(getMediaMode()).toBe('api')
    const res = await setupMediaSpec_upload()
    expect(res.success).toBe(true)
    expect(res.data!.id).toBe('https://x/y.png')

    vi.stubGlobal('fetch', vi.fn<() => Promise<Response>>(async () => new Response('{}', { status: 200 })))
    const bad = await setupMediaSpec_upload()
    expect(bad.success).toBe(false)
    expect(bad.errorCode).toBe('UPLOAD_FAILED')
  })

  it('library 模式：仅同步模式标记（服务由 setMediaService 注入即隐式 library）', () => {
    setMediaService({
      list: async () => ({ success: true, data: { items: [], total: 0, hasMore: false }, message: undefined, errorCode: undefined }),
      upload: async () => ({ success: true, data: { id: 'media-00000001', url: '' }, message: undefined, errorCode: undefined }),
      resolveUrls: async () => ({ success: true, data: {}, message: undefined, errorCode: undefined }),
    })
    expect(getMediaMode()).toBe('library')
    setupMedia({ mode: 'library' })
    expect(getMediaMode()).toBe('library')
  })
})

async function setupMediaSpec_upload() {
  const { mediaService } = await import('@/services/api/mediaService')
  return mediaService.upload(mockFile())
}
async function setupMediaSpec_resolve(id: string) {
  const { mediaService } = await import('@/services/api/mediaService')
  return mediaService.resolveUrls([id])
}
async function setupMediaSpec_list() {
  const { mediaService } = await import('@/services/api/mediaService')
  return mediaService.list({ page: 1, pageSize: 20 })
}

describe('createHttpMediaService（模式四零胶水客户端）', () => {
  beforeEach(() => {
    clearMediaUrlCache()
  })

  const okResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

  it('list：查询串与响应归一', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => okResponse({ items: [{ id: 'media-00000001', url: 'https://c/1.png', file_name: '1.png' }], total: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    const svc = createHttpMediaService({ baseUrl: '/api/v1' })
    const res = await svc.list({ page: 2, pageSize: 50, kind: 'image', keyword: 'ab' })
    expect(res.success).toBe(true)
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toBe('/api/v1/media/list?page=2&page_size=50&kind=image&keyword=ab')
    expect(res.data!.items[0]!.file_name).toBe('1.png')
    expect(res.data!.hasMore).toBe(false)
  })

  it('upload：multipart 默认字段 file', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => okResponse({ id: 'media-00000002', url: 'https://c/2.png' }))
    vi.stubGlobal('fetch', fetchMock)
    const svc = createHttpMediaService({ baseUrl: '/api/v1' })
    const res = await svc.upload(mockFile())
    expect(res.success).toBe(true)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.body as FormData).get('file')).toBeInstanceOf(File)
  })

  it('resolveUrls：缓存命中不发请求；未命中走 lookup 且二次命中用缓存', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => okResponse({ items: [{ id: 'media-00000003', url: 'https://c/3.png' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const svc = createHttpMediaService({ baseUrl: '/api/v1' })
    // resolveMediaUrl 走核心代理：注册后才能命中该实现的缓存
    setMediaService(svc)
    const first = await svc.resolveUrls(['media-00000003'])
    expect(first.data!['media-00000003']).toBe('https://c/3.png')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.stringify(init.body)).toContain('media-00000003')
    const second = await svc.resolveUrls(['media-00000003'])
    expect(second.data!['media-00000003']).toBe('https://c/3.png')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await expect(resolveMediaUrl('media-00000003')).resolves.toBe('https://c/3.png')
  })

  it('removePath 未提供：无 remove 能力；提供后 DELETE 可用', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const bare = createHttpMediaService({})
    expect(bare.remove).toBeUndefined()
    const svc = createHttpMediaService({ baseUrl: '/api/v1', removePath: '/records/media' })
    const res = await svc.remove!('media-00000001')
    expect(res.success).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/records/media/media-00000001')
    expect(init.method).toBe('DELETE')
  })

  it('createManualPath 提供：POST 登记', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => okResponse({ id: 'media-00000009', url: 'https://ext/a.png' }))
    vi.stubGlobal('fetch', fetchMock)
    const svc = createHttpMediaService({ baseUrl: '/api/v1', createManualPath: '/records/media' })
    const res = await svc.createManual!({ file_name: 'a.png', url: 'https://ext/a.png' })
    expect(res.success).toBe(true)
    expect(res.data!.id).toBe('media-00000009')
  })

  it('unwrap 钩子：剥宿主信封', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => okResponse({ code: 0, data: { items: [{ id: 'media-00000004', url: 'https://c/4.png' }], total: 1 } }))
    vi.stubGlobal('fetch', fetchMock)
    const svc = createHttpMediaService({ unwrap: (b) => (b as { data: unknown }).data })
    const res = await svc.list({ page: 1, pageSize: 20 })
    expect(res.data!.total).toBe(1)
  })

  it('请求头：静态与函数两种形态', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => okResponse({ items: [], total: 0 }))
    vi.stubGlobal('fetch', fetchMock)
    const svc = createHttpMediaService({ headers: () => ({ authorization: 'Bearer x' }) })
    await svc.list({ page: 1, pageSize: 20 })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.headers).toMatchObject({ authorization: 'Bearer x' })
  })

  it('isMediaId：仅 media-xxxxxxxx 形态命中', () => {
    expect(isMediaId('media-deadbeef')).toBe(true)
    expect(isMediaId('https://cdn.x/a.png')).toBe(false)
    expect(isMediaId('media-xyz')).toBe(false)
  })
})
