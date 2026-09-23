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
  searchFields: true,
  quickFilterFields: true,
  cardView: true,
  treeConfig: true,
  groupBy: true,
  rowValidationRules: true,
  rules: true,
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
    description: '列表界面的编辑交互模式:双击单元格行内编辑,或点操作列「编辑」进入卡片编辑。',
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
    description: '引擎内置标准操作配置:{ delete: { enabled, batch, label, batchLabel, confirmTitle, confirmMessage, batchConfirmTitle, batchConfirmMessage }, batchPatch: { enabled } };delete 启用后渲染行级/批量删除入口(需同时满足 permissions.delete),确认后引擎发标准化事件、由宿主执行;batchPatch.enabled(docs/19 H4)启用后批量编辑经 batch-patch 事件交由宿主原子执行(失败整体回滚),缺省引擎本地逐条提交并带失败补偿回写。',
    example: { delete: { enabled: true, batch: true }, batchPatch: { enabled: true } },
  },
  {
    key: 'searchFields', target: 'module', label: '搜索字段', group: 'display', appliesTo: 'all', kind: 'string[]',
    surfaces: ['render'],
    description: '顶部搜索框作用的字段集(移动适配 §3.6):搜索经 list 通道 keyword 参数下推,支持方按字段跨字段 OR 包含匹配;缺省取第一个 text 字段,无 text 字段则不渲染搜索框。',
    example: ['name', 'origin'],
  },
  {
    key: 'quickFilterFields', target: 'module', label: '快捷筛选字段', group: 'display', appliesTo: 'all', kind: 'string[]',
    surfaces: ['render'],
    description: 'FK 弹窗搜索的快捷筛选字段集(字段 key 数组):声明后 SchemaEngineDialog(选择关联/查看数据)将命中的可筛选字段控件直接摊开渲染,免点「筛选」弹层;未列入的其余可筛选字段经「显示更多」展开/收起。缺省维持「筛选」弹层交互。',
    example: ['name', 'status'],
  },
  {
    key: 'cardView', target: 'module', label: '移动卡片投影', group: 'display', appliesTo: 'all', kind: 'object',
    surfaces: ['render'],
    description: '移动端卡片列表投影配置(移动适配 §3.4):{ titleField, statusField, fields, thumbField } 全部可省,省略项按 schema 字段类型推导(零配置可用);声明项逐项覆盖推导默认值。',
    example: { titleField: 'name', statusField: 'status', fields: ['price', 'updated_at'], thumbField: 'image' },
  },
  {
    key: 'groupBy', target: 'module', label: '分组小计', group: 'display', appliesTo: 'all', kind: 'object',
    surfaces: ['render'],
    description: '分组与小计声明(docs/19 F6):{ field, direction, summaryFields }。field 为分组字段;组行显示组值与条数,summaryFields 各列显示组内小计;按列 footer 合计取字段 aggregation:sum(与聚合统计条同口径)。',
    example: { field: 'status', direction: 'asc', summaryFields: ['amount'] },
  },
  {
    key: 'rowValidationRules', target: 'module', label: '行级校验', group: 'edit', appliesTo: 'all', kind: 'object',
    surfaces: ['form'],
    description: '行级校验规则(docs/19 H1):RowValidationRule[] 跨字段规则,when 以整行字段值为上下文({ record: 字段 } 互引可表达 dateEnd > dateStart),level error 拦截/warning 放行;与字段级校验同口径接入行内编辑、创建保存、快速创建三入口。',
    example: [{ key: 'dateRange', message: '结束日期需晚于开始日期', level: 'error', fields: ['dateStart', 'dateEnd'], when: { left: { record: 'dateEnd' }, operator: 'lte', right: { record: 'dateStart' } } }],
  },
  {
    key: 'rules', target: 'module', label: '模块级规则', group: 'condition', appliesTo: 'all', kind: 'object',
    surfaces: ['render', 'inline-edit'],
    description: '模块级声明式规则(rules 包八类),与字段级 rules 同构;适合跨字段 compute 链与模块级校验/动作。经 RulesRuntime 求值,Effect 交宿主执行器;声明序即求值序。',
    example: [{ type: 'validate', when: ['dateEnd', 'lt', 'dateStart'], message: '结束时间不能早于开始时间' }],
  },
  {
    key: 'treeConfig', target: 'module', label: '树形数据', group: 'display', appliesTo: 'all', kind: 'object',
    surfaces: ['render'],
    description: '树形数据声明(docs/19 F2):{ childrenField, parentField, expandAll }。childrenField 为嵌套子记录字段名(默认 children);声明 parentField 时记录以该字段存父记录主键,引擎组树后按树渲染;expandAll 默认展开全部层级。',
    example: { parentField: 'parentId', childrenField: 'children', expandAll: false },
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
