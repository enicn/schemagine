<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElInput, ElSelect, ElOption, ElTag } from 'element-plus'
import type { MetaGroup, MetaSurface, PropertyMeta } from '@/schemaMeta'
import {
  META_GROUP_LABELS,
  META_KIND_LABELS,
  META_SURFACE_LABELS,
} from '@/schemaMeta'

const props = defineProps<{
  metas: PropertyMeta[]
  /** 高亮命中的属性 key(反查定位) */
  highlightKey?: string | null
}>()

const keyword = ref('')
const groupFilter = ref<MetaGroup | ''>('')
const surfaceFilter = ref<MetaSurface | ''>('')
/** 折叠的分组(默认全展开) */
const collapsed = ref<Set<MetaGroup>>(new Set())

const filtered = computed(() =>
  props.metas.filter((m) => {
    if (groupFilter.value && m.group !== groupFilter.value) return false
    if (surfaceFilter.value && !m.surfaces.includes(surfaceFilter.value)) return false
    const kw = keyword.value.trim().toLowerCase()
    if (!kw) return true
    return m.key.toLowerCase().includes(kw)
      || m.label.toLowerCase().includes(kw)
      || m.description.toLowerCase().includes(kw)
  }),
)

const grouped = computed(() => {
  const result: Array<{ group: MetaGroup; items: PropertyMeta[] }> = []
  for (const m of filtered.value) {
    let bucket = result.find(g => g.group === m.group)
    if (!bucket) {
      bucket = { group: m.group, items: [] }
      result.push(bucket)
    }
    bucket.items.push(m)
  }
  return result
})

function toggleGroup(group: MetaGroup): void {
  const next = new Set(collapsed.value)
  if (next.has(group)) next.delete(group)
  else next.add(group)
  collapsed.value = next
}

function formatDefault(meta: PropertyMeta): string {
  if (meta.default === undefined) return '—'
  if (typeof meta.default === 'boolean') return meta.default ? 'true' : 'false'
  return String(meta.default)
}

function formatExample(meta: PropertyMeta): string {
  if (meta.example === undefined) return ''
  const text = typeof meta.example === 'string'
    ? meta.example
    : JSON.stringify(meta.example)
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}
</script>

<template>
  <div class="prop-doc-table">
    <div class="doc-filters">
      <ElInput
        v-model="keyword"
        class="filter-search"
        size="small"
        clearable
        placeholder="搜索属性名 / 说明…"
      />
      <ElSelect v-model="groupFilter" class="filter-group" size="small" clearable placeholder="全部分组">
        <ElOption v-for="(label, g) in META_GROUP_LABELS" :key="g" :label="label" :value="g" />
      </ElSelect>
      <ElSelect v-model="surfaceFilter" class="filter-surface" size="small" clearable placeholder="全部生效面">
        <ElOption v-for="(label, s) in META_SURFACE_LABELS" :key="s" :label="label" :value="s" />
      </ElSelect>
      <span class="filter-count">{{ filtered.length }} 项</span>
    </div>

    <div v-if="filtered.length === 0" class="doc-empty">没有匹配的配置项</div>

    <div v-for="bucket in grouped" :key="bucket.group" class="doc-group">
      <div class="group-header" @click="toggleGroup(bucket.group)">
        <span class="group-arrow">{{ collapsed.has(bucket.group) ? '▸' : '▾' }}</span>
        <span class="group-title">{{ META_GROUP_LABELS[bucket.group] }}</span>
        <span class="group-count">{{ bucket.items.length }}</span>
      </div>
      <table v-show="!collapsed.has(bucket.group)" class="doc-table">
        <thead>
          <tr>
            <th class="col-name">属性</th>
            <th class="col-kind">类型</th>
            <th class="col-default">默认值</th>
            <th class="col-surfaces">生效面</th>
            <th class="col-desc">说明与示例</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="meta in bucket.items"
            :key="meta.key"
            :class="{ highlighted: meta.key === highlightKey }"
          >
            <td class="col-name">
              <code class="prop-key">{{ meta.key }}</code>
              <span v-if="meta.required" class="req-mark">*</span>
              <ElTag v-if="meta.since" size="small" type="warning" effect="plain" class="since-tag">v{{ meta.since }}</ElTag>
            </td>
            <td class="col-kind">{{ META_KIND_LABELS[meta.kind] }}</td>
            <td class="col-default">{{ formatDefault(meta) }}</td>
            <td class="col-surfaces">
              <template v-if="meta.surfaces.length > 0">
                <ElTag
                  v-for="s in meta.surfaces"
                  :key="s"
                  size="small"
                  effect="plain"
                  class="surface-tag"
                >{{ META_SURFACE_LABELS[s] }}</ElTag>
              </template>
              <span v-else class="no-surface">{{ meta.label.includes('预留') ? '预留' : '结构性' }}</span>
            </td>
            <td class="col-desc">
              <div class="desc-text">{{ meta.description }}</div>
              <div v-if="formatExample(meta)" class="desc-example">示例:<code>{{ formatExample(meta) }}</code></div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.doc-filters {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-3);
  margin-bottom: var(--sg-spacing-4);
}
.filter-search {
  width: 240px;
}
.filter-group,
.filter-surface {
  width: 150px;
}
.filter-count {
  margin-left: auto;
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
}
.doc-empty {
  padding: var(--sg-spacing-8);
  text-align: center;
  color: var(--sg-text-color-secondary);
}
.doc-group {
  margin-bottom: var(--sg-spacing-4);
}
.group-header {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  padding: var(--sg-spacing-2) 0;
  cursor: pointer;
  user-select: none;
}
.group-title {
  font-size: var(--sg-font-size-md);
  font-weight: 600;
}
.group-count {
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
}
.doc-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.doc-table th,
.doc-table td {
  border: 1px solid var(--sg-border-color-light);
  padding: var(--sg-spacing-2) var(--sg-spacing-3);
  font-size: var(--sg-font-size-sm);
  text-align: left;
  vertical-align: top;
  word-break: break-all;
}
.doc-table th {
  background: var(--sg-fill-color-light);
  font-weight: 500;
  color: var(--sg-text-color-secondary);
}
.col-name { width: 170px; }
.col-kind { width: 90px; }
.col-default { width: 80px; }
.col-surfaces { width: 150px; }
.prop-key {
  font-family: var(--sg-font-family-mono, Consolas, monospace);
  color: var(--sg-color-primary);
}
.req-mark {
  color: var(--sg-color-danger);
  margin-left: 2px;
}
.since-tag {
  margin-left: var(--sg-spacing-2);
}
.surface-tag {
  margin: 1px 2px 1px 0;
}
.no-surface {
  color: var(--sg-text-color-secondary);
}
tr.highlighted td {
  background: var(--sg-color-primary-light-9, #ecf5ff);
}
.desc-text {
  white-space: pre-wrap;
}
.desc-example {
  margin-top: var(--sg-spacing-1);
  color: var(--sg-text-color-secondary);
}
.desc-example code {
  font-family: var(--sg-font-family-mono, Consolas, monospace);
  font-size: var(--sg-font-size-sm);
  color: var(--sg-color-success);
}
</style>
