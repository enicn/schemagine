# Schemagine

**Schema 驱动的 Vue 3 动态表单与数据管理引擎。** · [MIT 许可证](./LICENSE)

[![Docs](https://img.shields.io/badge/docs-online-7C3ACD)](https://enicn.github.io/schemagine/) [![Playground](https://img.shields.io/badge/live%20demo-playground-2F80ED)](https://enicn.github.io/schemagine/demo/playground)

[English](./README.md) | 简体中文

---

只需用一份 JSON `ModuleSchema` 定义字段、权限、公式与关联关系，Schemagine 即可渲染出完整的**列表 / 卡片 / 新增**三种视图：支持排序筛选的表格、乐观锁行内编辑、公式字段、级联权限、Schema 平滑迁移，以及可插拔的 Service 层对接你自己的后端。

基于 **Vue 3.5 + TypeScript + Pinia + Element Plus + vxe-table** 构建，以 ESM + CJS 双格式库发布，附带完整类型声明。

## ✨ 功能特性

| 领域 | 特性 |
|------|------|
| **Schema 驱动视图** | 一份 `ModuleSchema` 驱动全部三种视图：列表（表格）、卡片浏览、新增（批量列表式 / 单卡片录入），无需为每个模块编写 CRUD 代码。 |
| **强大的表格** | 基于 [vxe-table](https://vxetable.cn)：虚拟滚动、固定列、列设置、每列表头排序 + 内容筛选（10 种算子，候选值带出现次数）。 |
| **编辑能力** | 两种列表编辑模式（`inline-dblclick` / `select-then-edit`）、24 种字段类型、[mathjs](https://mathjs.org) 公式字段、聚合计算（求和 / 平均 / 计数 / 最大 / 最小）。 |
| **数据安全** | 所有写操作携带乐观锁（`version` + 自动重试）、行级 / 批量删除带二次确认（引擎负责渲染与确认，删除执行由宿主完成）、竞态保护与实例级 ErrorBoundary。 |
| **权限体系** | 模块级 + 字段级权限、角色覆盖、`visibleWhen` / `editableWhen` 条件字段表达式，配合 `globalContext` prop 使用。 |
| **Schema 演进** | 版本化迁移脚本（`fromVersion → toVersion`）、`previousKeys` 字段重命名映射、视图配置与筛选预设自动迁移。 |
| **后端无关** | 所有数据访问通过 6 个可注入的 Service 接口（记录 / Schema / 候选值 / 用户视图配置 / 关联关系 / 媒体），内置 localStorage Mock，开箱即可演示。 |
| **可视化 Schema 编辑器** | 内置编辑器页面：字段增删改、公式构建器、权限配置、依赖关系图、JSON 导入导出、实时预览。 |
| **效率功能** | CSV 导出（遵循当前筛选 / 排序 / 可见列）、时间范围预设、FK 字段快速新建、底部标签页、按用户持久化的视图配置（列宽、卡片布局）。 |
| **主题定制** | 全部样式基于 `--sg-*` CSS Token；零配置跟随 Element Plus 主题（含 `html.dark` 暗色模式），支持按 Token 覆盖；`appearance` prop 控制表格边框 / 值展示（标签 / 纯文本 / 经典单色）/ 卡片密度。 |
| **扩展注册表** | `registerFieldType` 自定义字段类型（渲染 / 表单 / 行内编辑三处接入）、`registerDialog` 自定义弹窗、vxe 插槽透传与 `getTableInstance()` 实例暴露。 |
| **i18n 与移动端** | 内置 zh-CN 语言包 + `registerLocale` 注入 + `locale` prop 切换；窄屏自动切移动卡片形态（搜索 / 触底加载 / 动作降级）。 |
| **媒体管理（可选导出）** | 图片字段的四种接入模式一应俱全：默认 URL 渲染零配置；`schemagine/media` 子路径按需引入 OSS 直传（S3 兼容 / 七牛，纯 JS 签名零 SDK）、宿主上传 API、媒体库组件集（管理页 `MediaLibrary` / 选择弹窗 `MediaPickerDialog` / 通用 HTTP 实现 `createHttpMediaService`），模式切换编辑面自动降级。 |
| **多实例安全** | 每个 `<SchemaEngine>` 实例通过 `create*State()` 工厂创建隔离状态并经 Vue `provide/inject` 注入，可在同一页面嵌入多个模块。 |

## 🏗 架构

```
SchemaEngine（入口）               ← 加载 Schema、权限、用户配置，编排全局流程
  └─ SchemaContextProvider        ← provide 上下文（schemaMeta / recordState / uiState）
       └─ ViewContainer           ← 根据 viewMode 切换子视图
            ├─ ListView           ← 列表视图
            │    ├─ 每列表头排序 / 筛选弹层
            │    ├─ ListActionBar ← 列表级操作按钮
            │    ├─ SchemaTable   ← vxe-table 封装
            │    └─ BottomTabs + SchemaPagination
            ├─ CardView           ← 卡片浏览（上/下条导航）
            │    └─ SchemaCard    ← 16 列 Grid 布局
            └─ CreateView / CardCreateView  ← 批量 / 单条录入
  └─ GlobalDialogHost             ← 快速新建、列设置、公式详情、版本冲突等弹窗宿主

数据流（严格单向）：UI → Composables/状态 → Service → 你的后端
```

## 📦 安装

```sh
pnpm add schemagine
```

**对等依赖**（需在宿主项目中安装）：`vue` ^3.5、`pinia` ^3.0、`element-plus` ^2.13、`vue-router` ^5.0、`vxe-table` ^4.18、`vxe-pc-ui` ^4.13、`xe-utils` ^4.0、`mathjs` ^15。

```sh
pnpm add vue pinia element-plus vue-router vxe-table vxe-pc-ui xe-utils mathjs
```

在应用入口注册插件：

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

引入样式（Element Plus / vxe-table 样式 + 引擎样式，引擎样式内含 `--sg-*` Token 基线）：

```ts
import 'element-plus/dist/index.css'
import 'vxe-pc-ui/lib/style.css'
import 'vxe-table/lib/style.css'
import 'schemagine/dist/schemagine.css'
```

> ⚠️ **必须配置 Vite `resolve.dedupe`。** Schemagine 以库模式构建，`vue` / `pinia` / `vue-router` 均为 external。不去重时可能出现两份 Pinia 实例，导致 `Cannot read properties of undefined (reading '_s')` 崩溃：
>
> ```ts
> // vite.config.ts
> export default defineConfig({
>   resolve: { dedupe: ['pinia', 'vue', 'vue-router'] },
> })
> ```

## 🚀 快速开始

### 方式 A — Mock 模式（无需后端）

```ts
// main.ts
import { initMockServices } from 'schemagine'

initMockServices() // 基于 localStorage 的示例模块，刷新后数据保留
```

```vue
<script setup lang="ts">
import { SchemaEngine } from 'schemagine'
</script>

<template>
  <SchemaEngine module-id="module-voucher" />
</template>
```

内置示例模块：`module-voucher`（凭证管理，完整功能演示）、`module-ap`（FK 关联）、`module-invoice`、`module-sales-order`、`module-receivable`、`module-user`、`module-workshop`，以及边界场景模块（`module-empty`、`module-no-perm`）。调用 `resetAllStorage()` 可重置数据。也支持只 Mock 部分 Service，其余覆盖为真实实现。

### 方式 B — 对接自己的后端（Service 注入）

引擎本身**不包含任何业务 API**。实现以下接口并在挂载前注入：

```ts
import { setRecordService, setSchemaService, setCandidateService,
         setUserViewConfigService, setRelationService, setMediaService } from 'schemagine'

setRecordService(new MyRecordService())          // list / getDetail / patchField / create / batchCreate / listFieldValueCandidates
setSchemaService(new MySchemaService())          // loadModuleSchema / loadModulePermissions / validateSchema / saveModuleSchema / listModuleIds
setCandidateService(new MyCandidateService())    // FK 下拉候选值
setUserViewConfigService(new MyViewConfigService()) // 按用户持久化的列宽、布局等
setRelationService(new MyRelationService())      // 一对多 / 多对多关联
setMediaService(new MyMediaService())            // 可选：图片字段的媒体库
```

所有方法返回统一响应结构：

```ts
interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  errorCode?: string
  details?: unknown[]
}
```

未注入 Service 时，引擎回退到返回 `SERVICE_NOT_INITIALIZED` 错误的 Stub 实现，**不会崩溃**。

然后渲染模块：

```vue
<script setup lang="ts">
import { SchemaEngine } from 'schemagine'

function onDataChanged(payload: { moduleId: string }) {
  // 刷新角标、通知等
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
moduleId: string                        // 必填 — 要加载的 Schema / 数据模块
initialViewMode?: 'list' | 'card' | 'create'
embedded?: boolean                      // 嵌入模式（移除外边距与背景）
readonly?: boolean                      // 全局只读
globalContext?: Record<string, unknown> // 供 visibleWhen / editableWhen 条件表达式使用

// 事件
module-loaded       { moduleId }
view-mode-change    { mode }
data-changed        { moduleId }
error               { moduleId, code, message }
request-open-dialog { dialogType, payload }
action-trigger      { action: ListAction, context? }  // 列表级操作，含批量删除（type: 'delete'）
row-action          { rowId, field, actionId }        // 行级操作，含已确认的删除

// 通过 ref 暴露
refresh(): void                     // 重新加载模块
setViewMode(mode): void             // 切换视图
getCurrentRecord(): RecordEntity | undefined
```

删除是**标准数据操作**：引擎负责渲染操作列、批量工具栏及全部二次确认弹窗（由 `schema.operations.delete` 与 `permissions.delete` 共同决定是否可用），实际的删除执行通过 `row-action` / `action-trigger` 事件交由宿主完成。

## 📐 Schema 一览

```ts
interface ModuleSchema {
  id: string
  name: string
  version: string                       // 语义化版本号，驱动迁移
  moduleType: 'list' | 'card' | 'both'
  fields: FieldSchema[]
  permissions: ModulePermissions        // view / create / edit / delete / export / configure
  defaultViewMode: 'list' | 'card' | 'create'
  createMode?: 'list' | 'card'
  listEditMode?: 'inline-dblclick' | 'select-then-edit'
  operations?: { delete?: DeleteOperationConfig }  // 标准数据操作
  formulaConfig?: FormulaConfig
  listActions?: ListAction[]
  migrations?: SchemaMigration[]
  status: 'active' | 'disabled' | 'error'
}

interface FieldSchema {
  id: string; name: string; key: string; label: string
  type: FieldType
  required: boolean; readonly: boolean; visible: boolean; sortable: boolean; filterable: boolean
  // 布局：order / width / fixed …
  // 行为：defaultValue、validationRules、permission、visibleWhen / editableWhen
  // 组合：formula、dynamicMax、options、targetModule + displayField（FK）、
  //       relationConfig / reverseRefConfig、aggregation、rowAction、prefixStr / suffixStr
  // 演进：previousKeys（重命名映射）
}

type FieldType =
  | 'text' | 'number' | 'date' | 'datetime' | 'boolean'
  | 'select' | 'multi-select' | 'status' | 'percent' | 'currency' | 'money'
  | 'phone' | 'email' | 'url'
  | 'fk' | 'one-to-many' | 'many-to-many' | 'reverse-ref'
  | 'formula' | 'image' | 'mediaImage' | 'attachment' | 'json' | 'action'
```

筛选采用标准化的 `FilterClause[]` 协议，支持 10 种算子：`eq` · `neq` · `like` · `notLike` · `in` · `notIn` · `between` · `notBetween` · `isNull` · `isNotNull`。

## 🔧 组合式函数

| Composable | 用途 |
|-----------|------|
| `useSchema(meta?, ui?)` | Schema 加载、视图模式切换 |
| `usePermission(meta?)` | 权限检查（模块 / 字段 / 记录） |
| `useCellEdit(records?, meta?, ui?)` | 单元格编辑、乐观锁重试 |
| `useFormula(records?, meta?)` | 公式计算（mathjs） |
| `useAggregation()` | 求和 / 平均 / 计数 / 最大 / 最小 |
| `useDraftLifecycle()` | 批量新增草稿生命周期 |
| `useDynamicMax()` | 动态最大值校验 |
| `compareVersions` / `runSchemaMigrations` | 语义化版本比较与迁移执行器 |
| `useSchemaMeta()` / `useRecords()` / `useUi()` | 在自定义组件中消费注入的实例状态 |
| `createSchemaMetaState()` / `createRecordState()` / `createUiState()` | 多实例独立状态工厂 |

工具函数：`formatMoney`、`getOperatorLabel` / `OPERATOR_LABEL_MAP`、`resolveDataOperations` / `applyBuiltinOperations`、`resolveEnumTagStyle`、`resolveMediaUrl` 等，均从包根导出并附带类型。

| Composable（规则） | 用途 |
|-----------|------|
| `useRules()` | 在 `<SchemaEngine>` 内消费规则状态（编译、compute/validate/动作规划） |

## 📜 声明式规则（`schemagine/rules`）

独立子路径导出的规则运行时：**框架无关、零依赖**——库只产出 Effect 描述符（"规划"），宿主负责执行（"解释"）。求值器（如 mathjs）、函数词典（内置仅 now/sum/count/min/max/abs/ceilTo/roundTo，业务函数一律由宿主经词典注册）、动作与 Flow 均以注入接入。

```ts
import { createRuntime, validateRules } from 'schemagine/rules'

const runtime = createRuntime({ evaluate, parse, functions, flows, actions })
const compiled = runtime.compileModule(schema)
runtime.evalCondition(['status', 'eq', 0], { record })     // 对象形 | 三段形 | 表达式串
runtime.runComputes(compiled, { record }, 'price')         // watch 触发 + 声明序级联 → SET/FORCE
runtime.runValidates(compiled, { record }, 'price', 5, 0)  // { ok, message?, force? }
runtime.planAction(actionRule, { record })                 // confirm → invoke/open/navigate → toast
await runtime.runFlow(flow, { record }, executor)          // 步骤四要素 action/params/when/as
```

八类规则位 condition/compute/map/lookup/validate/action/style/aggregate，挂载于 `ModuleSchema.rules`、`FieldSchema.rules` 与 `RowActionConfig.action`。schema 交 `<SchemaEngine>` 渲染时引擎原生接线：行内编辑触发 compute 链与 validate 门禁，action 点击产出 Effect 交 `rulesExecutor` prop，`labelWhen` 按行切换按钮文案，`aggregate` 规则扩展统计条；Schema Editor 内置规则编辑面板，`validateSchema` 对非法规则给出 error 诊断。同构校验器 `validateRules / validateFlow / validateDictionary` 可在服务端复用。

## 🎨 主题定制

全部组件样式 Token 化为 `--sg-*` CSS 变量（随库打包在 `schemagine.css` 中）。三种可叠加的定制方式：

```css
/* 1) 零配置 — 跟随 Element Plus 主题，含 html.dark 暗色模式 */

/* 2) 在任意祖先覆盖 Token — 支持只改部分 */
:root {
  --sg-color-primary: #7c3aed;  /* 品牌色；浅色阶与 focus 光晕自动跟随 */
  --sg-radius-md: 6px;
  --sg-font-size-base: 13px;
}

/* 3) 覆盖 Element Plus 的 --el-* 变量 — 引擎基色经 var(--el-*, 回退) 传导，同样生效 */
```

已 Token 化的维度：颜色（品牌 / 功能 / 文字 / 边框 / 填充 / 背景）、8 档字号、2px 网格间距、控件高度、7 档圆角、4 档阴影 + focus 光晕、z-index 层级、过渡时长。完整基线见 [docs/15-样式Token基线.md](docs/15-样式Token基线.md)。

## 🖥 演示应用（本仓库）

```sh
pnpm install
pnpm dev        # 启动 Vite，默认打开凭证管理演示模块（Mock 模式）
```

| 路由 | 模块 | 说明 |
|------|------|------|
| `/voucher` | module-voucher | 完整功能演示（公式字段、FK 关联） |
| `/ap` | module-ap | FK 关联演示 |
| `/module/:moduleId` | 任意 Mock 模块 | 通用模块路由 |
| `/editor` | — | Schema 可视化编辑器 |

## 🛠 开发

```sh
pnpm install
pnpm dev              # 开发服务器
pnpm type-check       # vue-tsc 类型检查
pnpm test:unit        # Vitest 单元测试
pnpm test:e2e         # Playwright E2E（需先构建）
pnpm test:e2e:p0      # 仅 P0 核心链路用例（另有 :p1 / :p2 / :all；PowerShell 脚本）
pnpm lint             # ESLint + oxlint
pnpm format           # oxfmt
pnpm build            # 类型检查 + 应用构建
pnpm build:lib        # 库构建 → dist/schemagine.{mjs,cjs} + schemagine.css + *.d.ts
```

环境要求：Node `^20.19.0 || >=22.12.0`，pnpm。

发布（`pnpm publish`，`prepublishOnly` 自动构建）仅包含 `dist/`：ESM + CJS + CSS + 类型声明。CI 发布示例见 [引用指南.md](引用指南.md) 发布章节。

## 📚 文档

| 文档 | 内容 |
|------|------|
| [英文文档站](https://enicn.github.io/schemagine/) | **英文入口**：介绍、安装、快速开始、15 分钟教程、六 Service 契约 |
| [docs/17-集成与使用指南.md](docs/17-集成与使用指南.md) | **外部项目集成指南（首选，完整参考）**：安装、Service 契约、完整 API 与类型参考、扩展注册、i18n、npm 发布、FAQ |
| [examples/minimal-vite](examples/minimal-vite/README.md) | 可运行的最小示例：单模块 schema + 内存数据源，零后端 |
| [说明文档（docs/18）](docs/18-维护记录与文档索引.md) | 项目概述与维护记录索引 |
| [docs/01-项目概述.md](docs/01-项目概述.md) | 概述、目录结构、架构分层 |
| [docs/02-组件文档.md](docs/02-组件文档.md) | 全部组件（表格 / 卡片 / 字段 / 筛选） |
| [docs/03-引擎核心.md](docs/03-引擎核心.md) | 引擎入口、视图容器、弹窗宿主 |
| [docs/04-状态管理.md](docs/04-状态管理.md) | 状态设计（instanceState 主链路与 Store） |
| [docs/05-组合式函数.md](docs/05-组合式函数.md) | Composables 参考 |
| [docs/06-服务层.md](docs/06-服务层.md) | Service 接口 + Mock 适配器 |
| [docs/07-类型系统.md](docs/07-类型系统.md) | TypeScript 类型系统（含 FieldSchema 权威附录） |
| [docs/08-生命周期与钩子.md](docs/08-生命周期与钩子.md) | 生命周期、钩子、数据流图 |
| [docs/09-Schema编辑器.md](docs/09-Schema编辑器.md) | Schema 可视化编辑器 |
| [docs/10-路由与模块.md](docs/10-路由与模块.md) | 路由与演示模块 |
| [docs/15-样式Token基线.md](docs/15-样式Token基线.md) | 样式 Token 基线（组件样式一律 `var(--sg-*)`） |
| [docs/20-外观与格式契约.md](docs/20-外观与格式契约.md) | EngineAppearance 外观契约、displayStyle、保守导出 |
| [docs/archive/](docs/archive/) | 历史评估 / 路线图文档（已归档） |

## ❓ 常见问题

**引擎会和宿主应用的 Pinia 状态冲突吗？**
不会。每个 `<SchemaEngine>` 通过 `create*State()` 工厂创建隔离的实例状态，Pinia Store 也是动态注册的，多实例安全共存（配合上文必需的 Vite `dedupe` 配置）。

**大数据量下表现如何？**
表格基于 vxe-table 虚拟滚动；列表走服务端分页；CSV 导出按页拉取并设有安全上限（5,000 行）。

**Schema 变更后旧数据怎么办？**
在 `migrations[]` 中声明迁移（`fromVersion → toVersion`），重命名字段用 `previousKeys` — 引擎加载时自动迁移记录、视图配置与筛选预设。

**可以替换 UI 层吗？**
可以 — 通过 `useSchemaMeta()` / `useRecords()` 消费状态，用导出的积木（`SchemaTable`、`FieldEditorFactory`、`ValueRenderer` 等）自由组合自己的视图。

---

## 📄 许可证

[MIT](./LICENSE)
