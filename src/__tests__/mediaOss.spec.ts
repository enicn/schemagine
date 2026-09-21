import { createHash, createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bytesToHex, bytesToUrlSafeBase64, hmacSha1, utf8Bytes } from '@/media/hmac'
import { buildObjectKey, resolveS3Urls, signS3Request, uploadToS3 } from '@/media/s3Uploader'
import { createQiniuUploadToken, uploadToQiniu } from '@/media/qiniuUploader'

function mockFile(name = 'banner.png', type = 'image/png'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('七牛直传', () => {
  const config = {
    provider: 'qiniu' as const,
    accessKey: 'test-ak',
    secretKey: 'test-sk',
    bucket: 'test-bucket',
    domain: 'https://cdn.example.com/',
  }

  it('上传凭证：与 node:crypto 按官方算法交叉一致', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000)
    const token = createQiniuUploadToken(config, 'images/abc.png')
    const deadline = Math.floor(1_790_000_000_000 / 1000) + 3600
    const policy = JSON.stringify({ scope: 'test-bucket:images/abc.png', deadline })
    const encoded = Buffer.from(policy, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    const sign = createHmac('sha1', 'test-sk').update(encoded, 'utf8').digest('base64').replace(/\+/g, '-').replace(/\//g, '_')
    expect(token).toBe(`test-ak:${sign}:${encoded}`)
    expect(token).toBe(
      `test-ak:${bytesToHex(hmacSha1(utf8Bytes('test-sk'), utf8Bytes(encoded))) && bytesToUrlSafeBase64(hmacSha1(utf8Bytes('test-sk'), utf8Bytes(encoded)))}:${encoded}`,
    )
  })

  it('直传：multipart 携带 token/key/file，最终 URL = domain + key', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => new Response(JSON.stringify({ key: 'k', hash: 'h' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await uploadToQiniu(mockFile(), config)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://upload.qiniup.com')
    const form = init.body as FormData
    expect(form.get('key')).toBe(res.key)
    expect(String(form.get('token'))).toContain('test-ak:')
    expect(form.get('file')).toBeInstanceOf(File)
    expect(res.url).toMatch(/^https:\/\/cdn\.example\.com\/[\w-]+-banner\.png$/)
  })

  it('直传失败：非 2xx 抛错并带状态码', async () => {
    vi.stubGlobal('fetch', vi.fn<() => Promise<Response>>(async () => new Response('{"error":"bad token"}', { status: 401 })))
    await expect(uploadToQiniu(mockFile(), config)).rejects.toThrow(/401/)
  })

  it('未知区域且无 uploadUrl：报错', async () => {
    await expect(
      uploadToQiniu(mockFile(), { ...config, zone: 'mars-1' }),
    ).rejects.toThrow(/未知的七牛存储区域/)
  })
})

describe('S3 SigV4 签名', () => {
  it('AWS 官方文档向量（GET Object，us-east-1，20130524）', () => {
    const headers = signS3Request({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      headers: { range: 'bytes=0-9' },
      payloadHash:
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      now: new Date('2013-05-24T00:00:00Z'),
    })
    expect(headers['x-amz-date']).toBe('20130524T000000Z')
    expect(headers.Authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
      'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
      'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    )
  })

  it('路径含特殊字符：逐段 RFC3986 编码且保留 /', () => {
    const headers = signS3Request({
      method: 'PUT',
      url: 'https://bucket.s3.amazonaws.com/images/a%20b%2Bc.png',
      accessKeyId: 'ak',
      secretAccessKey: 'sk',
      region: 'us-east-1',
      now: new Date('2026-09-22T00:00:00Z'),
    })
    // canonical URI = 实际发送的请求路径（URL 解析器已编码一次，签名侧不再二次编码）
    const amzDate = headers['x-amz-date']!
    const payloadHash = headers['x-amz-content-sha256']!
    const canonical = [
      'PUT',
      '/images/a%20b%2Bc.png',
      '',
      `host:bucket.s3.amazonaws.com\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`,
      'host;x-amz-content-sha256;x-amz-date',
      'UNSIGNED-PAYLOAD',
    ].join('\n')
    const scope = `${amzDate.slice(0, 8)}/us-east-1/s3/aws4_request`
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${createHash256(canonical)}`
    const kDate = createHmac('sha256', `AWS4sk`).update(amzDate.slice(0, 8)).digest()
    const kRegion = createHmac('sha256', kDate).update('us-east-1').digest()
    const kService = createHmac('sha256', kRegion).update('s3').digest()
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest()
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')
    expect(headers.Authorization).toContain(`Signature=${signature}`)
  })

  it('sessionToken 参与签名', () => {
    const headers = signS3Request({
      method: 'PUT',
      url: 'https://bucket.s3.amazonaws.com/k',
      accessKeyId: 'ak',
      secretAccessKey: 'sk',
      sessionToken: 'sts-token',
      region: 'us-east-1',
      now: new Date('2026-09-22T00:00:00Z'),
    })
    expect(headers['x-amz-security-token']).toBe('sts-token')
    expect(headers.Authorization).toContain('x-amz-security-token')
  })

  it('直传：PUT 头带签名与 content-type，返回公开 URL', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await uploadToS3(mockFile(), {
      provider: 's3',
      bucket: 'my-bucket',
      region: 'ap-shanghai',
      accessKeyId: 'ak',
      secretAccessKey: 'sk',
      keyPrefix: 'img/',
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://my-bucket.s3.ap-shanghai.amazonaws.com/' + res.key)
    expect(res.key).toMatch(/^img\//)
    const headers = init.headers as Record<string, string>
    expect(headers['content-type']).toBe('image/png')
    expect(headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=ak\//)
    expect(res.url).toBe('https://my-bucket.s3.ap-shanghai.amazonaws.com/' + res.key)
  })

  it('MinIO path 风格 + publicUrlBase', () => {
    const { targetUrl, publicUrl } = resolveS3Urls(
      { provider: 's3', bucket: 'media', accessKeyId: 'a', secretAccessKey: 'b', endpoint: 'http://minio.internal:9000', addressStyle: 'path', publicUrlBase: 'https://cdn.site.com' },
      'k/x.png',
    )
    expect(targetUrl).toBe('http://minio.internal:9000/media/k/x.png')
    expect(publicUrl).toBe('https://cdn.site.com/k/x.png')
  })

  it('非 2xx 抛错', async () => {
    vi.stubGlobal('fetch', vi.fn<() => Promise<Response>>(async () => new Response('<Error/>', { status: 403 })))
    await expect(
      uploadToS3(mockFile(), { provider: 's3', bucket: 'b', accessKeyId: 'a', secretAccessKey: 'b' }),
    ).rejects.toThrow(/403/)
  })
})

describe('对象 key 生成', () => {
  it('默认：前缀 + 防碰撞段 + 安全化文件名，中文保留', () => {
    const key = buildObjectKey(mockFile('首页 banner v2.png'), 'images/')
    expect(key).toMatch(/^images\/[a-z0-9]+-[a-z0-9]{6}-首页_banner_v2\.png$/)
  })

  it('路径穿越字符被替换', () => {
    const key = buildObjectKey(mockFile('../../etc/passwd'))
    expect(key).not.toContain('..')
    expect(key).not.toContain('/')
  })
})

function createHash256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}
