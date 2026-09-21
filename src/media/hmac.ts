/**
 * 纯 JS 签名基座：SHA-1 / SHA-256 / HMAC / Base64（标准 + URL 安全）。
 * 仅供 OSS 直传签名（schemagine/media 子路径）使用，零依赖、浏览器可直跑——
 * 不引 AWS SDK / 七牛 SDK，避免宿主为「传个图」背整包依赖。
 * 算法正确性由 __tests__/mediaHmac.spec.ts 对照 node:crypto 与官方测试向量钉住。
 */

/** UTF-8 编码字符串 → 字节数组（不含 BOM） */
export function utf8Bytes(input: string): Uint8Array {
  return new TextEncoder().encode(input)
}

/** noUncheckedIndexedAccess 收敛：TypedArray 越界读按 0（调用处下标均受控） */
function at(a: Uint8Array | Uint32Array, i: number): number {
  return a[i] ?? 0
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += at(bytes, i).toString(16).padStart(2, '0')
  return out
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** 字节 → 标准 Base64（含 = 填充；浏览器环境不依赖 Buffer） */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = at(bytes, i)
    const b1 = i + 1 < bytes.length ? at(bytes, i + 1) : 0
    const b2 = i + 2 < bytes.length ? at(bytes, i + 2) : 0
    out += B64_ALPHABET.charAt(b0 >> 2)
    out += B64_ALPHABET.charAt(((b0 & 0x03) << 4) | (b1 >> 4))
    out += i + 1 < bytes.length ? B64_ALPHABET.charAt(((b1 & 0x0f) << 2) | (b2 >> 6)) : '='
    out += i + 2 < bytes.length ? B64_ALPHABET.charAt(b2 & 0x3f) : '='
  }
  return out
}

/** 七牛口径的 URL 安全 Base64：+ → -、/ → _，保留 = 填充（对齐 qiniu-js SDK） */
export function bytesToUrlSafeBase64(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_')
}

// ---------- SHA-1（七牛上传凭证用） ----------

export function sha1(input: Uint8Array): Uint8Array {
  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0
  const bitLen = input.length * 8
  // 填充：0x80 + 0x00… + 8 字节大端位长，按 len+9 向上补齐到 64 的倍数（0x80 恰满块时追加整块）
  const paddedLen = Math.ceil((input.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLen)
  padded.set(input)
  padded[input.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLen - 4, bitLen >>> 0)
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000))

  const w = new Uint32Array(80)
  for (let block = 0; block < paddedLen; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4)
    for (let i = 16; i < 80; i++) {
      const x = at(w, i - 3) ^ at(w, i - 8) ^ at(w, i - 14) ^ at(w, i - 16)
      w[i] = ((x << 1) | (x >>> 31)) >>> 0
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (b & c) | (~b & d)
        : i < 40 ? b ^ c ^ d
        : i < 60 ? (b & c) | (b & d) | (c & d)
        : b ^ c ^ d
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6
      const tmp = ((((a << 5) | (a >>> 27)) + f + e + k + at(w, i)) >>> 0)
      e = d
      d = c
      c = ((b << 30) | (b >>> 2)) >>> 0
      b = a
      a = tmp
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }
  const out = new Uint8Array(20)
  const ov = new DataView(out.buffer)
  ov.setUint32(0, h0)
  ov.setUint32(4, h1)
  ov.setUint32(8, h2)
  ov.setUint32(12, h3)
  ov.setUint32(16, h4)
  return out
}

// ---------- SHA-256（S3 SigV4 用） ----------

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

export function sha256(input: Uint8Array): Uint8Array {
  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19
  const bitLen = input.length * 8
  const paddedLen = Math.ceil((input.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLen)
  padded.set(input)
  padded[input.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLen - 4, bitLen >>> 0)
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000))

  const w = new Uint32Array(64)
  for (let block = 0; block < paddedLen; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4)
    for (let i = 16; i < 64; i++) {
      const m15 = at(w, i - 15)
      const m2 = at(w, i - 2)
      const s0 = ((m15 << 25) | (m15 >>> 7)) ^ ((m15 << 14) | (m15 >>> 18)) ^ (m15 >>> 3)
      const s1 = ((m2 << 15) | (m2 >>> 17)) ^ ((m2 << 13) | (m2 >>> 19)) ^ (m2 >>> 10)
      w[i] = (at(w, i - 16) + s0 + at(w, i - 7) + s1) >>> 0
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let hh = h7
    for (let i = 0; i < 64; i++) {
      const S1 = ((e << 26) | (e >>> 6)) ^ ((e << 21) | (e >>> 11)) ^ ((e << 7) | (e >>> 25))
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + at(SHA256_K, i) + at(w, i)) >>> 0
      const S0 = ((a << 30) | (a >>> 2)) ^ ((a << 19) | (a >>> 13)) ^ ((a << 10) | (a >>> 22))
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + hh) >>> 0
  }
  const out = new Uint8Array(32)
  const ov = new DataView(out.buffer)
  ov.setUint32(0, h0)
  ov.setUint32(4, h1)
  ov.setUint32(8, h2)
  ov.setUint32(12, h3)
  ov.setUint32(16, h4)
  ov.setUint32(20, h5)
  ov.setUint32(24, h6)
  ov.setUint32(28, h7)
  return out
}

// ---------- HMAC（通用结构，SHA-1/SHA-256 复用） ----------

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

function hmacGeneric(
  hash: (b: Uint8Array) => Uint8Array,
  blockLen: number,
  key: Uint8Array,
  message: Uint8Array,
): Uint8Array {
  let k = key
  if (k.length > blockLen) k = hash(k)
  const aligned = new Uint8Array(blockLen)
  aligned.set(k)
  const inner = new Uint8Array(blockLen)
  const outer = new Uint8Array(blockLen)
  for (let i = 0; i < blockLen; i++) {
    inner[i] = at(aligned, i) ^ 0x36
    outer[i] = at(aligned, i) ^ 0x5c
  }
  return hash(concat(outer, hash(concat(inner, message))))
}

/** HMAC-SHA1（七牛上传凭证） */
export function hmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
  return hmacGeneric(sha1, 64, key, message)
}

/** HMAC-SHA256（S3 SigV4） */
export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  return hmacGeneric(sha256, 64, key, message)
}
