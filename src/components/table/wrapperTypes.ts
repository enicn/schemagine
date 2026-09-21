import type { Condition } from '@/types'
import type { FieldSchema } from '@/types'

/**
 * VxeTableWrapper 列描述(SchemaTable/SchemaEngineDialog 共用)。
 * 独立成模块供拆分出的 composables 引用,避免 type 级循环依赖;
 * VxeTableWrapper.vue 以 `export type { WrapperColumn }` 保持既有导入路径兼容。
 */
export interface WrapperColumn {
  field: string
  title: string
  /** 字段声明序(FieldSchema.order,docs/20):无用户列配置(UserViewConfig.columns)时的默认列序 */
  fieldOrder?: number
  width?: number
  fixed?: 'left' | 'right'
  sortable?: boolean
  visible: boolean
  align?: 'left' | 'center' | 'right'
  formatter?: (params: { row?: Record<string, unknown>; column?: WrapperColumn; cellValue: unknown }) => string
  isAction?: boolean
  /** 危险操作样式（如标准删除操作） */
  actionDanger?: boolean
  /** 行级动作语义类型（docs/20）：'delete' 时点击 actionId 固定上抛 'delete'，custom 上抛字段 key */
  rowActionType?: string
  /** 行级显隐条件：逐行以行数据为 record 上下文求值，false 时该行不渲染此操作按钮 */
  actionVisibleWhen?: Condition
  /** 未声明 width 的数据列携带 min-width：vxe 把表格剩余宽度平均分给带 min-width 的列（仅省略 width 不参与分配） */
  minWidth?: number
  isRelation?: boolean
  cellClass?: (params: { value: unknown }) => string
  fieldType?: string
  targetModule?: string
  selectOptions?: Array<{ label: string; value: string | number | boolean; color?: string }>
  /** 枚举值 → 颜色（select/multi-select/status 字段），options[].color 优先（见 utils/enumTag） */
  statusMap?: Record<string, string>
  /** 值展示覆盖（docs/20）：'tag'=胶囊/彩色标签，'plain'=纯文本；未声明跟随引擎 appearance.valueDisplay（透传 FieldSchema.displayStyle） */
  displayStyle?: 'tag' | 'plain'
  trueLabel?: string
  falseLabel?: string
  /** boolean true 标签自定义 CSS 类（引擎预设：cell-boolean--neutral 灰色；也可传业务自有类） */
  trueLabelClass?: string
  falseLabelClass?: string
  /** fk 字段：下拉底部快速新建开关（透传 FieldSchema.quickCreate） */
  quickCreate?: boolean
  /** 列头筛选显式候选值模式（Excel 式）：数值/日期列缺省走关键词/时间段筛选，
   *  声明后覆盖为候选值列表（datetime 后端按天分桶）；其余列无需声明即候选值优先 */
  filterCandidates?: boolean
  /** 字段绝对只读：任何权限/入口都禁止进入编辑态（与后端 editablePatch 更新跳过 readonly 对齐） */
  readonly?: boolean
  /** 有限编辑：禁止行内编辑，仅创建/专用通道可改（readonly 之外的可编辑性调节旋钮） */
  editMode?: 'standard' | 'limited'
  highlightStyle?: string
  decimal?: number
  decimalMode?: 'fixed' | 'max' | 'range'
  maxDecimal?: number
  /** 字段 Schema 引用:自定义字段渲染器/插槽上下文使用(独立使用 VxeTableWrapper 时可缺省) */
  fieldSchema?: FieldSchema
  /** 多级表头分组标题（docs/19 F3）：相邻同名列合并为一个 VxeColgroup */
  headerGroup?: string
  /** 相同值合并单元格（docs/19 F5）：声明后该列相邻同值行纵向合并 */
  mergeCells?: boolean
}
