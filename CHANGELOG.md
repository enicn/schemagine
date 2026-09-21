# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- CI 新增 `e2e-extended` 并行 job：P0 快反馈之外，P1/P2/批次 E–H 扩展集在 CI 完整把关（`pnpm test:e2e:ext`）。
- `SECURITY.md` 安全策略（私密漏洞报告通道、安全设计边界说明）。
- i18n 公开导出补齐：`registerLocale` / `setLocale` / `getLocale` / `t` 与 `MessageSchema` 类型进入包出口——此前 `locale` prop 要求先注册语言包，但注册函数未导出，npm 消费方无法使用非 zh-CN 语言。
- 新增 `scripts/check-docs-coverage.mjs` 文档覆盖守卫并接入 `lint:check`：从源码提取 SchemaEngine props(11)/emits(11)/FieldType(24)，核对 docs/17 逐项覆盖（另钉六个 Service 方法面与 expose 面），公开 API 变更未同步宿主文档时门禁拦截。
- docs/17 宿主指南全面补全：props/emits 全量、六个 Service 方法签名、实时订阅契约（§3.10）、本地数据源（§3.12）、错误码表、FieldType 24 种、新增「扩展与进阶」章（自定义字段类型/自定义弹窗/外观契约速览/i18n）。
- README 双语补扩展注册表、i18n 与移动端、外观契约特性行。

### Changed

- 文档对齐实际实现：docs/04 重写为「instanceState 主链路 + Store 存档」结构（`runtimeCacheStore` 仍在主链路、`schemaMeta`/`record`/`uiState` 三 store 标注遗留），docs/01 与双 README 的状态管理与多实例表述同步纠正。
- docs/17 硬伤修复：样式引入路径改为真实存在的 `schemagine/dist/schemagine.css`（原指向不存在的 `dist/style.css`）；快速开始 Service 示例补齐必选方法 `listFieldValueCandidates`（按原文档实现无法通过编译）；移除已删除的 `ListQueryParams.cursor`；对等依赖表去掉随包安装的 mathjs、补可选的 xlsx；修复 README 文档表中已迁移的 `引用指南.md`/`说明文档.md` 死链；版本号表述与 package.json 对齐。
- docs/19 §六 补记 I1 实时推送语义定稿（非编辑行静默合并、编辑中行跳过并提示冲突）。
- docs/16 新增批次 H「lint warning 收敛计划」（基线 170 条，按规则分三批清零后逐规则升 error）。

## [0.2.3] - 2026-09-21

首个 npm 发布版本（0.2.0–0.2.2 为内部迭代号，未对外发布）。对应 `docs/19` 通用表格引擎改进计划批次 A–I 收官及其后续交付。

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
