# Tutorial: from zero to production

A ~15 minute path: install → define a module → run on in-memory data → swap in your backend → production checklist. Each step works on its own; you can stop anywhere.

## 1. Install (2 min)

```sh
pnpm add schemagine
pnpm add vue pinia element-plus vue-router vxe-table vxe-pc-ui xe-utils
```

Import the stylesheets and register the plugins, and add the **required** Vite dedupe config — both covered step-by-step in [Installation](./installation).

## 2. Define a module (3 min)

A `ModuleSchema` is plain data — no classes, no code generation:

```ts
// schema.ts
import type { ModuleSchema } from 'schemagine'

export const taskSchema: ModuleSchema = {
  id: 'module-task',
  name: 'Tasks',
  version: '1.0.0',
  moduleType: 'both',
  fields: [
    { id: 'f1', name: 'Title', key: 'title', type: 'text', label: 'Title',
      required: true, readonly: false, order: 1, width: 220,
      visible: true, sortable: true, filterable: true },
    { id: 'f2', name: 'Status', key: 'status', type: 'status', label: 'Status',
      required: true, readonly: false, order: 2, width: 120,
      visible: true, sortable: true, filterable: true,
      statusMap: {
        todo: { label: 'To do', type: 'info' },
        doing: { label: 'In progress', type: 'warning' },
        done: { label: 'Done', type: 'success' },
      } },
    { id: 'f3', name: 'Due', key: 'dueDate', type: 'date', label: 'Due date',
      required: false, readonly: false, order: 3, width: 130,
      visible: true, sortable: true, filterable: true },
  ],
  permissions: { view: true, create: true, edit: true, delete: true, export: true, configure: true },
  defaultViewMode: 'list',
}
```

Render it:

```vue
<script setup lang="ts">
import { SchemaEngine } from 'schemagine'
import { taskSchema } from './schema'
</script>

<template>
  <SchemaEngine :module-id="taskSchema.id" />
</template>
```

At this point the table renders but has no data — that's the service layer's job.

## 3. Run on in-memory data (3 min)

`createLocalRecordService` turns an array into a complete `IRecordService` (pagination, sorting, combined filters, candidates, CRUD — same evaluation semantics as the mock):

```ts
// services.ts
import { createLocalRecordService, setRecordService, setSchemaService } from 'schemagine'
import { taskSchema } from './schema'

const rows = [
  { id: 'task-1', title: 'Design the schema', status: 'done', dueDate: '2026-09-01' },
  { id: 'task-2', title: 'Wire the services', status: 'doing', dueDate: '2026-09-30' },
]

const local = createLocalRecordService({ moduleId: taskSchema.id })
local.setRecords(rows)
setRecordService(local)

setSchemaService({
  async loadModuleSchema(moduleId: string) {
    return { success: true, data: moduleId === taskSchema.id ? taskSchema : ({} as typeof taskSchema) }
  },
  async loadModulePermissions() {
    return { success: true, data: taskSchema.permissions }
  },
  async validateSchema() { return { success: true, data: true } },
  async saveModuleSchema() { return { success: true, data: undefined as void } },
  async listModuleIds() { return { success: true, data: [taskSchema.id] } },
})
```

You now have a working module: filterable table, inline editing, create form, card view — zero backend. (A runnable copy of this step lives in [`examples/minimal-vite`](https://github.com/enicn/schemagine/tree/main/examples/minimal-vite).)

Or skip your own schema entirely for prototyping: `initMockServices()` boots 10 sample modules.

## 4. Swap in your backend (5 min)

Because the engine only knows the interface, switching from in-memory to HTTP is a drop-in replacement of the implementation — the component tree doesn't change:

```ts
export class HttpRecordService implements IRecordService {
  async list(params: ListQueryParams): Promise<ApiResponse<RecordListResponse>> {
    const res = await fetch(`/api/modules/${params.moduleId}/records`, {
      method: 'POST',
      body: JSON.stringify(params),
    })
    return res.json()
  }

  async patchField(params: PatchFieldParams): Promise<ApiResponse<RecordEntity>> {
    // Engine sends the record's current `version` — honor it for optimistic locking,
    // return VERSION_CONFLICT as errorCode on mismatch.
    const res = await fetch(`/api/modules/${params.moduleId}/records/${params.recordId}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    })
    return res.json()
  }

  // ... listFieldValueCandidates / getDetail / create / batchCreate
}
```

Two contract points worth keeping on your radar:

- **`listFieldValueCandidates` is required** — the header filter popovers consume it (value + occurrence counts).
- **Optimistic locking** — every write carries `expectedVersion`; return `errorCode: 'VERSION_CONFLICT'` and the engine handles the retry/conflict UX.

Wrap your endpoints in the `ApiResponse<T>` envelope (or adapt at the boundary) and register:

```ts
setRecordService(new HttpRecordService())
setSchemaService(new HttpSchemaService())  // serve ModuleSchema JSON from your API
```

## 5. Production checklist

- [ ] `resolve.dedupe: ['pinia', 'vue', 'vue-router']` in your Vite config (split-Pinia crashes otherwise)
- [ ] Stylesheet imports present (`element-plus`, `vxe-pc-ui`, `vxe-table`, `schemagine/dist/schemagine.css`)
- [ ] Theme: override `--sg-*` tokens (or nothing — it follows your Element Plus theme by default)
- [ ] Permissions: `loadModulePermissions` reflects your auth model; role overrides via the `currentRoles` prop
- [ ] Only trusted files for Excel import, or pin `xlsx` to the official SheetJS CDN build (see [Installation](./installation#peer-dependencies))
- [ ] Remove `initMockServices()` from production entry points

## Where to go

- [Services](./services) — the full six-contract surface
- [Quick Start](./quick-start) — the condensed four-step version of this tutorial
