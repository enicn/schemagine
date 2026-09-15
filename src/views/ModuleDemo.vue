<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElRadioGroup, ElRadioButton, ElMessage } from 'element-plus'
import SchemaEngine from '@/engine/entry/SchemaEngine.vue'
import { registerLocale } from '@/locales'
import { moduleRoutes } from '@/router'

const props = defineProps<{
  moduleId?: string
}>()

const route = useRoute()
const router = useRouter()

const modulePathMap: Record<string, string> = {}
moduleRoutes.forEach(r => { modulePathMap[r.moduleId] = r.path })

const currentModuleId = ref(props.moduleId ?? 'module-voucher')
// 演示英文语言包（docs/19 G1）：仅覆盖部分表格文案，未覆盖 key 回退 zh-CN；真实宿主应提供完整包
registerLocale('en-US', {
  table: {
    operationsTitle: 'Actions',
    view: 'View',
    filter: {
      asc: 'Ascending', desc: 'Descending', clearSort: 'Clear sort',
      candidatesTitle: 'Filter by values', rangeTitle: 'Filter by range', contentTitle: 'Filter by keyword',
      selectAll: 'Select all', clearFilter: 'Clear filter',
      ok: 'OK', cancel: 'Cancel', loading: 'Loading...', loadingMore: 'Loading...',
      keywordPlaceholder: 'Type keyword, press Enter', searchPlaceholder: 'Search values',
      fkKeywordHint: 'FK columns match related record names', rangeHint: 'Filter by start/end time (inclusive)',
    },
    preset: { today: 'Today', yesterday: 'Yesterday', last7: 'Last 7 days', week: 'This week', lastweek: 'Last week', month: 'This month', lastmonth: 'Last month' },
    summary: { total: 'Total' },
  },
})

// 密度档位演示入口（docs/19 F1）：/module/xxx?density=compact|large 透传给表格引擎
const density = ref<'compact' | 'default' | 'large'>(
  route.query.density === 'compact' || route.query.density === 'large' ? route.query.density : 'default',
)
// 语言演示入口（docs/19 G1）：/module/xxx?locale=en-US 注入引擎
const localeParam = typeof route.query.locale === 'string' ? route.query.locale : undefined
const availableModules = [
  { id: 'module-voucher', label: '凭证管理' },
  { id: 'module-ap', label: '应付账款' },
  { id: 'module-invoice', label: '发票管理' },
  { id: 'module-sales-order', label: '销售单' },
  { id: 'module-receivable', label: '应收账单' },
  { id: 'module-user', label: '用户管理' },
  { id: 'module-workshop', label: '车间管理' },
  { id: 'module-dept', label: '部门管理' },
  { id: 'module-empty', label: '空模块' },
  { id: 'module-no-perm', label: '无权限' },
]

onMounted(() => {
  if (props.moduleId) {
    currentModuleId.value = props.moduleId
  } else {
    const moduleId = route.params.moduleId as string
    if (moduleId) {
      currentModuleId.value = moduleId
    }
  }
})

watch(() => props.moduleId, (newId) => {
  if (newId) {
    currentModuleId.value = newId
  }
})

function handleModuleChange(moduleId: string | number | boolean | undefined): void {
  if (typeof moduleId !== 'string') return
  currentModuleId.value = moduleId
  const path = modulePathMap[moduleId]
  if (path) {
    router.push(path)
  } else {
    router.push(`/module/${moduleId}`)
  }
}

function onModuleLoaded(payload: { moduleId: string }): void {
  ElMessage.success(`模块 ${payload.moduleId} 加载成功`)
}

function onError(payload: { moduleId: string; code: string; message: string }): void {
  ElMessage.error(`${payload.code}: ${payload.message}`)
}
</script>

<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="header-brand">
        <h1 class="app-title">Schemagine</h1>
        <span class="app-version">v0.1</span>
        <span class="app-badge">Schema-Driven Engine</span>
      </div>
      <ElRadioGroup
        :model-value="currentModuleId"
        @change="handleModuleChange"
        size="small"
      >
        <ElRadioButton
          v-for="mod in availableModules"
          :key="mod.id"
          :value="mod.id"
        >
          {{ mod.label }}
        </ElRadioButton>
      </ElRadioGroup>
      <div class="header-actions">
        <router-link to="/editor">
          <ElButton size="small" type="warning" plain>
            Schema 编辑器
          </ElButton>
        </router-link>
      </div>
    </header>

    <main class="app-main">
      <SchemaEngine
        :key="currentModuleId"
        :module-id="currentModuleId"
        :density="density"
        :locale="localeParam"
        @module-loaded="onModuleLoaded"
        @error="onError"
      />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(6, 182, 212, 0.04), transparent),
    radial-gradient(ellipse 60% 50% at 50% 120%, rgba(59, 130, 246, 0.03), transparent);
}

.app-header {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-10);
  padding: var(--sg-spacing-6) var(--sg-spacing-12);
  background: rgba(255, 255, 255, 0.80);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--sg-border-color-light);
  flex-shrink: 0;
  overflow-x: auto;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-5);
  flex-shrink: 0;
}

.app-title {
  margin: 0;
  font-size: var(--sg-font-size-2xl);
  font-weight: 700;
  background: linear-gradient(135deg, #0F172A, #1E40AF);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-family: 'Poppins', 'Inter', sans-serif;
  white-space: nowrap;
}

.app-version {
  font-size: var(--sg-font-size-sm);
  color: #94A3B8;
  font-family: 'Open Sans', sans-serif;
}

.app-badge {
  font-size: var(--sg-font-size-xs);
  padding: var(--sg-spacing-1) var(--sg-spacing-4);
  background: rgba(59, 130, 246, 0.08);
  color: var(--sg-color-primary);
  border-radius: var(--sg-radius-round);
  font-weight: 500;
  white-space: nowrap;
}

.header-actions {
  margin-left: auto;
  flex-shrink: 0;
}

.app-main {
  flex: 1;
  overflow: hidden;
  padding: var(--sg-spacing-8);
}
</style>
