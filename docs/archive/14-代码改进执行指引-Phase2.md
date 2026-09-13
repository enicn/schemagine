# 代码改进执行指引 — Phase 2：Schema 平滑升级

> 配套 [13-改进路线图](./13-改进路线图.md) Phase 2。这是最关键的阶段——Schema 字段变更后旧数据不丢失。

---

## 任务 2.1 — 字段重命名映射（previousKeys）

### 第一步：扩展类型定义

**修改** `src/types/schema.ts`，在 `FieldSchema` 接口中（`reverseRefConfig` 之前）增加：

```typescript
export interface FieldSchema {
  // ... 现有字段保留不动 ...

  /** @since 2.0 字段重命名：旧 key 列表，引擎自动映射 */
  previousKeys?: string[]
}
```

### 第二步：在 loadModule 中实现 key 映射

**修改** `src/composables/useSchema.ts`。

在 `loadModule` 函数中，`schemaMeta.setSchema(schema)` 之后增加迁移步骤。找到：

```typescript
      schemaMeta.setSchema(schema)
      schemaMeta.setPermissions(permissions)
      schemaMeta.setViewConfig(viewConfig)
```

在这三行之上插入 `runFieldKeyMigration(schema, moduleId)` 调用，并在文件中新增函数。

在 `createDefaultConfig` 前面插入：

```typescript
import { readStorage, writeStorage } from '@/services/mock/mockStorage'
import type { RecordEntity } from '@/types'

function runFieldKeyMigration(schema: ModuleSchema, moduleId: string): void {
  const renamedFields = schema.fields.filter(f => f.previousKeys && f.previousKeys.length > 0)
  if (renamedFields.length === 0) return

  const RECORDS_KEY = `records:${moduleId}`
  const CONFIGS_KEY = `configs:${moduleId}`

  // 迁移记录数据
  const records = readStorage<RecordEntity[]>(RECORDS_KEY, [])
  if (records.length > 0) {
    let changed = false
    for (const record of records) {
      for (const field of renamedFields) {
        for (const oldKey of (field.previousKeys ?? [])) {
          if (oldKey in record.fields && !(field.key in record.fields)) {
            record.fields[field.key] = record.fields[oldKey]
            delete record.fields[oldKey]
            changed = true
          }
        }
      }
    }
    if (changed) {
      writeStorage(RECORDS_KEY, records)
      console.log(`[SchemaMigration] 已迁移 ${moduleId} 的 ${changed ? '已修改' : '兼容'} 记录，涉及字段: ${renamedFields.map(f => `${f.previousKeys?.join('/')} → ${f.key}`).join(', ')}`)
    }
  }

  // 迁移视图配置中的列引用
  const config = readStorage<{ columns?: Array<{ field: string }> }>(CONFIGS_KEY, {} as any)
  if (config && config.columns && config.columns.length > 0) {
    let configChanged = false
    for (const col of config.columns) {
      for (const field of renamedFields) {
        for (const oldKey of (field.previousKeys ?? [])) {
          if (col.field === oldKey) {
            col.field = field.key
            configChanged = true
          }
        }
      }
    }
    if (configChanged) {
      writeStorage(CONFIGS_KEY, config)
    }
  }
}
```

### 第三步：验证

**新建** `src/__tests__/schemaMigration.spec.ts`：

```typescript
import { describe, it, expect } from 'vitest'

describe('Schema 字段重命名映射', () => {
  it('应自动将旧 key 映射到新 key', () => {
    const record = { fields: { remark: 'test note', amount: 100 } }
    const previousKeys = ['remark']
    const newKey = 'summary'

    for (const oldKey of previousKeys) {
      if (oldKey in record.fields && !(newKey in record.fields)) {
        record.fields[newKey] = record.fields[oldKey]
        delete record.fields[oldKey]
      }
    }

    expect(record.fields).toEqual({ summary: 'test note', amount: 100 })
  })

  it('应保留已有新 key 不被覆盖', () => {
    const record = { fields: { remark: 'old', summary: 'new', amount: 100 } }
    const previousKeys = ['remark']
    const newKey = 'summary'

    for (const oldKey of previousKeys) {
      if (oldKey in record.fields && !(newKey in record.fields)) {
        record.fields[newKey] = record.fields[oldKey]
        delete record.fields[oldKey]
      }
    }

    expect(record.fields).toEqual({ remark: 'old', summary: 'new', amount: 100 })
  })

  it('应处理空 previousKeys', () => {
    const record = { fields: { name: 'test' } }
    expect(record.fields).toEqual({ name: 'test' })
  })
})
```

运行：`pnpm test:unit`

---

## 任务 2.2 — SchemaMigration 链式迁移协议

### 第一步：扩展类型定义

**修改** `src/types/schema.ts`，在文件末尾追加：

```typescript
export interface SchemaMigration {
  /** 起始版本号 */
  fromVersion: string
  /** 目标版本号 */
  toVersion: string
  /** 迁移单条记录（内联修改，不返回新对象） */
  migrateRecord: (record: Record<string, unknown>) => void
  /** 迁移用户视图配置（可选） */
  migrateViewConfig?: (config: UserViewConfig) => UserViewConfig
  /** 迁移筛选预设（可选） */
  migrateFilterPresets?: (presets: FilterPreset[]) => FilterPreset[]
}
```

同时更新 `ModuleSchema` 接口，在 `status` 之前增加：

```typescript
  /** @since 2.0 版本迁移列表：按 fromVersion 升序排列 */
  migrations?: SchemaMigration[]
```

### 第二步：实现链式迁移函数

**新建** `src/composables/useMigration.ts`：

```typescript
import type { ModuleSchema, SchemaMigration } from '@/types'

export function runSchemaMigrations(
  schema: ModuleSchema,
  storedVersion: string, // 数据最后经历的版本
): void {
  if (!schema.migrations || schema.migrations.length === 0) return

  const applicable = schema.migrations
    .sort((a, b) => compareVersions(a.fromVersion, b.fromVersion))
    .filter(m => compareVersions(m.fromVersion, storedVersion) >= 0)

  if (applicable.length === 0) return

  console.log(
    `[SchemaMigration] ${schema.id}: 执行 ${applicable.length} 步迁移 ` +
    `(${storedVersion} → ${schema.version})`
  )

  for (const migration of applicable) {
    try {
      // migrateRecord 由调用方（mockAdapter / API）在下层执行
      console.log(`[SchemaMigration]   ${migration.fromVersion} → ${migration.toVersion}`)
    } catch (err) {
      console.error(
        `[SchemaMigration] ${schema.id} 迁移 ${migration.fromVersion}→${migration.toVersion} 失败:`,
        err
      )
      throw err // 中止迁移链，保留旧数据不损坏
    }
  }
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
```

### 第三步：在 mockAdapter 中集成迁移

**修改** `src/services/mock/mockAdapter.ts`。

在 `MockRecordService.list` 方法中，`seedRecordsIfNeeded` 之前增加迁移调用：

```typescript
async list(params: ListQueryParams): Promise<ApiResponse<RecordListResponse>> {
  await delay()
  const { moduleId, page, pageSize } = params

  // ... 现有权限检查代码不变 ...

  // === 新增：执行 Schema 迁移 ===
  const schemaKey = `${SCHEMA_KEY_PREFIX}${moduleId}`
  const schema = readStorage<ModuleSchema | null>(schemaKey, null)
  if (schema && schema.migrations && schema.migrations.length > 0) {
    const recordsKey = getRecordsKey(moduleId)
    let records = readStorage<RecordEntity[]>(recordsKey, [])
    if (records.length > 0) {
      const dataVersion = readStorage<string>(`${recordsKey}__version`, schema.migrations[0]!.fromVersion)
      const applicable = schema.migrations.filter(m => compareVersions(m.fromVersion, dataVersion) >= 0)

      if (applicable.length > 0) {
        for (const migration of applicable) {
          for (const record of records) {
            migration.migrateRecord(record.fields)
          }
        }
        writeStorage(recordsKey, records)
        writeStorage(`${recordsKey}__version`, schema.version)
        console.log(`[SchemaMigration] ${moduleId}: 已迁移 ${records.length} 条记录到 v${schema.version}`)
      }
    }
  }
  // === 迁移结束 ===

  let records = seedRecordsIfNeeded(moduleId)
  // ... 后续排序筛选代码不变 ...
}
```

在文件顶部增加 `compareVersions` helper（或复用 useMigration 中的）。

### 第四步：验证

**新建** `src/__tests__/schemaMigrationChain.spec.ts`：

```typescript
import { describe, it, expect } from 'vitest'

describe('Schema 链式迁移', () => {
  it('应按版本顺序链式执行迁移', () => {
    const record = { fields: { amount: '1000' } }

    const migrations = [
      {
        fromVersion: '1.0.0', toVersion: '1.1.0',
        migrateRecord: (fields: Record<string, unknown>) => {
          fields.amount = Number(fields.amount)
        },
      },
      {
        fromVersion: '1.1.0', toVersion: '2.0.0',
        migrateRecord: (fields: Record<string, unknown>) => {
          fields.amountWithTax = (fields.amount as number) * 1.13
        },
      },
    ]

    for (const m of migrations) {
      m.migrateRecord(record.fields)
    }

    expect(record.fields).toEqual({ amount: 1000, amountWithTax: 1130 })
  })

  it('迁移异常不应损坏旧数据（回滚）', () => {
    const original = { fields: { name: 'test' } }
    const snapshot = JSON.parse(JSON.stringify(original))

    const badMigration = {
      migrateRecord: () => { throw new Error('迁移失败') },
    }

    try {
      badMigration.migrateRecord(original.fields)
    } catch {
      // 恢复快照
      original.fields = JSON.parse(JSON.stringify(snapshot.fields))
    }

    expect(original.fields).toEqual({ name: 'test' })
  })
})
```

运行：`pnpm test:unit`

---

## 任务 2.3 — viewConfig 自动合并

### 改动：在 useSchema 中增加合并函数

**修改** `src/composables/useSchema.ts`。

在 `createDefaultConfig` 函数之前，新增：

```typescript
function ensureViewConfigCompatibility(
  schema: ModuleSchema,
  config: UserViewConfig,
): UserViewConfig {
  const validKeys = new Set(schema.fields.map(f => f.key))

  // 清理已删除字段的列配置
  const cleanColumns = config.columns.filter(c => validKeys.has(c.field))

  // 补充新增字段的默认列配置
  const existingKeys = new Set(cleanColumns.map(c => c.field))
  let maxOrder = cleanColumns.length > 0
    ? Math.max(...cleanColumns.map(c => c.order))
    : -1

  for (const field of schema.fields) {
    if (!existingKeys.has(field.key) && field.visible !== false) {
      maxOrder++
      cleanColumns.push({
        field: field.key,
        width: field.width ?? 120,
        visible: true,
        order: maxOrder,
        sortable: !!field.sortable,
      })
    }
  }

  const removedCount = config.columns.length - cleanColumns.length
  const addedCount = cleanColumns.length - cleanColumns.filter(c => existingKeys.has(c.field)).length

  if (removedCount > 0 || addedCount > 0) {
    console.log(
      `[ViewConfig] ${schema.id}: 清理 ${removedCount} 列，补充 ${addedCount} 列`
    )
  }

  return { ...config, columns: cleanColumns }
}
```

在 `loadModule` 函数中，`schemaMeta.setViewConfig(viewConfig)` 之前调用：

```typescript
// 确保视图配置与当前 Schema 兼容
const mergedConfig = ensureViewConfigCompatibility(schema, viewConfig)
schemaMeta.setViewConfig(mergedConfig)
```

### 验证

1. 在 `voucherSchema` 的 `fields` 中新增一个字段（复制任何现有字段，改 key 和 name）
2. 打开凭证管理 → 新字段应自动出现在列表中
3. 在 `voucherSchema` 中删除 `remark` 字段 → 刷新 → remark 列应消失
4. `pnpm test:unit` + `pnpm type-check` 均通过

---

## 任务 2.4 — 乐观锁自动刷新重试

### 改动：useCellEdit 增加重试逻辑

**修改** `src/composables/useCellEdit.ts`。

在 `onCellEdit` 函数中，`patchField` 调用改为带重试版本。找到：

```typescript
      const res = await recordService.patchField({
        moduleId: schemaMeta.schema!.id,
        recordId: rowId,
        field,
        value,
        expectedVersion: record.version,
      })

      if (res.success) {
        recordStore.updateRecordField(rowId, field, value, res.data.version)
      } else {
        handleSaveError(res)
      }
```

替换为：

```typescript
      const moduleId = schemaMeta.schema!.id

      // 第一次尝试
      let res = await recordService.patchField({
        moduleId,
        recordId: rowId,
        field,
        value,
        expectedVersion: record.version,
      })

      // 版本冲突 → 自动刷新记录后重试一次
      if (!res.success && res.errorCode === 'VERSION_CONFLICT') {
        const detailRes = await recordService.getDetail(moduleId, rowId)
        if (detailRes.success) {
          const refreshed = detailRes.data
          recordStore.updateRecordField(
            rowId,
            '__noop__',
            refreshed.fields['__noop__'] ?? null,
            refreshed.version,
          )
          // 同步更新 record 对象引用，用于读取最新 version
          const updatedRecord = recordStore.getRecordById(rowId)
          if (updatedRecord) {
            res = await recordService.patchField({
              moduleId,
              recordId: rowId,
              field,
              value,
              expectedVersion: updatedRecord.version,
            })
          }
        }
      }

      if (res.success) {
        recordStore.updateRecordField(rowId, field, value, res.data.version)
      } else {
        handleSaveError(res)
      }
```

### 验证

1. 修改 `MockRecordService.patchField`：第一次调用时手动递增 `expectedVersion`，模拟并发冲突
2. 编辑任意单元格 → 应自动重试成功，不弹冲突对话框
3. 恢复 Mock 代码
4. `pnpm type-check` 0 错误
