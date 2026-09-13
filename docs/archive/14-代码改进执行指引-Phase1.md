# 代码改进执行指引 — Phase 1：生产容错基础

> 配套 [13-改进路线图](./13-改进路线图.md) Phase 1，每项任务按「文件 → 改动 → 验证」三步执行。

---

## 任务 1.1 — ErrorBoundary 错误边界

### 第一步：创建 ErrorBoundary 组件

**新建** `src/engine/providers/ErrorBoundary.vue`：

```vue
<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import { ElButton, ElCard } from 'element-plus'

const error = ref<string | null>(null)
const errorStack = ref<string | null>(null)
const componentKey = ref(0)

onErrorCaptured((err, instance, info) => {
  error.value = err instanceof Error ? err.message : String(err)
  errorStack.value = err instanceof Error ? err.stack ?? null : null
  console.error('[ErrorBoundary]', err, info, instance)
  return false
})

function retry(): void {
  error.value = null
  errorStack.value = null
  componentKey.value++
}

function isRenderError(err: unknown, info: string): boolean {
  return info.includes('render') || info.includes('setup')
}
</script>

<template>
  <div v-if="error" class="error-boundary">
    <ElCard shadow="hover" class="error-card">
      <div class="error-icon">&#9888;</div>
      <h3 class="error-title">组件渲染异常</h3>
      <p class="error-message">{{ error }}</p>
      <pre v-if="errorStack" class="error-stack">{{ errorStack }}</pre>
      <ElButton type="primary" @click="retry">重试</ElButton>
    </ElCard>
  </div>
  <slot v-else :key="componentKey" />
</template>

<style scoped>
.error-boundary {
  padding: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}
.error-card {
  max-width: 500px;
  width: 100%;
  text-align: center;
}
.error-icon {
  font-size: 32px;
  color: #f56c6c;
  margin-bottom: 8px;
}
.error-title {
  margin: 0 0 8px;
  font-size: 16px;
  color: #303133;
}
.error-message {
  color: #909399;
  font-size: 13px;
  margin: 0 0 12px;
}
.error-stack {
  text-align: left;
  font-size: 11px;
  color: #c0c4cc;
  background: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
  max-height: 120px;
  overflow: auto;
  margin-bottom: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
```

### 第二步：在 SchemaEngine 中包裹

**修改** `src/engine/entry/SchemaEngine.vue`，在 `<SchemaContextProvider>` 外包裹 ErrorBoundary：

找到 `<template>` 中的这段代码：

```vue
<template v-else>
  <SchemaContextProvider :module-id="moduleId">
```

替换为：

```vue
<template v-else>
  <ErrorBoundary>
    <SchemaContextProvider :module-id="moduleId">
```

同时在 `<script>` 顶部增加 import：

```typescript
import ErrorBoundary from '@/engine/providers/ErrorBoundary.vue'
```

并在 `SchemaContextProvider` 的 `</SchemaContextProvider>` 后面（`</template>` 之前）增加 `</ErrorBoundary>` 闭合标签。

### 第三步：验证

1. 在 `ListView.vue` 的 `onMounted` 中临时加入 `throw new Error('test boundary')`
2. 刷新页面 → 引擎应显示错误卡片，不是白屏
3. 点击"重试"按钮 → 恢复
4. 删掉测试代码
5. `pnpm type-check` 0 错误

---

## 任务 1.2 — 内存泄漏清理

### 现状确认

经审计，当前清理状态：

| 组件 | 资源 | 状态 |
|------|------|------|
| `VxeTableWrapper.vue` | ResizeObserver + click listener | ✅ 已有 `onUnmounted` 清理 |
| `CreateView.vue` | mousemove / mouseup listener | 🟡 仅在 dragEnd 清理，unmounted 时未兜底 |
| `FkSelector.vue` | setTimeout debounce | 🟡 无 `onUnmounted` cleanup |

### 改动 2A：CreateView 拖拽事件兜底清理

**修改** `src/engine/containers/CreateView.vue`。

在 `<script>` 的 import 中加入 `onUnmounted`：

```typescript
// 现有 import 行，确保包含 onUnmounted
import { ref, computed, reactive, onUnmounted, nextTick } from 'vue'
```

在 script 末尾（`</script>` 之前）增加：

```typescript
// 兜底清理：组件卸载时如果还有残留的事件监听器，强制移除
onUnmounted(() => {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragUp)
  pendingRowsCount.value = 0
  hasDragged.value = false
})
```

### 改动 2B：FkSelector 定时器清理

**修改** `src/components/field/editors/FkSelector.vue`。

在 import 中确认 `onUnmounted` 存在，在 script 末尾增加：

```typescript
onUnmounted(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }
})
```

### 验证

1. Chrome DevTools → Performance Monitor → 观察 JS heap size
2. 连续切换 10 个模块（voucher → ap → invoice → ...），heap 应稳定
3. 在 CreateView 中开始拖拽行 → 立即切模块（按 Esc 或鼠标点击其他模块）→ 控制台无 error

---

## 任务 1.3 — 服务注入降级

### 改动：base.ts 增加 fallback 工厂

**修改** `src/services/api/base.ts`，在文件末尾追加：

```typescript
export function createFallbackWarning(serviceName: string): void {
  console.warn(
    `[Schemagine] ${serviceName} not initialized. ` +
    `Call initMockServices() or set${serviceName}() before using the engine. ` +
    `Falling back to no-op implementation.`
  )
}
```

### 改动：recordService 降级

**修改** `src/services/api/recordService.ts`，找到 `export const recordService: IRecordService = {` 这一行，在其上方增加 fallback 实现，并把代理调用改为先用 `getRecordService()` 检测：

将文件末尾的：

```typescript
export const recordService: IRecordService = {
  async list(params) {
    return getRecordService().list(params)
  },
  // ...
}
```

替换为：

```typescript
import { createFallbackWarning } from './base'

const fallbackRecordService: IRecordService = {
  async list() {
    createFallbackWarning('RecordService')
    return { success: true, data: { records: [], total: 0, page: 1, pageSize: 20 } }
  },
  async getDetail() {
    createFallbackWarning('RecordService')
    return { success: false, data: null as any, message: 'RecordService 未初始化', errorCode: 'SERVICE_UNAVAILABLE' }
  },
  async patchField() {
    createFallbackWarning('RecordService')
    return { success: false, data: null as any, message: 'RecordService 未初始化', errorCode: 'SERVICE_UNAVAILABLE' }
  },
  async create() {
    createFallbackWarning('RecordService')
    return { success: false, data: null as any, message: 'RecordService 未初始化', errorCode: 'SERVICE_UNAVAILABLE' }
  },
  async batchCreate() {
    createFallbackWarning('RecordService')
    return { success: false, data: null as any, message: 'RecordService 未初始化', errorCode: 'SERVICE_UNAVAILABLE' }
  },
}

export const recordService: IRecordService = {
  async list(params) {
    return (implementation ?? fallbackRecordService).list(params)
  },
  async getDetail(moduleId, recordId) {
    return (implementation ?? fallbackRecordService).getDetail(moduleId, recordId)
  },
  async patchField(params) {
    return (implementation ?? fallbackRecordService).patchField(params)
  },
  async create(params) {
    return (implementation ?? fallbackRecordService).create(params)
  },
  async batchCreate(params) {
    return (implementation ?? fallbackRecordService).batchCreate(params)
  },
}
```

### 改动：schemaService 降级（同理）

**修改** `src/services/api/schemaService.ts`，参照 recordService 模式增加 fallback。

### 改动：candidateService 降级（同理）

**修改** `src/services/api/candidateService.ts`，参照 recordService 模式增加 fallback。

### 改动：userViewConfigService 降级（同理）

**修改** `src/services/api/userViewConfigService.ts`，参照 recordService 模式增加 fallback。

### 改动：relationService 降级（同理）

**修改** `src/services/api/relationService.ts`，参照 recordService 模式增加 fallback。

### 验证

1. 临时注释 `main.ts` 中的 `initMockServices()`
2. 启动项目 → 不应抛 `Error: RecordService not initialized`
3. 控制台应有 `[Schemagine] RecordService not initialized...` warning
4. 列表显示空状态（不崩溃）
5. 恢复 `initMockServices()` 后功能正常

---

## 任务 1.4 — 组件卸载竞态保护

### 改动：ListView fetchData 增加挂载检查

**修改** `src/engine/containers/ListView.vue`。

在 import 中加入：

```typescript
import { ref, computed, watch, getCurrentInstance, onUnmounted } from 'vue'
```

在 `fetchData` 上方增加挂载标记：

```typescript
let isComponentMounted = true
onUnmounted(() => { isComponentMounted = false })
```

在 `fetchData` 的 `finally` 块中增加保护（在 `recordStore.setLoading(false)` 之前）：

```typescript
  } finally {
    if (isComponentMounted) {
      recordStore.setLoading(false)
    }
  }
```

### 改动：CardView 增加挂载检查

**修改** `src/engine/containers/CardView.vue`，同样增加 `isComponentMounted` 保护。

`currentIndex` 变更后的 `navigate` emit 增加保护：

```typescript
function handleNext(): void {
  if (currentIndex.value < records.value.length - 1) {
    currentIndex.value++
    if (isComponentMounted) {
      emit('navigate', { direction: 'next', index: currentIndex.value })
    }
  }
}
```

### 验证

1. 快速连续切换 10 次模块 → 控制台无 "Cannot read properties of null" 错误
2. 无 "Attempting to update unmounted component" Vue warning
3. `pnpm type-check` 0 错误
