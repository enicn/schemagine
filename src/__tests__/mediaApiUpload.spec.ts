import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadViaApi } from '@/media/apiUploader'

function mockFile(name = 'pic.png', type = 'image/png'): File {
  return new File([new Uint8Array([9, 9])], name, { type })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('宿主上传 API（模式三）', () => {
  it('默认约定：multipart 字段 file，响应 url 直取', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => new Response(JSON.stringify({ url: 'https://cdn.x/y.png' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { url } = await uploadViaApi(mockFile(), { endpoint: '/api/upload' })
    expect(url).toBe('https://cdn.x/y.png')
    const [endpoint, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(endpoint).toBe('/api/upload')
    expect(init.method).toBe('POST')
    expect((init.body as FormData).get('file')).toBeInstanceOf(File)
  })

  it('响应信封 {code,data:{url}} 逐层解包', async () => {
    vi.stubGlobal('fetch', vi.fn<() => Promise<Response>>(async () => new Response(JSON.stringify({ code: 0, data: { url: '/static/a.png' } }), { status: 200 })))
    const { url } = await uploadViaApi(mockFile(), { endpoint: '/api/upload' })
    expect(url).toBe(`${location.origin}/static/a.png`)
  })

  it('纯文本响应且形如 URL 时直接采用', async () => {
    vi.stubGlobal('fetch', vi.fn<() => Promise<Response>>(async () => new Response('https://cdn.x/plain.png', { status: 200 })))
    const { url } = await uploadViaApi(mockFile(), { endpoint: '/u' })
    expect(url).toBe('https://cdn.x/plain.png')
  })

  it('extraFields 静态与函数两种形态都进表单', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => new Response(JSON.stringify({ url: 'https://a/b' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const file = mockFile('n.png')
    await uploadViaApi(file, {
      endpoint: '/u',
      extraFields: (f) => ({ biz: 'invoice', size: String(f.size) }),
      headers: { 'x-token': 't' },
    })
    const form = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData
    expect(form.get('biz')).toBe('invoice')
    expect(form.get('size')).toBe(String(file.size))
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(init.headers).toEqual({ 'x-token': 't' })
  })

  it('parseResponse 接管解析', async () => {
    vi.stubGlobal('fetch', vi.fn<() => Promise<Response>>(async () => new Response(JSON.stringify({ result: { link: 'https://x/z' } }), { status: 200 })))
    const { url } = await uploadViaApi(mockFile(), {
      endpoint: '/u',
      parseResponse: (body) => String((body as { result: { link: string } }).result.link),
    })
    expect(url).toBe('https://x/z')
  })

  it('响应无 URL：报约定错误', async () => {
    vi.stubGlobal('fetch', vi.fn<() => Promise<Response>>(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 })))
    await expect(uploadViaApi(mockFile(), { endpoint: '/u' })).rejects.toThrow(/未找到图片 URL/)
  })

  it('非 2xx：抛错带状态码', async () => {
    vi.stubGlobal('fetch', vi.fn<() => Promise<Response>>(async () => new Response('denied', { status: 500 })))
    await expect(uploadViaApi(mockFile(), { endpoint: '/u' })).rejects.toThrow(/500/)
  })
})
