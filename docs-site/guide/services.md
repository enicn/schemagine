# Services

Schemagine integrates through **dependency injection**: you implement six interfaces, register them at startup, and the engine resolves them internally. All responses share one envelope:

```ts
interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  errorCode?: string
  details?: unknown[]
}
```

If a service is not registered, the engine falls back to implementations that return `SERVICE_NOT_INITIALIZED` error responses and log to the console — it never crashes, but the feature is unavailable.

## The six contracts

| Interface | Inject with | Responsibility |
| --- | --- | --- |
| `IRecordService` | `setRecordService()` | Record CRUD + field value candidates (+ optional realtime subscription) |
| `ISchemaService` | `setSchemaService()` | Schema / permission loading |
| `ICandidateService` | `setCandidateService()` | FK dropdown candidates by target module |
| `IUserViewConfigService` | `setUserViewConfigService()` | Per-user view config persistence |
| `IRelationService` | `setRelationService()` | One-to-many / many-to-many / back references |
| `IMediaService` | `setMediaService()` | Media library for `mediaImage` fields (optional) |

## IRecordService

```ts
interface IRecordService {
  list(params: ListQueryParams): Promise<ApiResponse<RecordListResponse>>
  /** Value candidates for header filter popovers — required method. */
  listFieldValueCandidates(
    params: FieldValueCandidateQueryParams,
  ): Promise<ApiResponse<FieldValueCandidateListResponse>>
  getDetail(moduleId: string, recordId: string): Promise<ApiResponse<RecordEntity>>
  patchField(params: PatchFieldParams): Promise<ApiResponse<RecordEntity>>
  create(params: CreateRecordParams): Promise<ApiResponse<RecordEntity>>
  batchCreate(params: CreateRecordParams[]): Promise<ApiResponse<RecordEntity[]>>
  /** Optional realtime subscription; when absent the engine simply doesn't subscribe. */
  subscribeRecords?(
    moduleId: string,
    cb: (change: RecordsChangePayload) => void,
  ): () => void
}
```

```ts
interface ListQueryParams {
  moduleId: string
  /** Top level = implicit AND; OR / nesting via FilterGroup. */
  filters?: FilterCondition[]
  /** Cross-field keyword search (OR-contains over the module's searchFields). */
  keyword?: string
  sort?: SortParam
  page: number
  pageSize: number
  viewMode?: 'list' | 'card'
}

interface PatchFieldParams {
  moduleId: string
  recordId: string
  field: string
  value: unknown
  /** Optimistic-lock version; mismatch returns VERSION_CONFLICT. */
  expectedVersion: number
  force?: boolean
}
```

::: tip Two different "candidate" queries
`IRecordService.listFieldValueCandidates` queries the distribution of **existing values of a field in the current module** (header filter popovers). `ICandidateService.query` queries **selectable options of a target module** (FK dropdowns). Keep them separate on the backend.
:::

## ISchemaService

```ts
interface ISchemaService {
  loadModuleSchema(moduleId: string): Promise<ApiResponse<ModuleSchema>>
  loadModulePermissions(moduleId: string): Promise<ApiResponse<ModulePermissions>>
  validateSchema(moduleId: string): Promise<ApiResponse<boolean>>
  saveModuleSchema(schema: ModuleSchema): Promise<ApiResponse<void>>
  listModuleIds(): Promise<ApiResponse<string[]>>
}
```

## ICandidateService

```ts
interface ICandidateService {
  query(params: CandidateQueryParams): Promise<ApiResponse<CandidateListResponse>>
}

interface CandidateQueryParams {
  targetModule: string
  keyword?: string
  page: number
  pageSize: number
  filters?: Record<string, unknown>
}

interface CandidateListResponse {
  options: CandidateOption[]   // { value, label, disabled? }
  total: number
  hasMore: boolean
}
```

## IUserViewConfigService

Read/write persistence for per-user view state: column settings (visibility, width, fixed, order), default sort, page size, filter presets, view mode and card layout. Semantics are **whole-module read, engine-modified, whole-module save** — the host does no merging.

```ts
interface IUserViewConfigService {
  load(moduleId: string): Promise<ApiResponse<UserViewConfig>>
  save(config: UserViewConfig): Promise<ApiResponse<void>>
}
```

`UserViewConfig` carries `columns`, `defaultSort`, `pageSize`, `filterPresets`, `viewMode` and `cardLayout` (full shape in the host guide).

## IRelationService

Six methods covering the relation graph of a module: loading related records of a one-to-many field, creating/updating/removing relation entries and querying back-references. Signatures are in the host guide ([docs/17 §3.8](https://github.com/enicn/schemagine/blob/main/docs/17-集成与使用指南.md)).

## IMediaService

Optional. Three methods — list media, upload, and resolve media IDs to URLs. Without it, `mediaImage` fields render a placeholder and everything else keeps working. Media access modes (plain URL / OSS direct upload / API upload / library) are configured host-side via `setupMedia`.

## Deep documentation

This page is a fast tour. The complete contract reference — every method signature, error codes, the realtime subscription payload and merge semantics — lives in the host guide:

[`docs/17-集成与使用指南.md`](https://github.com/enicn/schemagine/blob/main/docs/17-集成与使用指南.md) (Chinese, kept in sync by a CI coverage guard that pins it to the source code).
