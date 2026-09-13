<script setup lang="ts">
import { reactive } from 'vue'
import type { FilterClause, FieldSchema } from '@/types'

export interface FilterTab {
  id: string
  label: string
  count?: number
  badge?: string | number
  badgeLoading?: boolean
  filter?: FilterClause
}

const props = defineProps<{
  tabs: FilterTab[]
  activeTabId: string
  showCount?: boolean
  allowCustomize?: boolean
}>()

const emit = defineEmits<{
  change: [tabId: string]
  'add-tab': []
  'edit-tab': [tabId: string]
  'delete-tab': [tabId: string]
}>()

const badgeOverrides = reactive<Record<string, string | number | undefined>>({})
const badgeLoadingOverrides = reactive<Record<string, boolean>>({})

function handleTabClick(tabId: string): void {
  if (tabId !== props.activeTabId) {
    emit('change', tabId)
  }
}

function handleContextMenu(event: MouseEvent): void {
  if (!props.allowCustomize) return
  event.preventDefault()
}

function getTabBadgeDisplay(tab: FilterTab): string | number | undefined {
  if (badgeOverrides[tab.id] !== undefined) return badgeOverrides[tab.id]
  if (tab.badge !== undefined) return tab.badge
  return tab.count
}

function isTabBadgeLoading(tab: FilterTab): boolean {
  if (badgeLoadingOverrides[tab.id]) return true
  if (tab.badgeLoading) return true
  return false
}

function setTabBadge(tabId: string, value: string | number): void {
  badgeOverrides[tabId] = value
}

function setTabBadges(records: Record<string, string | number>): void {
  for (const [tabId, value] of Object.entries(records)) {
    badgeOverrides[tabId] = value
  }
}

function clearBadges(): void {
  for (const key of Object.keys(badgeOverrides)) {
    delete badgeOverrides[key]
  }
}

function setTabBadgeLoading(tabId: string, loading: boolean): void {
  badgeLoadingOverrides[tabId] = loading
}

function buildTabsFromField(field: FieldSchema, records: Record<string, unknown>[]): FilterTab[] {
  const options = field.options ?? []
  const stats = countByFieldValue(records, field.key)
  const total = records.length

  const tabs: FilterTab[] = [
    { id: '__all__', label: '全部', count: total },
  ]

  for (const opt of options) {
    const count = stats[String(opt.value)] ?? 0
    tabs.push({
      id: `f:${field.key}:${String(opt.value)}`,
      label: opt.label,
      count,
      filter: { field: field.key, operator: 'eq', value: opt.value },
    })
  }
  return tabs
}

function countByFieldValue(records: Record<string, unknown>[], fieldKey: string): Record<string, number> {
  const stats: Record<string, number> = {}
  for (const record of records) {
    const val = record[fieldKey]
    if (val !== undefined && val !== null) {
      const key = String(val)
      stats[key] = (stats[key] ?? 0) + 1
    }
  }
  return stats
}

function resolveTabFilter(tabId: string): FilterClause | null {
  if (tabId === '__all__') return null
  const tab = props.tabs.find(t => t.id === tabId)
  return tab?.filter ?? null
}

defineExpose({
  buildTabsFromField,
  resolveTabFilter,
  setTabBadge,
  setTabBadges,
  clearBadges,
  setTabBadgeLoading,
})
</script>

<template>
  <div class="bottom-tabs">
    <div class="tabs-scroll">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: activeTabId === tab.id }"
        @click="handleTabClick(tab.id)"
        @contextmenu="handleContextMenu($event)"
      >
        <span class="tab-label">{{ tab.label }}</span>
        <span v-if="showCount && (isTabBadgeLoading(tab) || getTabBadgeDisplay(tab) !== undefined)" class="tab-count-wrap">
          <span v-if="isTabBadgeLoading(tab)" class="tab-badge-loading" />
          <span v-else class="tab-count">{{ getTabBadgeDisplay(tab) }}</span>
        </span>
      </button>
    </div>
    <div v-if="allowCustomize" class="tabs-actions">
      <button class="tab-add-btn" title="添加标签" @click="emit('add-tab')">+</button>
    </div>
  </div>
</template>

<style scoped>
.bottom-tabs {
  display: flex;
  align-items: center;
  border-top: 1px solid var(--sg-border-color-light);
  background: var(--sg-fill-color-lighter);
  padding: 0 var(--sg-spacing-8);
  gap: var(--sg-spacing-2);
  flex-shrink: 0;
  min-height: 36px;
}
.tabs-scroll {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
}
.tabs-scroll::-webkit-scrollbar {
  display: none;
}
.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  padding: var(--sg-spacing-2) var(--sg-spacing-5);
  border: 1px solid transparent;
  border-radius: var(--sg-radius-md);
  background: transparent;
  cursor: pointer;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-regular);
  white-space: nowrap;
  transition: all var(--sg-duration-normal);
  user-select: none;
}
.tab-btn:hover {
  background: var(--sg-color-primary-light-9);
  color: var(--sg-color-primary);
}
.tab-btn.active {
  background: var(--sg-color-primary);
  color: var(--sg-color-white);
  border-color: var(--sg-color-primary);
}
.tab-btn.active .tab-count {
  background: color-mix(in srgb, var(--sg-color-white) 25%, transparent);
  color: var(--sg-color-white);
}
.tab-label {
  line-height: 1.4;
}
.tab-count-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
}
.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 var(--sg-spacing-2);
  border-radius: var(--sg-radius-xl);
  background: var(--sg-fill-color);
  font-size: var(--sg-font-size-sm);
  font-weight: 600;
  color: var(--sg-text-color-secondary);
  line-height: 18px;
}
.tab-badge-loading {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--sg-border-color-light);
  border-top-color: var(--sg-color-primary);
  border-radius: var(--sg-radius-circle);
  animation: tab-spin 0.6s linear infinite;
}
@keyframes tab-spin {
  to {
    transform: rotate(360deg);
  }
}
.tabs-actions {
  flex-shrink: 0;
}
.tab-add-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px dashed var(--sg-border-color);
  border-radius: var(--sg-radius-md);
  background: transparent;
  cursor: pointer;
  font-size: var(--sg-font-size-xl);
  color: var(--sg-text-color-secondary);
  transition: all var(--sg-duration-normal);
}
.tab-add-btn:hover {
  color: var(--sg-color-primary);
  border-color: var(--sg-color-primary);
}
</style>
