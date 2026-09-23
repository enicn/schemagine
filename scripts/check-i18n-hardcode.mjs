#!/usr/bin/env node
/**
 * i18n 防回潮守卫（docs/21 批次 K2.2）：
 * 扫描引擎源码中模板插值与字符串字面量的 CJK 硬编码文案，白名单制豁免。
 *
 * 豁免面（DEFAULT_ALLOWLIST，随迁移进度收紧）：
 *  - 注释（块注释 / 单行注释 / HTML 注释）
 *  - import 行
 *  - src/services/mock（示例 Schema/种子数据即业务数据）
 *  - src/locales（语言包本身）
 *  - src/editor（Schema 编辑器内部工具文案，K2 第④组收尾）
 *  - src/schemaMeta（label/description 字段是编辑器元数据）
 *  - 任何路径段含 __tests__ 的目录（测试断言）
 *
 * 现状为 **warn 模式**（K2.2 灰度期）：只打印清单不失败；
 * K2 四组迁完后把 EXIT_ON_FINDINGS 翻 true 接入 lint:check 硬闸。
 * 用法：node scripts/check-i18n-hardcode.mjs [--strict]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

const ROOT = join(process.cwd(), 'src')
const STRICT = process.argv.includes('--strict')

/** 目录级白名单（相对 src/，POSIX 风格前缀匹配） */
const ALLOWED_DIR_PREFIXES = [
  'services/mock/',
  'locales/',
  'editor/',
  'schemaMeta/',
]

/** 文件名含 __tests__ 的目录整目录豁免 */
function isAllowedDir(relDir) {
  if (relDir.split(sep).includes('__tests__')) return true
  return ALLOWED_DIR_PREFIXES.some(p => relDir.replaceAll('\\', '/').startsWith(p))
}

const CJK = /[\u4e00-\u9fff]/g

/** 判定一行是否豁免：纯注释行、import 行 */
function isExemptLine(line) {
  const trimmed = line.trim()
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true
  if (trimmed.startsWith('import ') || trimmed.startsWith('// eslint')) return true
  return false
}

/** 抽取一行中的字符串字面量与模板插值文本，返回含 CJK 的片段 */
function findCjkSegments(line) {
  const segments = []
  // 单双引号字符串（不含转义换行的简单形态足够覆盖文案字面量）
  const re = /'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g
  let m
  while ((m = re.exec(line)) !== null) {
    const text = m[1] ?? m[2] ?? m[3] ?? ''
    if (CJK.test(text)) segments.push(text)
    CJK.lastIndex = 0
  }
  // 标签之间的可见文本（模板）
  const gt = line.indexOf('>')
  if (gt !== -1) {
    const text = line.slice(gt + 1).replace(/<[^<]*$/, '')
    if (CJK.test(text)) segments.push(text.trim())
    CJK.lastIndex = 0
  }
  return segments
}

function walk(dir, relDir = '') {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const rel = join(relDir, entry)
    if (statSync(full).isDirectory()) {
      if (!isAllowedDir(rel)) out.push(...walk(full, rel))
    } else if (/\.(vue|ts)$/.test(entry)) {
      out.push({ full, rel })
    }
  }
  return out
}

const findings = []
for (const { full, rel } of walk(ROOT)) {
  const lines = readFileSync(full, 'utf-8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isExemptLine(line)) continue
    for (const seg of findCjkSegments(line)) {
      findings.push({ file: `src/${rel.replaceAll('\\', '/')}`, line: i + 1, seg })
    }
  }
}

if (findings.length === 0) {
  console.log('✓ i18n 硬编码守卫通过：引擎文案面无 CJK 硬编码')
  process.exit(0)
}

console.log(`[i18n-guard] 发现 ${findings.length} 处 CJK 硬编码候选（${STRICT ? 'strict：失败' : 'warn：灰度期不拦截'}）`)
const byFile = new Map()
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, [])
  byFile.get(f.file).push(f)
}
for (const [file, items] of byFile) {
  console.log(`  ${file}（${items.length}）`)
  for (const item of items.slice(0, 8)) console.log(`    :${item.line}  ${item.seg.slice(0, 60)}`)
  if (items.length > 8) console.log(`    … 其余 ${items.length - 8} 条`)
}
if (STRICT) process.exit(1)
