import type { ModuleSchema } from '@/types'
import type { PropertyMeta } from './types'

/**
 * ModuleSchema 穷举键表:类型层面强制与 types/schema.ts 的 ModuleSchema 字段一一对应。
 * ModuleSchema 新增属性而未在此登记时 type-check 直接失败(防漏第一道闸)。
 */
export const MODULE_SCHEMA_KEYS: Record<keyof ModuleSchema, true> = {
  id: true,
  name: true,
  version: true,
  moduleType: true,
  fields: true,
  permissions: true,
  defaultViewMode: true,
  listEditMode: true,
  createMode: true,
  formulaConfig: true,
  listActions: true,
  operations: true,
  migrations: true,
  status: true,
}

/** ModuleSchema 顶层属性元数据(结构性属性 fields/migrations 不提供编辑控件) */
export const MODULE_META: PropertyMeta[] = [
  {
    key: 'id', target: 'module', label: '模块 ID', group: 'basic', appliesTo: 'all', kind: 'none',
    required: true, surfaces: [],
    description: '模块唯一标识,路由、Schema 存储与记录数据的定位键;创建后不建议变更。',
  },
  {
    key: 'name', target: 'module', label: '模块名称', group: 'basic', appliesTo: 'all', kind: 'string',
    required: true, surfaces: ['render', 'card'],
    description: '模块显示名称,用于引擎标题与模块切换列表。',
    example: '应付账款',
  },
  {
    key: 'version', target: 'module', label: '版本号', group: 'basic', appliesTo: 'all', kind: 'string',
    required: true, surfaces: [],
    description: '语义化版本号;迁移链(migrations)按 fromVersion 升序执行,加载时版本不一致自动迁移并回写。',
    related: ['migrations'],
    example: '1.0.0',
  },
  {
    key: 'moduleType', target: 'module', label: '模块类型', group: 'basic', appliesTo: 'all', kind: 'enum',
    enumValues: [
      { value: 'list', label: '列表' },
      { value: 'card', label: '卡片' },
      { value: 'both', label: '列表+卡片' },
    ],
    required: true, surfaces: ['render', 'card'],
    description: '模块提供的视图形态:列表 / 卡片 / 两者;视图切换器按此渲染可选项。',
  },
  {
    key: 'fields', target: 'module', label: '字段列表', group: 'basic', appliesTo: 'all', kind: 'none',
    required: true, surfaces: ['render', 'inline-edit', 'filter', 'form', 'card'],
    description: '字段定义数组(FieldSchema[]),在本工具左侧结构树中选择与管理;此处仅在文档中说明,不提供 JSON 编辑。',
  },
  {
    key: 'permissions', target: 'module', label: '模块权限', group: 'condition', appliesTo: 'all', kind: 'object',
    required: true, surfaces: ['render', 'inline-edit', 'form', 'card'],
    description: '模块级权限 { view, create, edit, delete, export, configure }:view=false 整模块拒绝加载;delete/export 等控制对应操作入口;字段级权限在 FieldSchema.permission 叠加。',
    example: { view: true, create: true, edit: true, delete: true, export: true, configure: true },
  },
  {
    key: 'defaultViewMode', target: 'module', label: '默认视图', group: 'basic', appliesTo: 'all', kind: 'enum',
    enumValues: [
      { value: 'list', label: '列表' },
      { value: 'card', label: '卡片' },
      { value: 'create', label: '新建页' },
    ],
    required: true, surfaces: ['render', 'card'],
    description: '引擎加载后默认进入的视图。',
  },
  {
    key: 'listEditMode', target: 'module', label: '列表编辑模式', group: 'edit', appliesTo: 'all', kind: 'enum',
    enumValues: [
      { value: 'inline-dblclick', label: '双击单元格行内编辑', desc: '默认' },
      { value: 'select-then-edit', label: '单击选中 + 右上角编辑', desc: '跳转卡片编辑态' },
    ],
    surfaces: ['inline-edit', 'card'],
    description: '列表视图的编辑交互模式:双击单元格行内编辑,或单击选中后经右上角「编辑」进入卡片编辑。',
  },
  {
    key: 'createMode', target: 'module', label: '新建方式', group: 'edit', appliesTo: 'all', kind: 'enum',
    enumValues: [
      { value: 'list', label: '新建页(表格)' },
      { value: 'card', label: '卡片新建' },
    ],
    surfaces: ['form'],
    description: '「新增」入口进入的创建形态:表格创建页或卡片创建。',
  },
  {
    key: 'formulaConfig', target: 'module', label: '公式全局配置', group: 'formula', appliesTo: 'all', kind: 'object',
    surfaces: ['render', 'form', 'card'],
    description: '公式引擎全局配置 { enabled, fields, maxDepth, circularDependencyCheck };字段级公式在 FieldSchema.formula 声明。',
    related: ['formula'],
    example: { enabled: true, fields: [], maxDepth: 5, circularDependencyCheck: true },
  },
  {
    key: 'listActions', target: 'module', label: '列表动作', group: 'basic', appliesTo: 'all', kind: 'object',
    surfaces: ['render'],
    description: '工具栏列表动作数组 { id, type: sort|popup-schema|form-submit|custom|delete, label, icon?, order?, target? };引擎负责渲染与确认,宿主经 action-trigger 事件执行业务。',
    example: [{ id: 'submit-all', type: 'custom', label: '批量提交' }],
  },
  {
    key: 'operations', target: 'module', label: '标准数据操作', group: 'edit', appliesTo: 'all', kind: 'object',
    surfaces: ['render'],
    description: '引擎内置标准操作配置(当前仅 delete):{ delete: { enabled, batch, label, batchLabel, confirmTitle, confirmMessage, batchConfirmTitle, batchConfirmMessage } };启用后渲染行级/批量删除入口(需同时满足 permissions.delete),确认后引擎发标准化事件、由宿主执行。',
    example: { delete: { enabled: true, batch: true } },
  },
  {
    key: 'migrations', target: 'module', label: '迁移链', group: 'basic', appliesTo: 'all', kind: 'none',
    since: '2.0', surfaces: [],
    description: '版本迁移数组 { fromVersion, toVersion, migrateRecord, migrateViewConfig?, migrateFilterPresets? },含函数不可 JSON 序列化,仅能在代码中定义;此处仅在文档中说明。',
  },
  {
    key: 'status', target: 'module', label: '模块状态', group: 'basic', appliesTo: 'all', kind: 'enum',
    enumValues: [
      { value: 'active', label: '启用' },
      { value: 'disabled', label: '禁用' },
      { value: 'error', label: '异常' },
    ],
    required: true, surfaces: ['render'],
    description: '模块状态标记;当前由宿主侧语义消费,引擎核心链路以 permissions.view 为准。',
  },
]
