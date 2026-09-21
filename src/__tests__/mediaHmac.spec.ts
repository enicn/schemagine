import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { bytesToBase64, bytesToHex, bytesToUrlSafeBase64, hmacSha1, hmacSha256, sha1, sha256, utf8Bytes } from '@/media/hmac'

/** node:crypto 交叉验证基座（与被测实现完全独立，防同源错误互证） */
const sha1Node = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex')
const sha256Node = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const hmac1Node = (k: string, m: string) => createHmac('sha1', k).update(m, 'utf8').digest('hex')
const hmac256Node = (k: string, m: string) => createHmac('sha256', k).update(m, 'utf8').digest('hex')

describe('sha1 / sha256 纯 JS 实现', () => {
  const vectors = [
    '',
    'abc',
    'The quick brown fox jumps over the lazy dog',
    'a'.repeat(63),
    'b'.repeat(64),
    'c'.repeat(65),
    'x'.repeat(512),
    '中文输入也要过长字节边界：汉字 UTF-8 三字节，凑一个跨块长度垫垫看',
  ]

  it.each(vectors)('sha1(%j)', (input) => {
    expect(bytesToHex(sha1(utf8Bytes(input)))).toBe(sha1Node(input))
  })

  it.each(vectors)('sha256(%j)', (input) => {
    expect(bytesToHex(sha256(utf8Bytes(input)))).toBe(sha256Node(input))
  })

  it('官方向量：sha256("abc") = ba7816bf…', () => {
    expect(bytesToHex(sha256(utf8Bytes('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('官方向量：sha1("abc") = a9993e36…', () => {
    expect(bytesToHex(sha1(utf8Bytes('abc')))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
  })
})

describe('HMAC 实现', () => {
  const cases: Array<[string, string]> = [
    ['key', 'The quick brown fox jumps over the lazy dog'],
    ['demo-secret-key', 'policy-payload-2026-09-22'],
    ['k'.repeat(131), 'key longer than block size must be hashed first'],
    ['短', '值里带中文与符号 /+='],
  ]

  it.each(cases)('hmac-sha1(%j, %j)', (k, m) => {
    expect(bytesToHex(hmacSha1(utf8Bytes(k), utf8Bytes(m)))).toBe(hmac1Node(k, m))
  })

  it.each(cases)('hmac-sha256(%j, %j)', (k, m) => {
    expect(bytesToHex(hmacSha256(utf8Bytes(k), utf8Bytes(m)))).toBe(hmac256Node(k, m))
  })

  it('RFC 4231 向量：HMAC-SHA256', () => {
    expect(bytesToHex(hmacSha256(utf8Bytes('key'), utf8Bytes('The quick brown fox jumps over the lazy dog')))).toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    )
  })
})

describe('Base64（标准 / URL 安全）', () => {
  it('标准向量', () => {
    expect(bytesToBase64(utf8Bytes('hello'))).toBe('aGVsbG8=')
    expect(bytesToBase64(utf8Bytes('hello!!'))).toBe('aGVsbG8hIQ==')
    expect(bytesToBase64(utf8Bytes('ab'))).toBe('YWI=')
    expect(bytesToBase64(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe('+/+/')
  })

  it('URL 安全：+ → -、/ → _，保留填充（对齐七牛）', () => {
    expect(bytesToUrlSafeBase64(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe('-_-_')
    expect(bytesToUrlSafeBase64(utf8Bytes('hello'))).toBe('aGVsbG8=')
  })

  it('与 node Buffer 交叉验证（随机长度）', () => {
    for (let len = 0; len < 40; len++) {
      const bytes = new Uint8Array(len).map(() => Math.floor(Math.random() * 256))
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
    }
  })
})
