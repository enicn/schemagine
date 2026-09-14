/**
 * Schema 配置项参考文档内容生成器(纯函数,不碰文件系统)。
 * 由 scripts/generate-schema-docs.run.mjs 经 esbuild 打包后调用,
 * 数据源 src/schemaMeta —— 与 Playground 共用同一份元数据(单一事实来源)。
 */
import {
  FIELD_META,
  META_GROUP_LABELS,
  META_KIND_LABELS,
  META_SURFACE_LABELS,
  MODULE_META,
  groupProperties,
} from '../src/schemaMeta/index'
import type { PropertyMeta } from '../src/schemaMeta/index'

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function formatDefault(meta: PropertyMeta): string {
  if (meta.default === undefined) return '—'
  if (typeof meta.default === 'boolean') return meta.default ? 'true' : 'false'
  return escapeCell(String(meta.default))
}

function formatAppliesTo(meta: PropertyMeta): string {
  if (meta.target === 'module') return '—'
  if (meta.appliesTo === 'all') return '全部类型'
  return escapeCell(meta.appliesTo.join(' / '))
}

function formatSurfaces(meta: PropertyMeta): string {
  if (meta.surfaces.length === 0) {
    return meta.label.includes('预留') ? '预留' : '结构性'
  }
  return escapeCell(meta.surfaces.map(s => META_SURFACE_LABELS[s]).join(' / '))
}

function metaRow(meta: PropertyMeta): string {
  const name = meta.required ? `\`${meta.key}\`*` : `\`${meta.key}\``
  const since = meta.since ? `(v${meta.since})` : ''
  return `| ${name}${since} | ${formatAppliesTo(meta)} | ${META_KIND_LABELS[meta.kind]} | ${formatDefault(meta)} | ${formatSurfaces(meta)} | ${escapeCell(meta.description)} |`
}

const TABLE_HEADER = '| 属性 | 适用类型 | 类型 | 默认值 | 生效面 | 说明 |\n| --- | --- | --- | --- | --- | --- |'

export function buildSchemaMetaMarkdown(): string {
  const lines: string[] = []

  lines.push('### 附录:配置项参考(自动生成)')
  lines.push('')
  lines.push('> 本节由 `scripts/generate-schema-docs.ts` 基于 `src/schemaMeta` 元数据自动生成,请勿手改。')
  lines.push('> 重新生成:`pnpm gen:schema-docs`;与 `/playground` 页面共用同一份数据。')
  lines.push('')

  lines.push('#### ModuleSchema 配置项')
  lines.push('')
  lines.push(TABLE_HEADER)
  for (const meta of MODULE_META) lines.push(metaRow(meta))
  lines.push('')

  lines.push('#### FieldSchema 配置项(按编辑分组)')
  lines.push('')
  for (const { group, items } of groupProperties(FIELD_META)) {
    lines.push(`##### ${META_GROUP_LABELS[group]}`)
    lines.push('')
    lines.push(TABLE_HEADER)
    for (const meta of items) lines.push(metaRow(meta))
    lines.push('')
  }

  return lines.join('\n')
}
