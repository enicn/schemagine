# 代码改进执行指引 — Phase 3：多实例 + npm 可分发

> 配套 [13-改进路线图](./13-改进路线图.md) Phase 3。

---

## 任务 3.1 — loadingModuleId 实例作用域化

### 第一步：将全局 ref 移入函数作用域

**修改** `src/composables/useSchema.ts`。

把这一行：

```typescript
export const loadingModuleId = ref<string | null>(null)
```

删除。然后在 `useSchema()` 函数内部的第一行增加：

```typescript
export function useSchema() {
  const loadingModuleId = ref<string | null>(null)  // ← 移到此处，每次调用创建独立实例
  const schemaMeta = useSchemaMetaStore()
```

### 第二步：处理外部引用

搜索 `loadingModuleId` 的所有引用：

1. `ListView.vue` 中 `fetchData` 的竞态检查 `loadingModuleId.value` — 改为通过 composable 获取：

**修改** `src/engine/containers/ListView.vue`，删除 import 中的 `loadingModuleId`，在 script 内部增加：

```typescript
const { loadingModuleId } = useSchema()
```

`useSchema` 已在顶部导入（如果未导入则补充 import），然后从解构中取 `loadingModuleId`。

### 第三步：验证多实例

**修改** `src/views/ModuleDemo.vue` 或创建测试页面，渲染两个 `SchemaEngine`：

```vue
<div style="display:flex; gap:16px">
  <div style="flex:1; height:100vh">
    <SchemaEngine module-id="module-voucher" />
  </div>
  <div style="flex:1; height:100vh">
    <SchemaEngine module-id="module-ap" />
  </div>
</div>
```

**验收**：
1. 两个引擎独立加载各自模块，不互相干扰
2. 无 console error
3. `pnpm type-check` 0 错误

---

## 任务 3.2 — npm Library Mode 构建

### 第一步：创建库入口文件

**新建** `src/index.ts`：

```typescript
// === 引擎入口 ===
export { default as SchemaEngine } from './engine/entry/SchemaEngine.vue'
export { default as ViewContainer } from './engine/containers/ViewContainer.vue'

// === 视图组件 ===
export { default as ListView } from './engine/containers/ListView.vue'
export { default as CardView } from './engine/containers/CardView.vue'
export { default as CreateView } from './engine/containers/CreateView.vue'

// === 可复用组件 ===
export { default as SchemaTable } from './components/table/SchemaTable.vue'
export { default as VxeTableWrapper } from './components/table/VxeTableWrapper.vue'
export { default as SchemaFilterBar } from './components/filter/SchemaFilterBar.vue'
export { default as SchemaCard } from './components/card/SchemaCard.vue'
export { default as FieldEditorFactory } from './components/field/FieldEditorFactory.vue'
export { default as ValueRenderer } from './components/field/editors/ValueRenderer.vue'

// === Service 接口（供外部注入） ===
export { setRecordService } from './services/api/recordService'
export { setSchemaService } from './services/api/schemaService'
export { setCandidateService } from './services/api/candidateService'
export { setUserViewConfigService } from './services/api/userViewConfigService'
export { setRelationService } from './services/api/relationService'
export type { IRecordService } from './services/api/recordService'
export type { ISchemaService } from './services/api/schemaService'
export type { ICandidateService } from './services/api/candidateService'
export type { IUserViewConfigService } from './services/api/userViewConfigService'
export type { IRelationService } from './services/api/relationService'

// === 全部类型 ===
export type * from './types'
export type { ViewMode } from './constants'
```

### 第二步：修改 vite.config.ts

在现有配置中增加 library mode（保留 app 构建）：

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { resolve } from 'path'

export default defineConfig(({ command }) => {
  if (command === 'build' && process.env.BUILD_LIB === 'true') {
    return {
      plugins: [vue(), vueJsx()],
      build: {
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          name: 'Schemagine',
          formats: ['es', 'cjs'],
          fileName: (format) => `schemagine.${format === 'es' ? 'mjs' : 'cjs'}`,
        },
        rollupOptions: {
          external: [
            'vue',
            'vue-router',
            'pinia',
            'element-plus',
            'vxe-table',
            'vxe-pc-ui',
            'xe-utils',
            'mathjs',
          ],
          output: {
            globals: {
              vue: 'Vue',
              'vue-router': 'VueRouter',
              pinia: 'Pinia',
              'element-plus': 'ElementPlus',
            },
          },
        },
      },
    }
  }
  return {
    // 现有 app 构建配置不变
  }
})
```

### 第三步：修改 package.json

```json
{
  "scripts": {
    "build:lib": "BUILD_LIB=true vite build",
    // ... 现有 scripts 不变
  },
  "main": "./dist/schemagine.cjs",
  "module": "./dist/schemagine.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/schemagine.mjs",
      "require": "./dist/schemagine.cjs",
      "types": "./dist/index.d.ts"
    },
    "./dist/style.css": "./dist/style.css"
  },
  "files": [
    "dist"
  ]
}
```

### 第四步：验证

```powershell
pnpm build:lib
# 检查产出文件
Get-ChildItem dist/schemagine.*
# dist/schemagine.mjs
# dist/schemagine.cjs
```

---

## 任务 3.3 — 公开 API 边界

已在任务 3.2 的 `src/index.ts` 中完成。

**原则**：
- ✅ 公开：引擎入口、视图容器、可复用组件、Service 接口、全部类型
- ❌ 不公开：内部 composables、Mock 层、具体编辑器实现（通过 Factory 间接使用）

---

## Phase 4：扩展性与解耦（执行指引）

### 任务 4.1 — FieldEditorFactory 插件化

**新建** `src/components/field/editorRegistry.ts`：

```typescript
import type { Component } from 'vue'
import type { FieldType } from '@/types'

const registry = new Map<FieldType, Component>()

export function registerFieldEditor(type: FieldType, component: Component): void {
  registry.set(type, component)
}

export function unregisterFieldEditor(type: FieldType): void {
  registry.delete(type)
}

export function getRegisteredEditor(type: FieldType): Component | undefined {
  return registry.get(type)
}

export function getEditorRegistrySize(): number {
  return registry.size
}
```

**修改** `src/components/field/FieldEditorFactory.vue`，在 `editorComponent` computed 中，优先从注册表查找：

```typescript
const editorComponent = computed(() => {
  if (!isEditable.value) {
    if (props.fieldSchema.type === 'one-to-many' || props.fieldSchema.type === 'many-to-many' || props.fieldSchema.type === 'reverse-ref') {
      return RelationEditor
    }
    return ValueRenderer
  }

  // 优先从插件注册表查找
  const registered = getRegisteredEditor(props.fieldSchema.type)
  if (registered) return registered

  // fallback 到内置编辑器
  const type = props.fieldSchema.type
  switch (type) {
    // ... 现有 switch 不变 ...
  }
})
```

**新增** 在 `src/index.ts` 中导出 `registerFieldEditor` 和 `unregisterFieldEditor`。

### 任务 4.2 — UI 适配层

**新建** `src/ui/types.ts`：

```typescript
import type { Component } from 'vue'

export interface UIComponents {
  Button: Component
  Input: Component
  Select: Component
  Option: Component
  Dialog: Component
  Pagination: Component
  Tag: Component
  DatePicker: Component
  Switch: Component
  Popover: Component
  Tooltip: Component
  Card: Component
  Empty: Component
  Checkbox: Component
  RadioGroup: Component
  RadioButton: Component
  InputNumber: Component
  Upload: Component
}

export interface UIMessageFn {
  info: (msg: string) => void
  warning: (msg: string) => void
  error: (msg: string) => void
  success: (msg: string) => void
}
```

**新建** `src/ui/element-plus.ts`（Element Plus 实现，封装现有 El* 组件为类型安全的包装）：

```typescript
import {
  ElButton, ElInput, ElSelect, ElOption, ElDialog,
  ElPagination, ElTag, ElDatePicker, ElSwitch,
  ElPopover, ElTooltip, ElCard, ElEmpty, ElCheckbox,
  ElRadioGroup, ElRadioButton, ElInputNumber, ElUpload,
  ElMessage,
} from 'element-plus'
import type { UIComponents, UIMessageFn } from './types'

export const elementPlusUI: UIComponents = {
  Button: ElButton,
  Input: ElInput,
  Select: ElSelect,
  Option: ElOption,
  Dialog: ElDialog,
  Pagination: ElPagination,
  Tag: ElTag,
  DatePicker: ElDatePicker,
  Switch: ElSwitch,
  Popover: ElPopover,
  Tooltip: ElTooltip,
  Card: ElCard,
  Empty: ElEmpty,
  Checkbox: ElCheckbox,
  RadioGroup: ElRadioGroup,
  RadioButton: ElRadioButton,
  InputNumber: ElInputNumber,
  Upload: ElUpload,
}

export const elementPlusMessage: UIMessageFn = {
  info: (msg) => ElMessage.info(msg),
  warning: (msg) => ElMessage.warning(msg),
  error: (msg) => ElMessage.error(msg),
  success: (msg) => ElMessage.success(msg),
}
```

### 任务 4.3 — 视图可替换

**修改** `src/engine/entry/SchemaEngine.vue`，增加视图替换 prop：

```typescript
const props = defineProps<{
  moduleId: string
  initialViewMode?: ViewMode
  embedded?: boolean
  readonly?: boolean
  /** 自定义视图组件（可选） */
  customViews?: {
    listView?: Component
    cardView?: Component
    createView?: Component
  }
}>()
```

在模板中，优先使用 slot，其次用 prop 注入的组件，再 fallback 到默认：

```vue
<template v-if="$slots['list-view']">
  <slot name="list-view" />
</template>
<component
  v-else-if="customViews?.listView"
  :is="customViews.listView"
  :schema="schemaMeta.schema"
  :view-config="schemaMeta.viewConfig?.columns ?? []"
  @cell-edit="handleCellEdit"
  @query-change="handleQueryChange"
/>
<ListView
  v-else-if="schemaMeta.schema"
  :schema="schemaMeta.schema"
  :view-config="schemaMeta.viewConfig?.columns ?? []"
  @cell-edit="handleCellEdit"
  @query-change="handleQueryChange"
/>
```

---

## Phase 5：国际化与主题（执行指引）

### 任务 5.1 — i18n

**新建** `src/i18n/zh-CN.ts`：

```typescript
export default {
  save: '保存',
  cancel: '取消',
  edit: '编辑',
  delete: '删除',
  confirm: '确认',
  retry: '重试',
  search: '搜索',
  reset: '重置',
  addRow: '新增行',
  batchDelete: '批量删除',
  export: '导出',
  import: '导入',
  listView: '列表视图',
  cardView: '卡片视图',
  createView: '新增',
  columnSettings: '列设置',
  cardLayout: '卡片布局',
  noData: '暂无数据',
  noPermission: '无权限访问该模块',
  loadError: '模块加载失败',
  totalRecords: '共 {total} 条',
  recordNav: '记录 {current} / {count}',
  versionConflict: '数据已被其他用户修改，请刷新后重试',
  formulaCycle: '检测到公式循环依赖',
  clearFilters: '清除筛选',
  clearSort: '清除排序',
  clearAll: '清除全部',
}
```

**新建** `src/i18n/en-US.ts`（英文对应翻译）。

**新建** `src/i18n/index.ts`：

```typescript
import { ref } from 'vue'
import zhCN from './zh-CN'
import enUS from './en-US'

type LocaleMessages = typeof zhCN
type LocaleKey = keyof LocaleMessages

const messages: Record<string, LocaleMessages> = { 'zh-CN': zhCN, 'en-US': enUS }
const currentLocale = ref('zh-CN')

export function t(key: LocaleKey, params?: Record<string, string | number>): string {
  const locale = messages[currentLocale.value] ?? zhCN
  let text = (locale as Record<string, string>)[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v))
    }
  }
  return text
}

export function setLocale(locale: string): void {
  if (messages[locale]) {
    currentLocale.value = locale
  }
}

export function getCurrentLocale(): string {
  return currentLocale.value
}

export function addLocaleMessages(locale: string, msgs: Partial<LocaleMessages>): void {
  if (!messages[locale]) {
    messages[locale] = {} as LocaleMessages
  }
  Object.assign(messages[locale], msgs)
}
```

在 `src/index.ts` 中导出 `t` / `setLocale` / `addLocaleMessages`。

**迁移策略**：Phase 5 执行时逐文件替换硬编码文案为 `t('key')`，非一次性迁移。

### 任务 5.2 — CSS 变量主题

**新建** `src/styles/tokens.css`：

```css
:root {
  /* 品牌色 */
  --sc-color-primary: #409eff;
  --sc-color-primary-light: #66b1ff;
  --sc-color-danger: #f56c6c;
  --sc-color-warning: #e6a23c;
  --sc-color-success: #67c23a;

  /* 背景 */
  --sc-bg-page: #f5f7fa;
  --sc-bg-card: #ffffff;
  --sc-bg-hover: #f0f2f5;
  --sc-bg-active: #ecf5ff;

  /* 文字 */
  --sc-text-primary: #303133;
  --sc-text-regular: #606266;
  --sc-text-secondary: #909399;
  --sc-text-placeholder: #c0c4cc;

  /* 边框 */
  --sc-border-color: #e4e7ed;
  --sc-border-color-light: #ebeef5;

  /* 间距 */
  --sc-spacing-xs: 4px;
  --sc-spacing-sm: 8px;
  --sc-spacing-md: 12px;
  --sc-spacing-lg: 16px;
  --sc-spacing-xl: 24px;

  /* 圆角 */
  --sc-radius-sm: 4px;
  --sc-radius-md: 8px;

  /* 字体 */
  --sc-font-size-xs: 12px;
  --sc-font-size-sm: 13px;
  --sc-font-size-md: 14px;
  --sc-font-size-lg: 16px;
  --sc-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.theme-dark {
  --sc-bg-page: #1a1a2e;
  --sc-bg-card: #252740;
  --sc-bg-hover: #2d2f4a;
  --sc-bg-active: #1e3a5f;

  --sc-text-primary: #e0e0e0;
  --sc-text-regular: #b0b0b0;
  --sc-text-secondary: #808080;
  --sc-text-placeholder: #606060;

  --sc-border-color: #404060;
  --sc-border-color-light: #353550;
}
```

在 `src/main.ts` 中 import：`import './styles/tokens.css'`。

在 `src/index.ts` 中导出 tokens.css 路径（供消费者项目 import）。

---

## Phase 6：功能补全（执行指引摘要）

### 任务 6.1 — 全文搜索

在 `SchemaFilterBar.vue` 筛选栏最左侧增加 `ElInput`，emit 独立的 `keyword-search` 事件，`ListView` 接收后传给 `recordService.list({ keyword })`。

### 任务 6.2 — CSV 导入导出

**导出**: `composables/useExport.ts` — `records → headers + rows → BOM + CSV → blob → download`。

**导入**: `composables/useImport.ts` — `FileReader → 解析 CSV → 校验字段 → 返回 DraftRecord[]`。

### 任务 6.3 — 文件上传编辑器

新建 `components/field/editors/FileEditor.vue`，封装 `ElUpload` + 预览。修改 `editorRegistry.ts` 注册 `image` / `attachment` 类型。

### 任务 6.4 — 筛选预设

在 `SchemaFilterBar.vue` 增加预设保存/选择 UI，写入 `UserViewConfig.filterPresets`。

### 任务 6.5 — 测试覆盖率

补充 `evaluateFilter.spec.ts`（10 种算子覆盖）、`schemaMigration.spec.ts`、`editorRegistry.spec.ts`；E2E 补充 P1 场景。

### 任务 6.6 — 移动端响应式

`SchemaFilterBar` ≤768px 折叠面板；表格 ≤640px 切换卡片列表。
