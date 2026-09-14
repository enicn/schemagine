// 运行器:jiti 直接加载 generate-schema-docs.ts,
// 再把生成内容写入 docs/07-类型系统.md 的标记区间(无标记时追加到文末)。
// 用法:node scripts/generate-schema-docs.run.mjs(pnpm gen:schema-docs)
import { createJiti } from 'jiti'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const entry = path.join(root, 'scripts', 'generate-schema-docs.ts')
const docPath = path.join(root, 'docs', '07-类型系统.md')

const BEGIN = '<!-- BEGIN AUTO:schema-meta-reference -->'
const END = '<!-- END AUTO:schema-meta-reference -->'

const jiti = createJiti(import.meta.url, {
  alias: { '@': path.join(root, 'src') },
})

const { buildSchemaMetaMarkdown } = await jiti.import(entry)
const block = `${BEGIN}\n${buildSchemaMetaMarkdown()}\n${END}`

const doc = await readFile(docPath, 'utf-8')
const beginIndex = doc.indexOf(BEGIN)
const endIndex = doc.indexOf(END)

let next
if (beginIndex >= 0 && endIndex > beginIndex) {
  next = doc.slice(0, beginIndex) + block + doc.slice(endIndex + END.length)
  console.log('[gen:schema-docs] 已更新既有附录区块')
} else {
  const sep = doc.endsWith('\n') ? '\n' : '\n\n'
  next = `${doc}${sep}${block}\n`
  console.log('[gen:schema-docs] 文档无标记区块,已追加到文末')
}

await writeFile(docPath, next, 'utf-8')
console.log(`[gen:schema-docs] 已写入 ${path.relative(root, docPath)}`)
