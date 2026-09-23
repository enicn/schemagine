# Quick Start

A working module in four steps: implement the record service, inject your services, drop in `SchemaEngine`, run.

## Step 1 — implement the service layer

The engine ships no business API. Implement `IRecordService` against your backend:

```ts
// services/MyRecordService.ts
import type {
  IRecordService, ApiResponse, RecordEntity, RecordListResponse,
  ListQueryParams, PatchFieldParams, CreateRecordParams,
  FieldValueCandidateQueryParams, FieldValueCandidateListResponse,
} from 'schemagine'

export class MyRecordService implements IRecordService {
  async list(params: ListQueryParams): Promise<ApiResponse<RecordListResponse>> {
    const res = await fetch(`/api/modules/${params.moduleId}/records`, {
      method: 'POST',
      body: JSON.stringify(params),
    })
    return res.json()
  }

  /** Value candidates for header filters — required method. */
  async listFieldValueCandidates(
    params: FieldValueCandidateQueryParams,
  ): Promise<ApiResponse<FieldValueCandidateListResponse>> {
    const res = await fetch(`/api/modules/${params.moduleId}/fields/${params.field}/candidates`, {
      method: 'POST',
      body: JSON.stringify(params),
    })
    return res.json()
  }

  async getDetail(moduleId: string, recordId: string): Promise<ApiResponse<RecordEntity>> {
    const res = await fetch(`/api/modules/${moduleId}/records/${recordId}`)
    return res.json()
  }

  async patchField(params: PatchFieldParams): Promise<ApiResponse<RecordEntity>> {
    const res = await fetch(`/api/modules/${params.moduleId}/records/${params.recordId}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    })
    return res.json()
  }

  async create(params: CreateRecordParams): Promise<ApiResponse<RecordEntity>> {
    const res = await fetch(`/api/modules/${params.moduleId}/records`, {
      method: 'POST',
      body: JSON.stringify(params),
    })
    return res.json()
  }

  async batchCreate(params: CreateRecordParams[]): Promise<ApiResponse<RecordEntity[]>> {
    const res = await fetch(`/api/modules/${params[0].moduleId}/records/batch`, {
      method: 'POST',
      body: JSON.stringify(params),
    })
    return res.json()
  }

  // Optional: realtime subscription. Not implemented → realtime features off,
  // everything else unaffected. See the Services page for the contract.
}
```

## Step 2 — inject services at the app entry

```ts
// main.ts
import {
  initMockServices,            // or your own services, see below
  setRecordService, setSchemaService, setCandidateService,
  setUserViewConfigService, setRelationService,
} from 'schemagine'

// Option A: backend not ready yet — use the built-in mock adapter
initMockServices()

// Option B: your implementations
// setRecordService(new MyRecordService())
// setSchemaService(new MySchemaService())
// setCandidateService(new MyCandidateService())
// setUserViewConfigService(new MyUserViewConfigService())
// setRelationService(new MyRelationService())
```

`initMockServices()` provides 10 sample modules (voucher, invoice, sales order, tree data, permission-denied, empty states …) — handy for development and for seeing every feature without a backend.

## Step 3 — render the engine

```vue
<script setup lang="ts">
import { SchemaEngine } from 'schemagine'

const moduleId = 'my-module-id'

function handleModuleLoaded(payload: { moduleId: string }) {
  console.log('module loaded:', payload.moduleId)
}

function handleDataChanged(payload: { moduleId: string }) {
  console.log('data changed:', payload.moduleId)
}
</script>

<template>
  <SchemaEngine
    :module-id="moduleId"
    @module-loaded="handleModuleLoaded"
    @data-changed="handleDataChanged"
  />
</template>
```

The engine fills its container (flex column, `height: 100%`) and switches to a mobile layout below 768px on its own — no wrapper classes required.

## Step 4 — run

```sh
pnpm dev
```

You should see a full data module: toolbar, filterable table, inline editing, create form, card view.

## Checklist when something breaks

- Blank page with Pinia errors → add the [required `resolve.dedupe`](./installation#required-vite-dedupe-config) to `vite.config.ts`.
- Styles look broken → check the three stylesheet imports in [Installation](./installation#styles).
- Table says the service is not initialized → services must be registered **before** the engine mounts; unregistered services fall back to error responses (`SERVICE_NOT_INITIALIZED`) instead of crashing.

## Where to go next

- [Services](./services) — every method of the six contracts
- Declarative rules (`schemagine/rules`) — compute chains, validations and row actions as schema data
- The full host guide (Chinese) lives in [`docs/17-集成与使用指南.md`](https://github.com/enicn/schemagine/blob/main/docs/17-集成与使用指南.md) on GitHub
