export interface ModuleSchema {
  id: string
  name: string
  version: string
  moduleType: 'list' | 'card' | 'both'
  fields: FieldSchema[]
  permissions: ModulePermissions
  defaultViewMode: 'list' | 'card' | 'create'
  listEditMode?: ListEditMode
  createMode?: 'list' | 'card'
  formulaConfig?: FormulaConfig
  listActions?: ListAction[]
  /** 标准数据操作配置：由引擎内置渲染与交互，宿主仅消费标准化事件执行业务 */
  operations?: DataOperationsConfig
  /** 树形数据声明（docs/19 F2）：声明后列表按树形渲染（vxe tree-config） */
  treeConfig?: TreeConfig
  /** 分组与小计声明（docs/19 F6）：声明后列表按字段值分组渲染组行与组内小计 */
  groupBy?: GroupByConfig
  /** 行级校验规则（docs/19 H1）：跨字段规则（如 dateEnd > dateStart），三入口同口径拦截 */
  rowValidationRules?: RowValidationRule[]
  /** @since 2.0 版本迁移列表：按 fromVersion 升序排列 */
  migrations?: SchemaMigration[]
  status: 'active' | 'disabled' | 'error'
}

/**
 * 树形数据声明（docs/19 批次 F2）。
 * 宿主二选一提供数据形态：
 *  - 记录自带嵌套：children 数组直接挂在记录上（childrenField 声明字段名，默认 'children'）；
 *  - 平铺 + 父引用：记录以 parentField 存父记录主键，由引擎组树（utils/recordTree buildRecordTree）。
 */
/**
 * 分组与小计声明（docs/19 批次 F6）。
 * 组行携带组值/条数/组内小计；按列 footer 合计取 fields 中 aggregation:'sum'
 * 字段（与聚合统计条 useAggregation 同口径），经 vxe footer-method 渲染。
 */
/**
 * 行级校验规则（docs/19 批次 H1）。when 以整行字段值为 record 上下文求值
 * （条件系统支持 { record: '字段' } 互引），true = 触发规则；
 * level='error' 拦截提交，'warning' 放行仅提示。与字段级校验同口径接入
 * 行内编辑确认、创建视图保存、快速创建弹窗三入口。
 */
export interface RowValidationRule {
  /** 规则标识 */
  key: string
  /** 触发提示文案 */
  message: string
  /** error=拦截；warning=放行仅提示 */
  level: 'error' | 'warning'
  /** 声明依赖字段（文档与工具提示用；求值恒以整行为上下文） */
  fields?: string[]
  /** 触发条件（字段互引用 { record: 'dateEnd' } 形式） */
  when: Condition
}

export interface GroupByConfig {
  /** 分组字段（字段 key，建议低基数枚举/文本列） */
  field: string
  /** 组间排序方向，默认 'asc'（组内保持原顺序） */
  direction?: 'asc' | 'desc'
  /** 组行小计字段（字段 key）：组行上对应列显示组内 sum */
  summaryFields?: string[]
}

export interface TreeConfig {
  /** 嵌套子记录所在字段名，默认 'children' */
  childrenField?: string
  /** 平铺记录组树：记录上存父记录主键的字段名（值 = 父记录 id）；声明后引擎自动组树 */
  parentField?: string
  /** 是否默认展开全部层级，默认 false */
  expandAll?: boolean
}

/** 标准数据操作 —— 删除（行级删除 + 批量删除）与批量字段更新（宿主执行契约） */
export interface DataOperationsConfig {
  delete?: DeleteOperationConfig
  /** 批量字段更新（docs/19 H4）：启用后批量编辑经 batch-patch 事件交由宿主原子执行，缺省引擎本地逐条提交 */
  batchPatch?: BatchPatchOperationConfig
}

export interface BatchPatchOperationConfig {
  /**
   * 启用宿主执行契约（默认 false = 引擎本地逐条 patchField 提交）。
   * 启用后批量编辑对话框确认 → 引擎 emit `batch-patch`（BatchPatchEvent），
   * 宿主以原子语义执行（失败由宿主整体回滚），完成后经 refresh() 重新拉取。
   */
  enabled?: boolean
}

export interface DeleteOperationConfig {
  /** 是否启用行级删除（需同时满足 permissions.delete），默认 false */
  enabled?: boolean
  /** 是否启用批量删除（需 enabled 且 permissions.delete 同时成立），默认 false */
  batch?: boolean
  /** 行级按钮文案，默认「删除」 */
  label?: string
  /** 批量删除按钮文案，默认「批量删除」 */
  batchLabel?: string
  /** 二次确认标题（单条/批量共用缺省时的兜底），默认「删除确认」 */
  confirmTitle?: string
  /** 单条删除二次确认内容，默认标准文案 */
  confirmMessage?: string
  /** 批量删除二次确认标题，默认「批量删除」 */
  batchConfirmTitle?: string
  /** 批量删除二次确认内容，支持 {count} 占位符，默认标准文案 */
  batchConfirmMessage?: string
}

export type ListEditMode =
  | 'inline-dblclick'
  | 'select-then-edit'

export interface FieldSchema {
  id: string
  name: string
  key: string
  type: FieldType
  label: string
  required: boolean
  readonly: boolean
  visibleWhen?: Condition
  editableWhen?: Condition
  defaultValue?: unknown
  placeholder?: string
  description?: string
  order: number
  width?: number
  visible: boolean
  fixed?: 'left' | 'right'
  sortable: boolean
  filterable: boolean
  /** 列头筛选显式候选值模式（Excel 式）：数值/日期型字段缺省走关键词/时间段筛选，
   *  声明后覆盖为去重候选值列表（datetime 由后端按天分桶）。文本/枚举/外键列无需声明即默认候选值优先 */
  filterCandidates?: boolean
  validationRules?: ValidationRule[]
  permission?: FieldPermission
  formula?: FormulaFieldConfig
  dynamicMax?: DynamicMaxConfig
  options?: SelectOption[]
  /** 枚举值 → 颜色（语义色调或 CSS 颜色）：select/multi-select/status 字段的字段级取色表，options[].color 优先 */
  statusMap?: Record<string, string>
  targetModule?: string
  /** 编辑模式：standard=常规（行内+表单）；limited=有限编辑（禁止行内编辑，仅创建/专用通道可改，
   *  后端不强制拦截——与 readonly 的绝对禁止相区分）。缺省 standard */
  editMode?: 'standard' | 'limited'
  /** fk 字段：是否在下拉底部提供「新建」快速创建入口（打开弹层按目标模块必选字段+默认值创建，创建后自动选中）。
   *  目标无独立模块定义时降级为仅填 name。默认关闭，需显式开启 */
  quickCreate?: boolean
  displayField?: string
  group?: string
  /** 相同值合并单元格（docs/19 F5）：声明后该列相邻同值行纵向合并 */
  mergeCells?: boolean
  category?: string
  nullableFilter?: boolean
  rowAction?: RowActionConfig
  aggregation?: 'sum' | 'average' | 'count' | 'max' | 'min'
  countCondition?: 'empty' | 'notEmpty'
  treatAsEmpty?: unknown[]
  prefixStr?: string
  suffixStr?: string
  /** 数值/百分比/货币字段：小数位数。number 无默认，currency 默认 2，percent 默认 0 */
  decimal?: number
  /** 小数精度模式：fixed=固定小数位（补零），max=最大小数位（末尾零省略），range=最少decimal位最多maxDecimal位。默认 fixed */
  decimalMode?: 'fixed' | 'max' | 'range'
  /** range 模式时的小数上限位数 */
  maxDecimal?: number
  /** boolean 字段的展示模式：switch（默认切换开关）| radio（圆形勾选框） */
  switchMode?: 'switch' | 'radio'
  /** boolean 字段 true 对应的显示标签，默认"是" */
  trueLabel?: string
  /** boolean 字段 false 对应的显示标签，默认"否" */
  falseLabel?: string
  /** boolean 字段 true 标签的 CSS 类名；不声明时默认绿色（cell-boolean--yes），可传引擎预设 cell-boolean--neutral 灰或业务自有类 */
  trueLabelClass?: string
  /** boolean 字段 false 标签的 CSS 类名；不声明时默认红色（cell-boolean--no），可传引擎预设 cell-boolean--neutral 灰或业务自有类 */
  falseLabelClass?: string
  /** date/datetime 字段：默认日期偏移天数，0=今天，正数=未来，负数=过去 */
  defaultDateOffset?: number
  /** @since 2.0 字段重命名：旧 key 列表，引擎自动映射 */
  previousKeys?: string[]
  /** 一对多/多对多关联字段配置 */
  relationConfig?: RelationConfig
  /** 反向引用字段配置 */
  reverseRefConfig?: ReverseRefConfig
  /** 筛选高亮样式：作用于文本包含式筛选的匹配片段，默认黄色背景 */
  highlightStyle?: string
}

export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'select'
  | 'multi-select'
  /** 状态枚举：select 的语义别名（渲染/编辑同 select），支持 statusMap 取色 */
  | 'status'
  | 'fk'
  | 'one-to-many'
  | 'many-to-many'
  | 'reverse-ref'
  | 'formula'
  | 'percent'
  | 'currency'
  | 'money'
  | 'phone'
  | 'email'
  | 'url'
  | 'image'
  | 'mediaImage'
  | 'attachment'
  | 'json'
  | 'action'

export interface SelectOption {
  label: string
  value: string | number | boolean
  /** 枚举值颜色：语义色调（primary/success/warning/danger/info）或任意 CSS 颜色，渲染为彩色标签（见 utils/enumTag） */
  color?: string
  disabled?: boolean
}

export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'custom'
  value?: unknown
  message: string
  level: 'error' | 'warning'
}

export interface ModulePermissions {
  view: boolean
  create: boolean
  edit: boolean
  delete: boolean
  export: boolean
  configure: boolean
}

export interface FieldPermission {
  visible: boolean
  editable: boolean
  roleBased?: Record<string, boolean>
}

export interface FormulaConfig {
  enabled: boolean
  fields: FormulaFieldConfig[]
  maxDepth: number
  circularDependencyCheck: boolean
}

export interface FormulaFieldConfig {
  fieldKey: string
  expression: string
  dependencies: string[]
  resultType: 'number' | 'text' | 'boolean' | 'date'
  aggregation?: 'sum' | 'count' | 'average' | 'none'
}

export interface DynamicMaxConfig {
  enabled: boolean
  sourceField: string
  ratio: number
  mode: 'hard' | 'soft'
  messageTemplate?: string
}

export type ListActionType = 'sort' | 'popup-schema' | 'form-submit' | 'custom' | 'delete'

export interface ListAction {
  id: string
  type: ListActionType
  label: string
  icon?: string
  order?: number
  target?: ActionTargetConfig
}

/** delete 类型：引擎内置的标准删除操作（操作列固定渲染，不参与排序/隐藏/拖拽） */
export type RowActionType = 'popup-schema' | 'form-submit' | 'export' | 'delete' | 'custom'

export interface RowActionConfig {
  type: RowActionType
  label: string
  icon?: string
  /** 按行显隐：逐行以行数据为 record 上下文求值，false 时该行不渲染此按钮（如「停用」仅启用行可见） */
  visibleWhen?: Condition
  /** 危险操作红字样式；不改变 type 语义（custom 也可标红） */
  danger?: boolean
  target?: ActionTargetConfig
}

export interface ActionTargetConfig {
  moduleId?: string
  filters?: ActionFilterRule[]
  formFields?: ActionFormField[]
  apiEndpoint?: string
  apiMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  exportTemplate?: string
}

export interface ActionFilterRule {
  field: string
  operator: 'eq' | 'neq' | 'like' | 'in' | 'between' | 'gte' | 'lte'
  valueSource: 'static' | 'from-current-filter' | 'from-row-context'
  staticValue?: unknown
  contextField?: string
}

export interface ActionFormField {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'select' | 'textarea'
  required?: boolean
  options?: SelectOption[]
  defaultValue?: unknown
}

/** 关系表连带字段定义 */
export interface RelationExtraField {
  key: string
  label: string
  type: 'text' | 'number' | 'currency' | 'select' | 'date' | 'boolean'
  required?: boolean
  defaultValue?: unknown
  placeholder?: string
  options?: SelectOption[]
}

/** 一对多/多对多关联字段配置 */
export interface RelationConfig {
  targetModule: string
  displayField: string
  extraFields?: RelationExtraField[]
}

/** 反向引用字段配置 — 显示哪些源模块引用了当前记录 */
export interface ReverseRefConfig {
  sourceModules: string[]
  relationFieldKey: string
}

export interface SchemaMigration {
  fromVersion: string
  toVersion: string
  migrateRecord: (record: Record<string, unknown>) => void
  migrateViewConfig?: (config: { columns?: Array<{ field: string }> }) => { columns?: Array<{ field: string }> }
  migrateFilterPresets?: (presets: Array<{ id: string; name: string; filters: unknown[] }>) => Array<{ id: string; name: string; filters: unknown[] }>
}

export type Condition =
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition }
  | {
    left: ConditionValueRef
    operator: ConditionOperator
    right?: ConditionValueRef
  }

export type ConditionValueRef =
  | { record: string }
  | { global: string }
  | { value: unknown }

export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'notIn'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'notEmpty'
  | 'exists'
  | 'notExists'
