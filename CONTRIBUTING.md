# 贡献指南

感谢关注 Schemagine！欢迎通过 Issue 反馈问题、通过 Pull Request 提交改进。

## 本地开发

```sh
pnpm install
pnpm dev           # 启动开发服务器（默认打开凭证管理演示模块）
pnpm type-check    # TypeScript 类型检查
pnpm lint:check    # 代码检查（CI 同款，不修改文件）
pnpm lint          # 代码检查并自动修复
pnpm test:unit     # 单元测试（Vitest）
pnpm test:e2e:p0   # E2E P0 套件（Playwright，自动构建并以 preview 模式运行）
pnpm test:e2e:p1   # E2E P1 套件
pnpm test:e2e:p2   # E2E P2 套件
pnpm build:lib     # 构建库产物（dist/）
```

要求：Node `^20.19.0 || >=22.12.0`，包管理器统一使用 pnpm（见 `package.json` 的 `packageManager` 字段）。

## 提交规范

使用 Conventional Commits，scope 可选，描述用中文即可：

```
feat(create): 支持从 Excel 粘贴批量导入草稿行
fix(table): 修复排序弹层未清空筛选条件的问题
docs: 补充服务层文档
chore: 升级 vxe-table 到 4.18
```

## Pull Request 约定

1. 从 `main` 切出功能分支。
2. 提交前确保 `lint:check`、`type-check`、`test:unit` 通过；涉及引擎行为的改动请补对应 E2E 或单测。
3. PR 模板中逐项勾选自查清单。
4. 样式改动遵循样式 Token 基线（见 `docs/15-样式Token基线.md`）：组件样式一律使用 `var(--sg-*)`。

## 文档

- 架构与模块文档见 `docs/`（01–15）。
- 集成与使用指南见 `docs/17-集成与使用指南.md`。

## 行为准则

参与本项目即同意遵守 [行为准则](CODE_OF_CONDUCT.md)。
