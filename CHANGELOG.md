# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.3.12] - 2026-09-24

### Added

- **`ModuleSchema.bottomTabsEnabled`（缺省 true）** — 列表底部状态页签（按「第一个可筛选且有选项的 select 字段」生成）的模块级开关；模块已被外部维度切片（如合同按类型分菜单入口，页签与切片语义重复）时声明 `false` 关闭。登记 `MODULE_SCHEMA_KEYS`/`MODULE_META`，ListView 桌面/移动双端生效。

### Fixed

- **FK 筛选弹窗被「筛选」弹层遮盖** — FK 筛选弹窗基准 z-index 2200 → **4100**：该弹窗常从列表页「筛选」弹层（z-index 4000）内打开，2200 会让弹层盖住弹窗；4100 同时压过常规弹窗（2000/2100+）。`sg-filter-popper` 下拉层随之 4200 → **5000**，保证弹窗内的下拉/日期面板仍在最上层。

## [0.3.11] - 2026-09-24

### Added

- **弹窗单选 radio 列** — `SchemaEngineDialog` selectable 单选模式（`selectableMultiple` 缺省 false，如 FK 弹窗搜索选择一条记录）的表格渲染行首 **radio 列**（vxe type=radio，勾选列同位、36px fixed left）：勾选 radio、行高亮（`selected-row-id` 行类）双重视觉标出唯一选中行，弥补原「仅行点击高亮」的选择提示不足。`VxeTableWrapper` 新 `showRadio` prop（`radio-config.checkRowKey` 按 `selected-row-id` 声明式勾选 + `radio-change` 事件上抛），radio 与行点击/双击确认同语义。

### Fixed

- **FK 筛选弹窗随筛选弹层级联关闭** — `SchemaEngineDialog` 的 ElDialog 改 `append-to-body`：列表页「筛选」弹层（ElPopover）内打开的外键筛选弹窗，其 DOM 原先挂在弹层内容里——在弹窗内的任何点击对弹层都是「外部点击」，弹层关闭时把整个弹窗一并藏掉（关闭后再点「筛选」弹窗又随弹层复活）。挂到 body 后弹窗独立于弹层存活，事件上下文不再串。

## [0.3.10] - 2026-09-24

### Fixed

- **弹窗隐藏时不再发请求** — `SchemaEngineDialog` 的加载时机统一为单个 watch（visible × moduleId × initialFilters 组合键）：弹窗不可见时任何变化都不触发 schema/records 请求。此前 moduleId watch 不看 visible，FK 筛选弹窗等挂载型消费在关闭瞬间 moduleId 归空，会打出 `GET /schema/`、`GET /records/`（空 id → 404）噪声请求；同批 visible 与 moduleId 同时变化的打开路径也由两次加载收敛为一次。`loadModule` 另加空 moduleId 早退兜底。

## [0.3.9] - 2026-09-24

### Added

- **快捷筛选 16 列栅格布局 + `FieldSchema.quickFilterSpan`** — 新字段属性（登记 `FIELD_SCHEMA_KEYS`/`FIELD_META`）：快捷筛选摊开面板中的栅格跨度（16 列栅格，整数 1–16），默认 4 = 一行 4 个字段，16 = 独占一行，越界钳制。`FilterConditionControls` 新 `layout: 'grid'` 形态（`SchemaEngineDialog` 快捷面板启用）：`repeat(16, 1fr)` 栅格 + 标签在上、控件铺满单元格，窄屏（≤767.98px）退化为单列；弹层/抽屉纵排形态不受影响。

- **FK 筛选弹窗选值** — `FilterConditionControls` 的外键控件新增「打开列表选择」按钮：弹出目标模块完整列表（SchemaEngineDialog 多选模式，带其自身快捷筛选摊开面板），跨页勾选确认后回填 `in` 条件，选中行并入候选缓存使人读标签在多选框/摘要中显示。新增 `SchemaEngineDialog.zIndex` 基准 z-index prop（FK 筛选弹窗用 2200，避免与外层弹窗/嵌套栈重叠）。

### Fixed

- **筛选控件弹层被滚动容器裁剪** — 下拉/日期面板由 `:teleported="false"` 改为 teleport 到 body 并统一挂 `sg-filter-popper` 类（`z-index: 4200 !important`，钉在筛选弹层 4000 与各级弹窗之上）：快捷筛选摊开面板（overflow-y 容器）与标准列表筛选弹层内的下拉、日期面板不再被裁剪。

## [0.3.8] - 2026-09-23

### Added

- **FK 弹窗搜索快捷筛选摊开模式** — `ModuleSchema.quickFilterFields`（字段 key 数组）新契约键：声明后 `SchemaEngineDialog`（选择关联/查看数据）将命中的可筛选字段控件直接摊开渲染（免点「筛选」弹层），未列入的其余可筛选字段经「显示更多（N）/收起」展开收起；搜索/重置/匹配方式（全部/任一条件）与弹层模式同语义，筛选条件模型同源（`filters`）。草稿状态单源在 `FilterConditionControls`（新增 `quickFilterKeys`/`expanded` 可选 props，行显隐只影响渲染），收起/展开不丢已填条件。缺省（未声明）维持「筛选」弹层交互，主列表页不受影响。键已登记 `MODULE_SCHEMA_KEYS` 穷举表与 `MODULE_META` 文档。

- **行号列 i18n** — seq 列标题改经 `t('table.rowNumber')`：zh-CN 基准包「行号」；新增内置 `en` 增量语言包覆盖为「#」（未翻译 key 回退基准包），`setLocale('en')` 即生效。

- **Engine pipeline wiring for declarative rules** — new `useRules` composable (instance-provided by `SchemaEngine`): compiles module/field rules with the same mathjs/number evaluator as formula fields. (1) Inline edit: `validate` rules run at confirm — violation blocks with message, `force` rewrites the value; `compute` chains fire on the changed key, cascade in declaration order and write back into the row, derived fields flowing through the same persistence path (unchanged values deduped). (2) Action execution: `RowActionConfig.action` clicks plan Effects (confirm → invoke/open/navigate → toast) and hand them to the new `SchemaEngine.rulesExecutor` prop (warn+drop when absent); built-in `target` handling stays for action-less rows. (3) Derived positions: `rowAction.labelWhen` switches the row button label per row (op-column width prices the longest candidate); `aggregate` rules append `sum(...)`-style items to the list statistics bar. Zero rules → zero overhead (compile is skipped, guards short-circuit).

- **Schema contract: declarative rules positions** — `ModuleSchema.rules` / `FieldSchema.rules` (`Rule[]` from the rules package) and `RowActionConfig.action` (`ActionAct` declarative slot) are now first-class schema keys: registered in the exhaustive key tables and metadata docs (`FIELD_META`/`MODULE_META`), and validated by `validateSchema` via the isomorphic `validateRules` (issues surface as `error` diagnostics at `rules[...].path` / `fields[i].rules[...].path`; `rowAction.action` requires one of invoke/open/navigate). Sample schemas ship neutral rule examples (field-level compute chain + module-level validate). Invoice sample also declares the top-level `targetModule` its one-to-many field was missing.

- **`schemagine/rules` subpath entry (new declarative rules package)** — framework-free, dependency-free: `createRuntime({ evaluate, parse, functions, flows, actions })` returns `compileModule` / `evalCondition` / `runComputes` (watch-triggered ordered compute chain with cascade into dependent targets, SET/FORCE effects) / `runValidates` (`when` violation condition, `force` value coercion) / `planAction` (confirm → invoke/open/navigate → toast, `{{expr}}`-interpolated params) / `runFlow` (steps of action/params/when/as, sub-flow recursion guarded by depth ≤ 8 + cycle detection + action-kind whitelist, executor-injected IO). Eight rule kinds: condition/compute/map/lookup/validate/action/style/aggregate. Conditions accept object form (engine `visibleWhen` dialect), triplet form `[field, operator, operand?]`, and expression strings. Built-in functions: now/sum/count/min/max/abs/ceilTo/roundTo; business functions stay host-registered via the function dictionary. Isomorphic validators `validateRules` / `validateFlow` / `validateDictionary` for host-side write gates. Built as the third lib entry (`dist/rules.mjs`/`rules.cjs` + `dist/rules/*.d.ts`); the decoupling guard now also bans host namespaces (`xr-`/`xrerp`/`jy_`/company names) engine-wide.

## [0.3.7] - 2026-09-23

### Changed

- **勾选列固定最左**（常规顺序：勾选 → 行号），行号列随其后；两列均用固定 `width`（36px/48px），**不随视口宽度/fit 均摊拉扯**。
- 数据列由固定 `width` 改为 `min-width` 声明（取原 width 值参与 vxe fit 均摊）：视口更宽时多余空间由数据列吸收，勾选/行号/操作列等固定宽列不再被等比放大；拖拽调宽过的列仍走 vxe resizeWidth 保持固定。

## [0.3.6] - 2026-09-23

### Fixed

- 行号列序号改经默认插槽自渲染（`(rowNumberStart ?? 0) + rowIndex + 1`），不再依赖 vxe seq 内建计算——vxe 的序号填充在其内部渲染调度下，弹窗等二次渲染场景可能空文本。

## [0.3.5] - 2026-09-23

### Added

- **表格行号开关（默认关闭）**：`EngineAppearance.rowNumbers: true` 后，数据行首（勾选/展开列之前）渲染序号列（fixed left、居中、48px）。分页续号经 `VxeTableWrapper.rowNumberStart`（`(page-1)*pageSize`，第 2 页从 pageSize+1 起）。链路：SchemaEngine →（prop）ListView/SchemaTable → VxeTableWrapper；`SchemaEngineDialog` 不在显式 prop 链上，经新增 `APPEARANCE_KEY` provide/inject 取实例级 appearance（引擎树外独立使用时缺省关闭）。seq 列无 field，不参与列拖拽（drag-disabled）与合并单元格；`footerMethod` 若按数据列计值需自行注意索引错位。

## [0.3.4] - 2026-09-23

### Changed

- `SchemaEngineDialog` 工具栏布局对齐常规列表页：**筛选栏与列表动作靠左，列/卡片设置与视图切换靠右**（原为列表设置在左、筛选在右）。

## [0.3.3] - 2026-09-23

### Fixed

- `SchemaFilterBar` 的筛选条件弹层补 `z-index: 4000`：在 `SchemaEngineDialog`（z-index 2000+）内打开时弹层被弹窗遮住不可见。与表头「筛选与排序」弹层（既有 4000 约定）对齐。

## [0.3.2] - 2026-09-23

### Added

- 弹窗查看/选择模式补齐**全量筛选栏**（`SchemaFilterBar`）：`SchemaEngineDialog` 工具栏右侧与主列表同源的条件构建器（类型支持 + `filterable` 字段口径一致），表头单列筛选与全量条件共用同一份条件集（组合过滤组在表头高亮处拍平），关闭「查看数据」行为不受影响。

### Changed

- 弹窗表格**表头文字居中**（`.popup-dialog` 范围内，不影响主列表表头对齐）。

## [0.3.1] - 2026-09-23

### Added

- **FK 弹窗搜索选择器**：fk 字段编辑器（表单）新增弹窗搜索入口——按目标模块打开完整列表界面（完整列、表头筛选、排序、分页、列表设置）选择记录，确认后回填字段值。默认单选（行点击选中、双击直接确认），`FieldSchema.fkSearchMultiple: true` 显式开启多选（行首复选框、跨页勾选保留，确认回填 id 数组）。实现为 `SchemaEngineDialog` 选择模式（`selectable`/`selectableMultiple`/`selectedIds` props + `confirm` 事件），纯查看语义（`popup-schema` 动作）行为不变；fk 渲染管线（ValueRenderer / 行内编辑标签）对数组值按「、」拼接兼容。

## [0.3.0] - 2026-09-22

首个 npm 发布版本（0.2.3 及之前的内容随本版首发；0.2.0–0.2.2 为内部迭代号，未对外发布）。

### Added

- **媒体管理四种接入模式（`schemagine/media` 可选子路径导出）**：同一套 `image`/`mediaImage` 字段与编辑面按模式自动降级——① url（默认，纯 URL 渲染零配置）② oss 直传（S3 兼容含 MinIO path-style + 七牛，SigV4/HMAC-SHA1 纯 JS 签名零 SDK）③ api 宿主上传接口（约定 multipart `file`、响应 `url`/`data.url`）④ media library（`IMediaService` 契约 + 组件集）。新增 `setupMedia()` 统一入口、`createHttpMediaService()` 通用 HTTP 实现（对接 `/media/list` `/media/upload` `/media/lookup` 约定，宿主零胶水）、`MediaLibrary` 管理页（上传/筛选/分页/复制/删除/手动登记，能力探测自动隐藏入口）、`MediaPickerDialog` 多选（`selectMany`）；`IMediaService` 增可选 `remove`/`createManual`；lib 构建双入口（`dist/media.mjs/cjs` + `media/index.d.ts`），主入口不受影响。docs/17 新增 §3.9 全契约与 §3.13 四模式章（守卫钉住方法面与关键 API）。
- CI 新增 `e2e-extended` 并行 job：P0 快反馈之外，P1/P2/批次 E–H 扩展集在 CI 完整把关（`pnpm test:e2e:ext`）。
- `SECURITY.md` 安全策略（私密漏洞报告通道、安全设计边界说明）。
- i18n 公开导出补齐：`registerLocale` / `setLocale` / `getLocale` / `t` 与 `MessageSchema` 类型进入包出口——此前 `locale` prop 要求先注册语言包，但注册函数未导出，npm 消费方无法使用非 zh-CN 语言。
- 新增 `scripts/check-docs-coverage.mjs` 文档覆盖守卫并接入 `lint:check`：从源码提取 SchemaEngine props(11)/emits(11)/FieldType(24)，核对 docs/17 逐项覆盖（另钉六个 Service 方法面与 expose 面），公开 API 变更未同步宿主文档时门禁拦截。
- docs/17 宿主指南全面补全：props/emits 全量、六个 Service 方法签名、实时订阅契约（§3.10）、本地数据源（§3.12）、错误码表、FieldType 24 种、新增「扩展与进阶」章（自定义字段类型/自定义弹窗/外观契约速览/i18n）。
- README 双语补扩展注册表、i18n 与移动端、外观契约特性行。

### Fixed

- `MediaImageCell` 单击预览（`@click.stop` + 新窗口打开）会吞掉表格单元格的双击进编辑事件，且解析结果非可访问地址（如直传模式下的遗留媒体 id）时以损坏 `<img>` 渲染；现单击预览移除（看大图走媒体库管理页），非 http(s)/根路径/data:/blob: 的解析结果回落为文本占位（ValueRenderer 同口径）。
- `MediaPickerDialog` 以 `modelValue: true` 初始挂载时不加载媒体清单（watch 非 immediate）。
- 首屏加载中切换卡片视图卡片永久空白：ListView.fetchData 的 `isMounted` 竞态守卫误用于引擎实例级共享状态，卸载时丢弃在途响应导致 recordStore 永不写入；现仅保留模块切换的过期响应拦截（e2e 去固定延时后暴露的真实 bug）。

### Changed

- **lint 门禁升级为 0 warnings（docs/16 批次 H 完成）**：170 条 warning 清零——e2e 108 处固定延时改条件等待（`VxeTable` 可见信号 / `toHaveText` / `expect.poll`），40 处 `any` 收窄（vxe 事件换官方 `VxeTableDefines` 类型、表单模型 `Record<string, unknown>` + EP 绑定拆 model-value、测试断言链结构化），15 处测试内条件分支消除（`allTextContents()`）；`no-explicit-any` / `playwright/no-wait-for-timeout` / `playwright/no-conditional-in-test` / `vue/no-mutating-props` / `vue/no-side-effects-in-computed-properties` 升 error；`vue/no-deprecated-filter` 经逐条核实为模板 TS 联合断言误报后关停。行为等价重构两处：SchemaEditor 动作面板 props 直改改 emit 新对象；CreateView 列配置缺省推导副作用移出 computed。
- 文档对齐实际实现：docs/04 重写为「instanceState 主链路 + Store 存档」结构（`runtimeCacheStore` 仍在主链路、`schemaMeta`/`record`/`uiState` 三 store 标注遗留），docs/01 与双 README 的状态管理与多实例表述同步纠正。
- docs/17 硬伤修复：样式引入路径改为真实存在的 `schemagine/dist/schemagine.css`（原指向不存在的 `dist/style.css`）；快速开始 Service 示例补齐必选方法 `listFieldValueCandidates`（按原文档实现无法通过编译）；移除已删除的 `ListQueryParams.cursor`；对等依赖表去掉随包安装的 mathjs、补可选的 xlsx；修复 README 文档表中已迁移的 `引用指南.md`/`说明文档.md` 死链；版本号表述与 package.json 对齐。
- docs/19 §六 补记 I1 实时推送语义定稿（非编辑行静默合并、编辑中行跳过并提示冲突）。
- docs/16 新增批次 H「lint warning 收敛计划」（基线 170 条，按规则分三批清零后逐规则升 error）。

## [0.2.3] - 2026-09-21

（未单独发布，内容随 0.3.0 首发。）对应 `docs/19` 通用表格引擎改进计划批次 A–I 收官及其后续交付。

### Added

- 扩展机制：`registerFieldType` 字段类型注册（渲染/表单/行内编辑三接入 + 值适配）、`registerDialog`、vxe 插槽透传（`cellSlots`/`headerSlots`/`empty`）与 `getTableInstance()` 实例暴露（批次 B）。
- Schema Playground（`/playground`）：属性元数据注册表 `src/schemaMeta/`、`pnpm gen:schema-docs` 文档再生成通道（批次 A）。
- 数据层契约：「宿主执行」数据操作契约（`RowActionEvent`/`ActionTriggerEvent`）、批量事务契约 `batch-patch`（批次 H4）、本地数据源 `createLocalRecordService`（批次 C）。
- 过滤与视图体系：FilterBar 挂载、FilterGroup 组合条件、筛选预设与默认视图、列拖拽列序持久化、跨页勾选保留（批次 E）。
- 表格展示形态：密度三档、树形数据、多级表头、行展开插槽、相同值合并单元格、分组小计与按列合计（批次 F）。
- 编辑与校验：行级跨字段校验三入口、异步校验与竞态闸（批次 H1/H2）；引擎级 undo/redo 与实例级 history API（批次 H3）。
- 导入导出：xlsx 导出与共用导出通道（批次 G4）、CSV/xlsx 文件导入与行级预检向导（批次 H5）。
- 平台化：引擎 i18n locale 包与注入点（批次 G1）、键盘网格导航与 a11y 基线（批次 G2）、`roleBased` 权限消费（批次 G3）。
- 实时与诊断：实时订阅契约与运行时 Schema 诊断（批次 I1/I2）。
- 性能基准套件：万行渲染/滚动/编辑提交与公式链量化（`pnpm bench`）。
- 移动端：卡片列表形态、三段式编辑手柄、触底加载、动作降级框架、移动吸顶基准补偿。
- 外观与格式契约：`EngineAppearance`（表格边框/值展示/卡片密度/保守导出）、`FieldSchema.displayStyle`（docs/20）。
- 工程化：GitHub Actions CI（lint / type-check / 单元测试 / E2E / 库构建）、宿主解耦契约 CI 守卫、社区文件（CONTRIBUTING、行为准则、Issue 与 PR 模板）、`docs/16-完善方案-2026-09.md`。

### Changed

- 虚拟滚动自动开启（>200 行）；cursor 分页声明移除（批次 C）。
- 校验三入口统一（`utils/fieldValidation.ts`）、批量编辑（单字段填充）（批次 D）。
- E2E 分级脚本改为直接调用 Playwright（跨平台可用），运行模式从 dev server 切换为 `vite preview`（构建产物验证）。
- 根目录 `引用指南.md` 迁移为 `docs/17-集成与使用指南.md`，`说明文档.md` 迁移为 `docs/18-维护记录与文档索引.md`。
- 移除 `.trae/` 内部工作流目录与脚手架残留 `src/stores/counter.ts`。

## [0.1.0] - 2026-09-13

首个开源版本。

- Schema 驱动的动态表单与数据管理引擎（列表 / 卡片 / 新增三种视图）。
- 多实例状态隔离（instanceState）、可注入 Service 层、Mock 适配器。
- 可视化 Schema 编辑器、公式引擎（mathjs）、条件显隐 / 条件编辑、Schema 平滑升级与链式迁移。
- MIT 许可证，双语文档（README / README.zh-CN）。
