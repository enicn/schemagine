# schemagine minimal example (Vite + Vue 3)

A runnable single-module setup: one `ModuleSchema`, one array of seed rows, no backend.

## Run it

```sh
pnpm install
pnpm dev
```

You get a full data module — sortable/filterable table, inline editing, create form, card view — backed entirely by `createLocalRecordService` (in-memory).

## What to look at

| File | What it does |
| --- | --- |
| `src/schema.ts` | The `ModuleSchema`: 8 fields covering the common types (text / status / date / percent / currency / boolean / textarea). |
| `src/services.ts` | `createLocalRecordService` turns the seed array into a full `IRecordService`; a minimal in-memory `ISchemaService` serves the schema. |
| `src/main.ts` | Plugin registration + the required stylesheet imports (including `schemagine/dist/schemagine.css`). |
| `vite.config.ts` | The **required** `resolve.dedupe` for `vue` / `pinia` / `vue-router`. |

## Next steps

- Point the service at your API: implement `IRecordService`/`ISchemaService` yourself — contract tour at [enicn.github.io/schemagine/guide/services](https://enicn.github.io/schemagine/guide/services).
- Or prototype faster with the built-in mock: call `initMockServices()` instead of wiring services, and you get 10 sample modules with no schema of your own.
- Full host guide: [`docs/17-集成与使用指南.md`](../../docs/17-集成与使用指南.md) in the repository root.
