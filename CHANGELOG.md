# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- GitHub Actions CI：lint / type-check / 单元测试 / E2E P0 / 库构建。
- 社区文件：CONTRIBUTING、行为准则、Issue 与 PR 模板。
- `docs/16-完善方案-2026-09.md`：仓库完善方案。

### Changed

- E2E 分级脚本改为直接调用 Playwright（跨平台可用，不再依赖 PowerShell）。
- E2E 运行模式从 dev server 切换为 `vite preview`（构建产物验证）。
- 根目录 `引用指南.md` 迁移为 `docs/17-集成与使用指南.md`，`说明文档.md` 迁移为 `docs/18-维护记录与文档索引.md`。
- 移除 `.trae/` 内部工作流目录与脚手架残留 `src/stores/counter.ts`。

## [0.1.0] - 2026-09-13

首个开源版本。

- Schema 驱动的动态表单与数据管理引擎（列表 / 卡片 / 新增三种视图）。
- 多实例状态隔离（instanceState）、可注入 Service 层、Mock 适配器。
- 可视化 Schema 编辑器、公式引擎（mathjs）、条件显隐 / 条件编辑、Schema 平滑升级与链式迁移。
- MIT 许可证，双语文档（README / README.zh-CN）。
