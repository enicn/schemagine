# Introduction

Schemagine is a schema-driven data management engine for Vue 3 admin interfaces. Based on Vue 3 + Pinia + Element Plus + vxe-table, it renders **list, card and create views from a single `ModuleSchema`** — you stop writing per-module CRUD code for every table in your product.

## The idea

Most admin screens are the same machinery wrapped around different fields: a filterable table, inline editing, a create form, saved views, permissions, import/export. Schemagine turns that machinery into an engine configured by a schema:

- `fields` — 24 built-in field types (text, number, currency, date, select, status, FK relations, media images, …)
- `listEditMode`, `operations`, `searchFields`, `cardView`, `treeConfig` — view behavior
- `permissions` — view/create/edit/delete/export/configure gates
- declarative `rules` (via the dependency-free `schemagine/rules` subpackage) — compute chains, validation, row actions and aggregates

## Six service contracts

The engine **never touches your business API**. All reads and writes flow through six interfaces you implement and inject at startup:

| Interface | Inject with | Responsibility |
| --- | --- | --- |
| `IRecordService` | `setRecordService()` | Record CRUD + field value candidates (+ optional realtime subscription) |
| `ISchemaService` | `setSchemaService()` | Schema / permission loading |
| `ICandidateService` | `setCandidateService()` | FK dropdown candidates |
| `IUserViewConfigService` | `setUserViewConfigService()` | Per-user view config (columns, filters, pageSize) |
| `IRelationService` | `setRelationService()` | One-to-many / many-to-many / back references |
| `IMediaService` | `setMediaService()` | Media library for `mediaImage` fields (optional) |

This keeps the relationship **bidirectionally zero-intrusion**: business logic stays in the host app, and the engine stays free of business modules, endpoints or styling assumptions. Decoupling rules are enforced by a CI guard (`scripts/check-decoupling.mjs`).

## What you get

- Virtual-scrolled data grid with inline editing, column settings and header value filters
- Card view with configurable layout, plus mobile layouts (auto at < 768px)
- Create view with per-field-type editors and shared validation
- Saved views, filter presets, pagination preferences — persisted through `IUserViewConfigService`
- CSV/Excel import and export with formula-injection protection
- Undo/redo on batch and inline edits
- i18n hooks, style tokens (`--sg-*`) that follow your Element Plus theme
- Mock mode (`initMockServices()`) with 10 sample modules for instant development

## Where to go next

- [Installation](./installation) — peer dependencies and the required Vite dedupe config
- [Quick Start](./quick-start) — a working module in four steps
- [Services](./services) — the six contracts in detail
