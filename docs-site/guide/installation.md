# Installation

## Install the package

```sh
pnpm add schemagine
```

## Peer dependencies

Install the peer dependencies your host project needs:

| Package | Version | Purpose |
| --- | --- | --- |
| `vue` | ^3.5 | Framework |
| `pinia` | ^3.0 | State management (candidate/formula caches) |
| `element-plus` | ^2.13 | UI components |
| `vue-router` | ^5.0 | Routing (visual SchemaEditor) |
| `vxe-table` | ^4.18 | Virtual-scrolling table |
| `vxe-pc-ui` | ^4.13 | vxe-table companion |
| `xe-utils` | ^4.0 | vxe-table utilities |
| `xlsx` | >=0.18.5 | Optional — spreadsheet import/export. Skip it if you don't need Excel; see the security note below. |

```sh
pnpm add vue pinia element-plus vue-router vxe-table vxe-pc-ui xe-utils xlsx
```

The formula engine (`mathjs`) is a direct dependency of schemagine and is installed with the package — no extra step.

::: warning xlsx advisory
The npm-distributed `xlsx@0.18.5` has known CVEs (ReDoS CVE-2023-30533, prototype pollution CVE-2024-22363). Patched builds are only published on the official SheetJS CDN. Schemagine uses xlsx only to parse/generate cell values and never executes workbook formulas; still, prefer importing only trusted files or pinning the official CDN build via `pnpm.overrides`.
:::

## Styles

Import Element Plus, vxe-table and the engine stylesheet at your entry point (e.g. `main.ts`):

```ts
import 'element-plus/dist/index.css'
import 'vxe-pc-ui/lib/style.css'
import 'vxe-table/lib/style.css'

// Engine styles (includes the --sg-* token baseline)
import 'schemagine/dist/schemagine.css'
```

### Theming

All engine styles are driven by `--sg-*` CSS custom properties, which by default follow your Element Plus theme (including dark mode via `html.dark`). Override tokens on any ancestor to brand the engine:

```css
:root {
  --sg-color-primary: #7c3aed;
  --sg-radius-md: 6px;
  --sg-font-size-base: 13px;
}
```

## Register plugins

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import VxePcUI from 'vxe-pc-ui'
import VxeTable from 'vxe-table'

const app = createApp(App)
app.use(createPinia())
app.use(ElementPlus)
app.use(VxePcUI)
app.use(VxeTable)
app.mount('#app')
```

## ⚠️ Required: Vite dedupe config

Schemagine is built in library mode with `pinia`, `vue` and `vue-router` marked as external. If the engine and your app resolve **two copies** of these packages (common in workspaces), Pinia's `Symbol('pinia')` injection context splits and you get crashes like `Cannot read properties of undefined (reading '_s')`.

Configure `resolve.dedupe` in your `vite.config.ts` — this is **required**, not optional:

```ts
export default defineConfig({
  resolve: {
    dedupe: ['pinia', 'vue', 'vue-router'],
  },
  // ...rest of your config
})
```

## Next step

Continue to [Quick Start](./quick-start) to wire your first module in four steps.
