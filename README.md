# Schemagine

**Schema-driven dynamic form & data management engine for Vue 3.** · v0.1.0 · [MIT](./LICENSE)

English | [简体中文](./README.zh-CN.md)

Define a module once as a JSON `ModuleSchema` — fields, permissions, formulas, relations — and Schemagine renders the full set of **List / Card / Create** views on top of it: sortable and filterable tables, inline editing with optimistic locking, formula fields, cascading permissions, schema migrations, and a pluggable Service layer for your own backend.

Built with **Vue 3.5 + TypeScript + Pinia + Element Plus + vxe-table**, packaged as an ESM + CJS library with full type declarations.

---

## ✨ Features

| Area | Highlights |
|------|-----------|
| **Schema-driven views** | One `ModuleSchema` drives all three views: list (table), card browser, and create (batch list-style or single-card entry). No per-module CRUD code. |
| **Powerful tables** | [vxe-table](https://vxetable.cn) with virtual scrolling, fixed columns, column settings, per-column header sort + content filter (10 operators, candidate values with occurrence counts). |
| **Editing** | Two list edit modes (`inline-dblclick` / `select-then-edit`), 24 field types, formula fields computed by [mathjs](https://mathjs.org), aggregation (sum / average / count / max / min). |
| **Data safety** | Optimistic locking on every write (`version` + auto-retry), row/batch delete with confirmations (engine renders, your service executes), race protection and error boundaries per instance. |
| **Permissions** | Module-level and field-level permissions, role-based overrides, `visibleWhen` / `editableWhen` conditional field expressions with a `globalContext` prop. |
| **Schema evolution** | Versioned migrations (`fromVersion → toVersion`), field rename mapping via `previousKeys`, automatic view-config and filter-preset migration. |
| **Backend-agnostic** | All data access goes through 6 injectable Service interfaces (records, schema, candidates, user view config, relations, media). Ships with a localStorage-backed Mock for instant demos. |
| **Visual Schema Editor** | Built-in editor page: field CRUD, formula builder, permission config, dependency graph, JSON import/export, live preview. |
| **Productivity** | CSV export honoring current filters/sort/visible columns, time-range presets, quick-create for FK fields, bottom tabs, per-user view config (column widths, layout). |
| **Themeable** | All styles based on `--sg-*` CSS tokens; follows your Element Plus theme (including `html.dark`) out of the box, overridable per token. |
| **Multi-instance safe** | Isolated state per `<SchemaEngine>` instance via `create*State()` factories injected with Vue `provide/inject` — embed several modules on one page. |

## 🏗 Architecture

```
SchemaEngine (entry)              ← loads schema, permissions, user config; orchestrates flow
  └─ SchemaContextProvider        ← provides context (schemaMeta / recordState / uiState)
       └─ ViewContainer           ← switches sub-views by viewMode
            ├─ ListView           ← table view
            │    ├─ header sort/filter popovers (per column)
            │    ├─ ListActionBar ← list-level actions
            │    ├─ SchemaTable   ← vxe-table wrapper
            │    └─ BottomTabs + SchemaPagination
            ├─ CardView           ← card browser (prev/next navigation)
            │    └─ SchemaCard    ← 16-column grid layout
            └─ CreateView / CardCreateView  ← batch / single-record entry
  └─ GlobalDialogHost             ← quick create, column settings, formula detail, conflicts…

Data flow (strictly one-way): UI → Composables/State → Service → your backend
```

## 📦 Installation

```sh
pnpm add schemagine
```

**Peer dependencies** (must be installed in the host project):

| Package | Version | Purpose |
|---------|---------|---------|
| `vue` | ^3.5 | Framework |
| `pinia` | ^3.0 | State management |
| `element-plus` | ^2.13 | UI components |
| `vue-router` | ^5.0 | Routing |
| `vxe-table` | ^4.18 | Virtual-scroll table |
| `vxe-pc-ui` | ^4.13 | vxe-table UI companion |
| `xe-utils` | ^4.0 | vxe-table utilities |
| `mathjs` | ^15 | Formula engine |

```sh
pnpm add vue pinia element-plus vue-router vxe-table vxe-pc-ui xe-utils mathjs
```

Register plugins in your app entry:

```ts
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import VxePcUI from 'vxe-pc-ui'
import VxeTable from 'vxe-table'

app.use(createPinia())
app.use(ElementPlus)
app.use(VxePcUI)
app.use(VxeTable)
```

Import styles (Element Plus / vxe-table plus the engine stylesheet, which bundles the `--sg-*` token baseline):

```ts
import 'element-plus/dist/index.css'
import 'vxe-pc-ui/lib/style.css'
import 'vxe-table/lib/style.css'
import 'schemagine/dist/schemagine.css'
```

> ⚠️ **Required Vite `resolve.dedupe`.** Schemagine is built in library mode with `vue` / `pinia` / `vue-router` externalized. Without deduping, two Pinia copies can produce the `Cannot read properties of undefined (reading '_s')` crash:
>
> ```ts
> // vite.config.ts
> export default defineConfig({
>   resolve: { dedupe: ['pinia', 'vue', 'vue-router'] },
> })
> ```

## 🚀 Quick start

### Option A — Mock mode (no backend needed)

```ts
// main.ts
import { initMockServices } from 'schemagine'

initMockServices() // localStorage-backed demo modules, persists across reloads
```

```vue
<script setup lang="ts">
import { SchemaEngine } from 'schemagine'
</script>

<template>
  <SchemaEngine module-id="module-voucher" />
</template>
```

Bundled demo modules: `module-voucher` (full-featured voucher management), `module-ap` (FK relations), `module-invoice`, `module-sales-order`, `module-receivable`, `module-user`, `module-workshop`, plus edge-case modules (`module-empty`, `module-no-perm`). Reset data with `resetAllStorage()`. You can also mock only some services and override the rest with real implementations.

### Option B — Your own backend (Service Injection)

The engine ships **no business API**. Implement the interfaces and inject them before mounting:

```ts
import { setRecordService, setSchemaService, setCandidateService,
         setUserViewConfigService, setRelationService, setMediaService } from 'schemagine'

setRecordService(new MyRecordService())          // list / getDetail / patchField / create / batchCreate / listFieldValueCandidates
setSchemaService(new MySchemaService())          // loadModuleSchema / loadModulePermissions / validateSchema / saveModuleSchema / listModuleIds
setCandidateService(new MyCandidateService())    // FK dropdown candidates
setUserViewConfigService(new MyViewConfigService()) // per-user column widths, layout…
setRelationService(new MyRelationService())      // one-to-many / many-to-many relations
setMediaService(new MyMediaService())            // optional: media library for image fields
```

Every method returns the uniform envelope:

```ts
interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  errorCode?: string
  details?: unknown[]
}
```

If a service is not injected, the engine falls back to a stub that returns `SERVICE_NOT_INITIALIZED` errors instead of crashing.

Then render a module:

```vue
<script setup lang="ts">
import { SchemaEngine } from 'schemagine'

function onDataChanged(payload: { moduleId: string }) {
  // refresh badges, notifications, etc.
}
</script>

<template>
  <SchemaEngine
    module-id="my-module"
    :readonly="false"
    :global-context="{ currentUser, systemSettings }"
    @module-loaded="onLoaded"
    @data-changed="onDataChanged"
  />
</template>
```

## 🧩 `<SchemaEngine>` API

```ts
// Props
moduleId: string                       // required — schema/data module to load
initialViewMode?: 'list' | 'card' | 'create'
embedded?: boolean                     // strip outer margins/background for embedding
readonly?: boolean                     // global read-only mode
globalContext?: Record<string, unknown> // feeds visibleWhen / editableWhen expressions

// Emits
module-loaded      { moduleId }
view-mode-change   { mode }
data-changed       { moduleId }
error              { moduleId, code, message }
request-open-dialog { dialogType, payload }
action-trigger     { action: ListAction, context? }   // list-level actions, incl. batch delete (type: 'delete')
row-action         { rowId, field, actionId }         // row-level actions, incl. confirmed delete

// Exposed via ref
refresh(): void                    // reload the module
setViewMode(mode): void            // switch view
getCurrentRecord(): RecordEntity | undefined
```

Deletion is a **standard data operation**: the engine renders the action column and batch toolbar plus all confirmation dialogs (`schema.operations.delete` + `permissions.delete` decide availability), while the actual deletion is executed by your host through the `row-action` / `action-trigger` events.

## 📐 Schema in one glance

```ts
interface ModuleSchema {
  id: string
  name: string
  version: string                       // semver, drives migrations
  moduleType: 'list' | 'card' | 'both'
  fields: FieldSchema[]
  permissions: ModulePermissions        // view / create / edit / delete / export / configure
  defaultViewMode: 'list' | 'card' | 'create'
  createMode?: 'list' | 'card'
  listEditMode?: 'inline-dblclick' | 'select-then-edit'
  operations?: { delete?: DeleteOperationConfig }  // standard data operations
  formulaConfig?: FormulaConfig
  listActions?: ListAction[]
  migrations?: SchemaMigration[]
  status: 'active' | 'disabled' | 'error'
}

interface FieldSchema {
  id: string; name: string; key: string; label: string
  type: FieldType
  required: boolean; readonly: boolean; visible: boolean; sortable: boolean; filterable: boolean
  // layout: order / width / fixed …
  // behavior: defaultValue, validationRules, permission, visibleWhen / editableWhen
  // composition: formula, dynamicMax, options, targetModule + displayField (FK),
  //              relationConfig / reverseRefConfig, aggregation, rowAction, prefixStr / suffixStr
  // evolution: previousKeys (rename mapping)
}

type FieldType =
  | 'text' | 'number' | 'date' | 'datetime' | 'boolean'
  | 'select' | 'multi-select' | 'status' | 'percent' | 'currency' | 'money'
  | 'phone' | 'email' | 'url'
  | 'fk' | 'one-to-many' | 'many-to-many' | 'reverse-ref'
  | 'formula' | 'image' | 'mediaImage' | 'attachment' | 'json' | 'action'
```

Filtering uses a normalized `FilterClause[]` protocol with 10 operators: `eq` · `neq` · `like` · `notLike` · `in` · `notIn` · `between` · `notBetween` · `isNull` · `isNotNull`.

## 🔧 Composables

| Composable | Purpose |
|-----------|---------|
| `useSchema(meta?, ui?)` | Schema loading, view-mode switching |
| `usePermission(meta?)` | Permission checks (module, field, records) |
| `useCellEdit(records?, meta?, ui?)` | Cell editing with optimistic-lock retry |
| `useFormula(records?, meta?)` | Formula evaluation (mathjs) |
| `useAggregation()` | sum / average / count / max / min |
| `useDraftLifecycle()` | Batch-create draft lifecycle |
| `useDynamicMax()` | Dynamic maximum validation |
| `compareVersions` / `runSchemaMigrations` | Semver compare and migration runner |
| `useSchemaMeta()` / `useRecords()` / `useUi()` | Consume provided instance state in custom components |
| `createSchemaMetaState()` / `createRecordState()` / `createUiState()` | Factories for standalone multi-instance state |

Utilities: `formatMoney`, `getOperatorLabel` / `OPERATOR_LABEL_MAP`, `resolveDataOperations` / `applyBuiltinOperations`, `resolveEnumTagStyle`, `resolveMediaUrl`, and more — all exported from the package root with types.

## 🎨 Theming

All component styles are tokenized as `--sg-*` CSS variables (defined in the bundled `schemagine.css`). Three stacking options:

```css
/* 1) Zero config — follows the Element Plus theme, including html.dark */

/* 2) Override tokens at any ancestor — partial overrides welcome */
:root {
  --sg-color-primary: #7c3aed;  /* brand color; light shades & focus glow follow automatically */
  --sg-radius-md: 6px;
  --sg-font-size-base: 13px;
}

/* 3) Override Element Plus --el-* variables — engine base colors read them with fallbacks */
```

Covered token surfaces: colors (brand/functional/text/border/fill/background), 8 font-size steps, 2px-grid spacing, control heights, 7 radius steps, 4 shadow levels + focus glow, z-index scale, and transition durations. The full baseline is documented in [docs/15-样式Token基线.md](docs/15-样式Token基线.md) (Chinese).

## 🖥 Demo app (this repository)

```sh
pnpm install
pnpm dev        # starts Vite, opens the voucher demo module (Mock mode)
```

| Route | Module | Notes |
|-------|--------|-------|
| `/voucher` | module-voucher | Full-featured demo (formula fields, FK) |
| `/ap` | module-ap | FK relation demo |
| `/module/:moduleId` | any mock module | Generic module route |
| `/editor` | — | Visual Schema Editor |

## 🛠 Development

```sh
pnpm install
pnpm dev              # dev server
pnpm type-check       # vue-tsc type check
pnpm test:unit        # Vitest unit tests
pnpm test:e2e         # Playwright E2E (run after a build)
pnpm test:e2e:p0      # P0 core-path suite only (also :p1 / :p2 / :all; PowerShell script)
pnpm lint             # ESLint + oxlint
pnpm format           # oxfmt
pnpm build            # type-check + app build
pnpm build:lib        # library build → dist/schemagine.{mjs,cjs} + schemagine.css + *.d.ts
```

Requirements: Node `^20.19.0 || >=22.12.0`, pnpm.

Publishing (`pnpm publish`, auto-builds via `prepublishOnly`) ships only `dist/` in ESM + CJS + CSS + type declarations. See the publishing section of [引用指南.md](引用指南.md) for CI examples.

## 📚 Documentation

| Document | Content |
|----------|---------|
| [引用指南.md](引用指南.md) | **Integration guide** (Chinese): install, service contracts, full API & type reference, npm publishing, FAQ |
| [说明文档.md](说明文档.md) | Project overview & development notes (Chinese) |
| [docs/01-项目概述.md](docs/01-项目概述.md) | Overview, directory layout, architecture layers |
| [docs/02-组件文档.md](docs/02-组件文档.md) | All components (table / card / field / filter) |
| [docs/03-引擎核心.md](docs/03-引擎核心.md) | Engine entry, view containers, dialog host |
| [docs/04-状态管理.md](docs/04-状态管理.md) | State design (instance state & stores) |
| [docs/05-组合式函数.md](docs/05-组合式函数.md) | Composables reference |
| [docs/06-服务层.md](docs/06-服务层.md) | Service interfaces + Mock adapter |
| [docs/07-类型系统.md](docs/07-类型系统.md) | TypeScript type system |
| [docs/08-生命周期与钩子.md](docs/08-生命周期与钩子.md) | Lifecycle, hooks, data-flow diagrams |
| [docs/09-Schema编辑器.md](docs/09-Schema编辑器.md) | Visual Schema Editor |
| [docs/10-路由与模块.md](docs/10-路由与模块.md) | Routes & demo modules |
| [docs/15-样式Token基线.md](docs/15-样式Token基线.md) | Style-token baseline (all component styles use `var(--sg-*)`) |
| [docs/17-集成与使用指南.md](docs/17-集成与使用指南.md) | Integration & usage guide |
| [docs/archive/](docs/archive/) | Historical assessment / roadmap docs (archived) |

> Most in-repo documentation is written in Chinese; the API samples are language-neutral TypeScript.

## ❓ FAQ

**Does the engine conflict with my app's Pinia state?**
No. Each `<SchemaEngine>` creates isolated instance state via `create*State()` factories and dynamically registered stores. Multiple instances coexist safely (plus the required Vite `dedupe` above).

**How does it scale with large datasets?**
Tables are vxe-table-based with virtual scrolling; lists are server-paginated; CSV export pulls in pages and is capped (5,000 rows) for safety.

**What happens when a Schema changes after records exist?**
Declare `migrations[]` (`fromVersion → toVersion`) and/or `previousKeys` for renames — the engine migrates records, view configs and filter presets on load.

**Can I replace the UI layer?**
Yes — consume `useSchemaMeta()` / `useRecords()` and compose your own views from the exported building blocks (`SchemaTable`, `FieldEditorFactory`, `ValueRenderer`, …).

---

## 📄 License

[MIT](./LICENSE)
