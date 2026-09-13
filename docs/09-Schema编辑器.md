# Schema 编辑器

## 概述

**入口文件**: `src/editor/SchemaEditor.vue`

可视化 Schema 配置工具。可创建/编辑模块 Schema、配置字段、公式、权限、操作等。

## 目录结构

```
src/editor/
├── components/
│   ├── ActionsConfigPanel.vue      # 列表操作配置面板
│   ├── DependencyGraph.vue         # 公式依赖关系图
│   ├── FieldSchemaFormPanel.vue    # 字段 Schema 表单面板
│   ├── FormulaBuilder.vue          # 公式构建器
│   ├── JsonImportExport.vue        # JSON 导入/导出
│   ├── SchemaPreview.vue           # Schema 预览（复用运行时引擎）
│   └── formulaUtils.ts             # 公式工具函数
└── SchemaEditor.vue                # 编辑器主页
```

## 核心组件

### SchemaEditor.vue

编辑器主页。提供模块管理、字段列表、拖拽排序、属性配置等。

- 左侧：模块列表 / 字段列表
- 中间：字段属性编辑面板
- 右侧：预览面板（复用 `SchemaEngine`）
- 模块配置：支持 `listEditMode`（列表编辑模式：双击行内编辑 / 选中后点击“编辑”跳转卡片编辑）

### FieldSchemaFormPanel.vue

字段 Schema 表单面板。配置单个字段的所有属性：

- 基础信息：key、label、type、order
- 约束：required、readonly、width、visible、sortable、filterable
- 校验规则：ValidationRule[]（required/min/max/pattern）
- 下拉选项：SelectOption[] 编辑（select/multi-select 类型）
- FK 配置：targetModule、displayField
- 公式配置：expression、dependencies、resultType、aggregation
- 动态最大值：sourceField、ratio、mode、messageTemplate
- 聚合配置：aggregation、countCondition、treatAsEmpty
- 关联配置：RelationConfig（关系定义、额外字段）
- 行操作：RowActionConfig
- 展示：prefixStr、suffixStr、switchMode、trueLabel/falseLabel、defaultDateOffset

### FormulaBuilder.vue

公式构建器。可视化编辑公式表达式：

- 公式输入框（支持 mathjs 语法）
- 依赖字段可视化选择
- 结果类型选择（number/text/boolean/date）
- 聚合模式选择（sum/count/average/none）
- 语法校验 + 实时预览

### DependencyGraph.vue

公式依赖关系图。展示公式字段之间的依赖拓扑：

- 节点：公式字段 + 被依赖的普通字段
- 边：依赖方向
- 循环依赖红色高亮
- 拓扑排序展示

### ActionsConfigPanel.vue

列表操作配置面板。配置 `listActions`：

- 操作类型：sort / popup-schema / form-submit / custom
- 操作标签、图标、排序
- 目标配置：targetModuleId、filters、formFields、apiEndpoint

### JsonImportExport.vue

JSON 导入/导出工具：

- 导出当前 Schema 为 JSON 文件
- 导入 JSON 文件覆盖当前 Schema
- JSON 格式校验
- 预览导入/导出内容

### SchemaPreview.vue

Schema 预览面板。复用 `SchemaEngine` 组件实时预览编辑中的 Schema。

- 实时反映编辑中的字段变化
- 支持三种视图切换
- 使用 Mock 数据预览效果

## formulaUtils.ts

公式工具函数集合：

| 函数 | 说明 |
|------|------|
| `parseDependencies(expression)` | 从表达式中提取字段引用 |
| `validateExpression(expression)` | 校验表达式语法 |
| `suggestFunctions()` | 提供可用函数列表 |
| `formatExpression(expression)` | 格式化表达式 |

## 编辑器路由

`/editor` → `SchemaEditor.vue`

可通过 URL 参数指定模块：`/editor?moduleId=module-voucher`
