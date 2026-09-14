<script setup lang="ts">
import { formatDateTimeCell } from '@/utils/recordRow'
import { formatMoney } from '@/utils/formatMoney'
import { resolveEnumColor, resolveEnumTagStyle } from '@/utils/enumTag'
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { VxeTable, VxeColumn } from 'vxe-table'
import { VxeLoading, getI18n } from 'vxe-pc-ui'
import 'vxe-table/lib/style.css'
import 'vxe-pc-ui/lib/style.css'
import type { VxeTableInstance } from 'vxe-table'
import { ElPopover, ElInput, ElCheckbox, ElCheckboxGroup, ElButton, ElSwitch } from 'element-plus'
import { candidateService } from '@/services/api/candidateService'
import { recordService } from '@/services/api/recordService'
import { mediaService } from '@/services/api/mediaService'
import MediaImageCell from '@/components/field/MediaImageCell.vue'
import MediaPickerDialog from '@/components/media/MediaPickerDialog.vue'
import QuickCreateDialog from '@/engine/dialogs/QuickCreateDialog.vue'
import type { CandidateOption, Condition, FilterClause, FieldValueCandidateOption } from '@/types'
import { evaluateCondition } from '@/utils/condition'

export interface WrapperColumn {
  field: string
  title: string
  width?: number
  fixed?: 'left' | 'right'
  sortable?: boolean
  visible: boolean
  align?: 'left' | 'center' | 'right'
  formatter?: (params: any) => string
  isAction?: boolean
  /** 危险操作样式（如标准删除操作） */
  actionDanger?: boolean
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
}

const ROW_HEIGHT = 44
const HEADER_HEIGHT = 49
const BORDER_HEIGHT = 1

const props = withDefaults(defineProps<{
  moduleId: string
  data: Record<string, unknown>[]
  columns: WrapperColumn[]
  loading?: boolean
  height?: string | number
  maxHeight?: string | number
  virtualScroll?: boolean
  editable?: boolean
  selectedRowId?: string | null
  sortConfig?: {
    field?: string
    order?: 'asc' | 'desc'
  }
  rowKey?: string
  columnDraggable?: boolean
  fixedRowCount?: number
  filterClauses?: FilterClause[]
  /** 是否渲染行首复选框列（用于批量操作，如批量删除） */
  showSelection?: boolean
}>(), {
  loading: false,
  virtualScroll: false,
  editable: false,
  selectedRowId: null,
  rowKey: '_recordId',
  columnDraggable: false,
  fixedRowCount: undefined,
  showSelection: false,
})

const emit = defineEmits<{
  'sort-change': [payload: { field: string; order: 'asc' | 'desc' | null }]
  'filter-change': [payload: { field: string; clause: FilterClause | null }]
  'row-click': [payload: { row: Record<string, unknown>; rowIndex: number }]
  'cell-click': [payload: { row: Record<string, unknown>; column: WrapperColumn; rowIndex: number; colIndex: number }]
  'cell-dblclick': [payload: { row: Record<string, unknown>; column: WrapperColumn; rowIndex: number }]
  'edit-activated': [payload: { row: Record<string, unknown>; column: WrapperColumn; rowIndex: number }]
  'edit-closed': [payload: { row: Record<string, unknown>; column: WrapperColumn; value: unknown }]
  'column-drag-end': [payload: { columns: WrapperColumn[]; newOrder: string[] }]
  'row-action': [payload: { row: Record<string, unknown>; actionId: string }]
  'relation-click': [payload: { row: Record<string, unknown>; column: WrapperColumn }]
  'inline-edit': [payload: { row: Record<string, unknown>; field: string; value: unknown; oldValue: unknown }]
  'selection-change': [rowIds: string[]]
}>()

const tableRef = ref<VxeTableInstance | null>(null)

const visibleColumns = computed(() => props.columns.filter(c => c.visible))
const relationColumns = computed(() => visibleColumns.value.filter(c => c.isRelation))
// 操作列（type:'action'）：独立渲染为固定右侧的标准操作列，不参与排序/隐藏/拖拽
const opColumns = computed(() => visibleColumns.value.filter(c => c.isAction))
const dataColumns = computed(() => visibleColumns.value.filter(c => !c.isRelation && !c.isAction))
/**
 * 操作列宽度 = 两侧留白 + 各按钮实测文本宽之和 + 按钮间距。
 *
 * 历史两版都是静态估算（先 80/按钮，后 48/按钮与字段显式 width 取大），短文案按钮
 * 实际只有 2~4 字，静态值让操作列长期比内容宽出一倍。现按 canvas measureText 以
 * .op-link 实际字体逐按钮测宽（中英混排皆准），字段显式 width 不再参与计价；
 * 行级 visibleWhen 只会隐藏按钮，计价恒按全量按钮集合（最坏行）取值。
 */
const OP_COLUMN_PADDING = 16
/** 操作按钮间距 */
const OP_LINK_GAP = 12

let opTextCtx: CanvasRenderingContext2D | null | undefined
/** 以 .op-link 实际字体（token：--sg-font-size-md + --sg-font-family）测按钮文本宽 */
function measureOpTextWidth(text: string): number {
  if (!text) return 0
  if (opTextCtx === undefined) {
    opTextCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  }
  if (!opTextCtx) return text.length * 13
  const s = getComputedStyle((tableRef.value?.$el as HTMLElement | undefined) ?? document.documentElement)
  opTextCtx.font = `${s.getPropertyValue('--sg-font-size-md').trim() || '13px'} ${s.getPropertyValue('--sg-font-family').trim() || 'sans-serif'}`
  return opTextCtx.measureText(text).width
}

const opColumnWidth = computed(() => {
  const buttons = opColumns.value
  if (buttons.length === 0) return 0
  // 计价取「行内实际同时可见按钮集合」中的最宽者：行级 visibleWhen 让多数行只渲染
  // 全量按钮的子集（如账号行恒为 重置密码+冻结|解冻+解锁、不含解绑微信），按全量
  // 集合计价会让操作列在每行都空出一截。无数据行时回退全量集合（旧的最坏行口径）。
  let priced = buttons
  if (props.data.length > 0) {
    let maxWidth = -1
    for (const row of props.data) {
      const ops = visibleOps(row)
      const width = ops.reduce((s, c) => s + measureOpTextWidth(c.title), 0)
      if (width > maxWidth) {
        maxWidth = width
        priced = ops
      }
    }
    if (priced.length === 0) priced = buttons
  }
  const content = priced.reduce((w, c) => w + measureOpTextWidth(c.title), 0)
  return Math.ceil(OP_COLUMN_PADDING * 2 + OP_LINK_GAP * (priced.length - 1) + content)
})

/** 逐行求值操作按钮显隐：声明了 visibleWhen 的按钮按行数据过滤，未声明的恒可见 */
function visibleOps(row: Record<string, unknown>): WrapperColumn[] {
  return opColumns.value.filter(
    c => !c.actionVisibleWhen || evaluateCondition(c.actionVisibleWhen, { record: row, global: {} }),
  )
}

const headerMenuField = ref<string | null>(null)
const headerMenuKeyword = ref('')
const headerMenuOptions = ref<FieldValueCandidateOption[]>([])
const headerMenuSelectedKeys = ref<string[]>([])
const headerMenuLoading = ref(false)
const headerMenuPage = ref(1)
const headerMenuHasMore = ref(false)

/** 表头筛选模式：keyword=关键词包含匹配（默认）；candidates=候选值多选；range=时间段（date/datetime 列专用） */
type HeaderFilterMode = 'keyword' | 'candidates' | 'range'
const headerFilterMode = ref<HeaderFilterMode>('keyword')
const headerFilterRange = ref<[string, string] | null>(null)

function onRangePick(val: [string, string] | null): void {
  headerFilterRange.value = val
}

/** 时间段快捷预设：一键填充并应用（订单管理等按天/周/月看数据的最高频动作） */
const RANGE_PRESETS = [
  { key: 'today', label: '本日' },
  { key: 'yesterday', label: '昨日' },
  { key: 'last7', label: '近7天' },
  { key: 'week', label: '本周' },
  { key: 'lastweek', label: '上周' },
  { key: 'month', label: '本月' },
  { key: 'lastmonth', label: '上月' },
] as const

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}
function fmtDay(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function presetRange(key: string): [Date, Date] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const DAY = 86400000
  const mondayOf = (d: Date, weeksAgo = 0): Date => {
    const dow = (d.getDay() + 6) % 7 // 周一=0（国内周起始惯例）
    return new Date(d.getTime() - (dow + weeksAgo * 7) * DAY)
  }
  switch (key) {
    case 'today': return [today, today]
    case 'yesterday': { const d = new Date(today.getTime() - DAY); return [d, d] }
    case 'last7': return [new Date(today.getTime() - 6 * DAY), today]
    case 'week': return [mondayOf(today), new Date(mondayOf(today).getTime() + 6 * DAY)]
    case 'lastweek': return [mondayOf(today, 1), new Date(mondayOf(today, 1).getTime() + 6 * DAY)]
    case 'month': return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0)]
    case 'lastmonth': return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0)]
    default: return [today, today]
  }
}

/** 应用时间段预设：按列的时间格式填充起止（date-only 补全天边界）并立即生效 */
function applyRangePreset(field: string, key: string): void {
  const col = props.columns.find(c => c.field === field)
  const dayOnly = isDateOnlyCol(col ?? {})
  const [s, e] = presetRange(key)
  headerFilterRange.value = dayOnly ? [fmtDay(s), fmtDay(e)] : [`${fmtDay(s)} 00:00:00`, `${fmtDay(e)} 23:59:59`]
  applyHeaderFilter(field)
}

function isDatetimeCol(col: { fieldType?: string }): boolean {
  return col.fieldType === 'date' || col.fieldType === 'datetime'
}
function isDateOnlyCol(col: { fieldType?: string }): boolean {
  return col.fieldType === 'date'
}
/** 数值型列（含金额/百分比/货币）：缺省关键词筛选，显式 filterCandidates 才覆盖为候选值 */
function isNumericCol(col: { fieldType?: string }): boolean {
  return col.fieldType === 'number' || col.fieldType === 'money' || col.fieldType === 'currency' || col.fieldType === 'percent'
}

/** 该列是否允许在弹层里切换「候选值/关键词」双模式：日期/数值列仅在显式声明候选值时开放 */
function modeSwitchable(col: { fieldType?: string; filterCandidates?: boolean }): boolean {
  if (col.filterCandidates) return true
  return !isDatetimeCol(col) && !isNumericCol(col)
}

const isCandidateMode = computed({
  get: () => headerFilterMode.value === 'candidates',
  set: (v: boolean) => {
    headerFilterMode.value = v ? 'candidates' : 'keyword'
  },
})

function facetValueKey(value: unknown): string {
  if (typeof value === 'string') return `s:${value}`
  if (typeof value === 'number') return `n:${value}`
  if (typeof value === 'boolean') return `b:${value}`
  return `o:${String(value)}`
}

function getHeaderFilterClause(field: string): FilterClause | undefined {
  return props.filterClauses?.find(c => c.field === field)
}

function initHeaderMenuForField(field: string): void {
  headerMenuField.value = field
  headerMenuOptions.value = []
  headerMenuPage.value = 1
  headerMenuHasMore.value = false

  // 先恢复既有子句对应的模式（between→时间段、like→关键词、in/eq→候选值勾选）
  const clause = getHeaderFilterClause(field)
  if (clause?.operator === 'between' && Array.isArray(clause.values)) {
    headerFilterMode.value = 'range'
    headerFilterRange.value = [String(clause.values[0] ?? ''), String(clause.values[1] ?? '')]
    return
  }
  if (clause?.operator === 'like') {
    headerFilterMode.value = 'keyword'
    headerMenuKeyword.value = typeof clause.value === 'string' ? clause.value : ''
    headerMenuSelectedKeys.value = []
    return
  }
  if (clause && (clause.operator === 'in' || clause.operator === 'notIn')) {
    headerFilterMode.value = 'candidates'
    const values = Array.isArray(clause.values) ? clause.values : []
    headerMenuSelectedKeys.value = values.map(v => facetValueKey(v))
    return
  }
  if (clause?.operator === 'eq') {
    headerFilterMode.value = 'candidates'
    headerMenuSelectedKeys.value = clause.value === undefined ? [] : [facetValueKey(clause.value)]
    return
  }

  // 无既有子句时的默认模式（Excel 式：打开即见去重候选值）：
  // - 数值/日期列缺省仍走关键词/时间段，仅显式声明 filterCandidates 才覆盖为候选值；
  // - 其余列（文本/枚举/外键/布尔）候选值优先，可经开关切回关键词。
  const col = props.columns.find(c => c.field === field)
  if (isDatetimeCol(col ?? {}) && !col?.filterCandidates) {
    headerFilterMode.value = 'range'
    headerFilterRange.value = null
    return
  }
  if (isNumericCol(col ?? {}) && !col?.filterCandidates) {
    headerFilterMode.value = 'keyword'
    headerMenuKeyword.value = ''
    headerMenuSelectedKeys.value = []
    return
  }
  headerFilterMode.value = 'candidates'
  headerMenuKeyword.value = ''
  headerMenuSelectedKeys.value = []
}

async function loadHeaderMenuOptions(reset: boolean): Promise<void> {
  const field = headerMenuField.value
  if (!field) return
  if (headerMenuLoading.value) return
  headerMenuLoading.value = true

  const filters = (props.filterClauses ?? []).filter(c => c.field !== field)
  const page = reset ? 1 : headerMenuPage.value

  try {
    const res = await recordService.listFieldValueCandidates({
      moduleId: props.moduleId,
      field,
      keyword: headerMenuKeyword.value || undefined,
      page,
      pageSize: 50,
      filters,
    })
    if (!res.success) return
    if (headerMenuField.value !== field) return

    const nextOptions = reset ? [] : [...headerMenuOptions.value]
    const existingKeys = new Set(nextOptions.map(o => facetValueKey(o.value)))
    for (const opt of res.data.options) {
      const key = facetValueKey(opt.value)
      if (!existingKeys.has(key)) {
        nextOptions.push(opt)
        existingKeys.add(key)
      }
    }

    headerMenuOptions.value = nextOptions
    headerMenuHasMore.value = res.data.hasMore
    headerMenuPage.value = page
  } finally {
    headerMenuLoading.value = false
  }
}

function handleHeaderPopoverVisibleChange(field: string, visible: boolean): void {
  if (visible) {
    initHeaderMenuForField(field)
    // 候选值模式才需要拉取候选值；关键词模式零请求
    if (headerFilterMode.value === 'candidates') {
      loadHeaderMenuOptions(true)
    }
    return
  }
  if (headerMenuField.value === field) {
    headerMenuField.value = null
  }
}

// 切到候选值模式时按需加载候选值（首次打开为关键词模式时不发请求）
watch(headerFilterMode, (mode) => {
  if (!headerMenuField.value) return
  if (mode === 'candidates' && !headerMenuLoading.value && headerMenuOptions.value.length === 0) {
    headerMenuPage.value = 1
    void loadHeaderMenuOptions(true)
  }
})

let headerKeywordTimer: number | null = null
watch(headerMenuKeyword, () => {
  if (!headerMenuField.value) return
  // 关键词模式下输入即为目标筛选词，点「确定」才生效，不触发候选值搜索
  if (!isCandidateMode.value) return
  if (headerKeywordTimer !== null) window.clearTimeout(headerKeywordTimer)
  headerKeywordTimer = window.setTimeout(() => {
    if (!headerMenuField.value) return
    headerMenuPage.value = 1
    headerMenuOptions.value = []
    headerMenuHasMore.value = false
    loadHeaderMenuOptions(true)
  }, 250)
})

const headerSelectAll = computed(() => {
  if (headerMenuOptions.value.length === 0) return false
  return headerMenuSelectedKeys.value.length === headerMenuOptions.value.length
})

const headerSelectIndeterminate = computed(() => {
  if (headerMenuOptions.value.length === 0) return false
  return headerMenuSelectedKeys.value.length > 0 && headerMenuSelectedKeys.value.length < headerMenuOptions.value.length
})

function toggleHeaderSelectAll(checked: boolean): void {
  if (!checked) {
    headerMenuSelectedKeys.value = []
    return
  }
  headerMenuSelectedKeys.value = headerMenuOptions.value.map((o: FieldValueCandidateOption) => facetValueKey(o.value))
}

function loadMoreHeaderMenuOptions(): void {
  if (!headerMenuHasMore.value || headerMenuLoading.value) return
  headerMenuPage.value += 1
  loadHeaderMenuOptions(false)
}

function applyHeaderSort(field: string, order: 'asc' | 'desc' | null): void {
  emit('sort-change', { field, order })
  headerMenuField.value = null
}

function applyHeaderFilter(field: string): void {
  if (headerFilterMode.value === 'range') {
    // 时间段筛选：起止齐全 → between 子句；任一为空 → 清除该列筛选。
    // date 列产出日期-only 值：start 补 00:00:00、end 补 23:59:59，
    // 使后端 gte/lte 边界语义与「按天选择」直觉一致（否则 lte=当天00:00 会排除当天）。
    const rv = headerFilterRange.value
    if (!rv || !rv[0] || !rv[1]) {
      emit('filter-change', { field, clause: null })
    } else {
      const col = props.columns.find(c => c.field === field)
      const dayOnly = isDateOnlyCol(col ?? {})
      const startVal = dayOnly && /^\d{4}-\d{2}-\d{2}$/.test(rv[0]) ? `${rv[0]} 00:00:00` : rv[0]
      const endVal = dayOnly && /^\d{4}-\d{2}-\d{2}$/.test(rv[1]) ? `${rv[1]} 23:59:59` : rv[1]
      emit('filter-change', { field, clause: { field, operator: 'between', values: [startVal, endVal] } })
    }
    headerMenuField.value = null
    return
  }
  if (!isCandidateMode.value) {
    // 关键词筛选：非空 → like 子句；空 → 清除该列筛选
    const keyword = headerMenuKeyword.value.trim()
    if (!keyword) {
      emit('filter-change', { field, clause: null })
    } else {
      emit('filter-change', { field, clause: { field, operator: 'like', value: keyword } })
    }
    headerMenuField.value = null
    return
  }

  const keys = headerMenuSelectedKeys.value
  if (!keys || keys.length === 0) {
    emit('filter-change', { field, clause: null })
  } else {
    const map = new Map(headerMenuOptions.value.map(o => [facetValueKey(o.value), o.value]))
    const values = keys.map(k => map.get(k)).filter(v => v !== undefined)
    emit('filter-change', { field, clause: { field, operator: 'in', values } })
  }
  headerMenuField.value = null
}

function clearHeaderFilter(field: string): void {
  emit('filter-change', { field, clause: null })
  headerMenuField.value = null
}

const editingRowId = ref<string | null>(null)
const editingField = ref<string | null>(null)
const editValue = ref<any>('')
const fkOptions = ref<CandidateOption[]>([])
const fkOptionsCache = ref<Map<string, CandidateOption[]>>(new Map())
const resolvingFkIds = ref<Set<string>>(new Set())
const fkLoading = ref(false)
const fkSearchText = ref('')
const fkDropdownOpen = ref(false)
let fkTargetModule = ''

// fk 快速新建（col.quickCreate）：弹窗创建成功后把新记录置顶候选并自动选中，待用户确认落库
const fkQuickCreateVisible = ref(false)
const editingCol = computed(() => visibleColumns.value.find(c => c.field === editingField.value))

function openFkQuickCreate(): void {
  fkQuickCreateVisible.value = true
}

function handleFkQuickCreated(payload: { id: string; label: string; value: string }): void {
  fkQuickCreateVisible.value = false
  const opt: CandidateOption = { value: payload.value, label: payload.label }
  fkOptions.value = [opt, ...fkOptions.value.filter(o => o.value !== payload.value)]
  if (fkTargetModule) {
    const cache = new Map(fkOptionsCache.value)
    cache.set(fkTargetModule, fkOptions.value)
    fkOptionsCache.value = cache
  }
  editValue.value = payload.value
}

const fkFilteredOptions = computed(() => {
  const search = fkSearchText.value.toLowerCase().trim()
  if (!search) return fkOptions.value
  return fkOptions.value.filter(o => o.label.toLowerCase().includes(search))
})

function isEditing(rowId: string, field: string): boolean {
  return editingRowId.value === rowId && editingField.value === field
}

const EDIT_SCROLL_PADDING = 8

function ensureInlineEditorInView(): void {
  const root = wrapperRef.value
  if (!root) return

  const debugEnabled = typeof window !== 'undefined' && (
    (window as any).__SCHEMAGINE_VXE_DEBUG__ === true
    || window.localStorage?.getItem('SCHEMAGINE_VXE_DEBUG') === '1'
  )

  const editingCell = root.querySelector('.vxe-body--column.is-editing-cell') as HTMLElement | null
  if (!editingCell) return

  const bodyWrapper = (editingCell.closest('.vxe-table--body-wrapper') as HTMLElement | null)
    || (root.querySelector('.vxe-table--body-wrapper') as HTMLElement | null)
  if (!bodyWrapper) return

  const editor = editingCell.querySelector('.edit-inline') as HTMLElement | null
  if (!editor) return

  const dropdown = editingCell.querySelector('.fk-edit-dropdown') as HTMLElement | null
  const target = dropdown || editor

  const bodyRect = bodyWrapper.getBoundingClientRect()
  const horizontalScrollbarHeight = Math.max(0, bodyWrapper.offsetHeight - bodyWrapper.clientHeight)
  const targetRect = target.getBoundingClientRect()
  const topLimit = bodyRect.top + EDIT_SCROLL_PADDING
  const bottomLimit = bodyRect.bottom - EDIT_SCROLL_PADDING - horizontalScrollbarHeight

  if (targetRect.bottom > bottomLimit) {
    const delta = targetRect.bottom - bottomLimit
    const prevScrollTop = bodyWrapper.scrollTop
    bodyWrapper.scrollTop += delta
    const canScroll = bodyWrapper.scrollHeight > bodyWrapper.clientHeight + 1
    const didScroll = bodyWrapper.scrollTop !== prevScrollTop
    const flipY = !canScroll || !didScroll
    editingCell.classList.toggle('vxe-inline-flip-y', flipY)
    if (debugEnabled) {
      console.log('[VxeTableWrapper] ensureInlineEditorInView: scroll down', {
        delta,
        prevScrollTop,
        scrollTop: bodyWrapper.scrollTop,
        clientHeight: bodyWrapper.clientHeight,
        offsetHeight: bodyWrapper.offsetHeight,
        scrollHeight: bodyWrapper.scrollHeight,
        horizontalScrollbarHeight,
        canScroll,
        didScroll,
        flipY,
        bodyRect: { top: bodyRect.top, bottom: bodyRect.bottom, height: bodyRect.height },
        targetRect: { top: targetRect.top, bottom: targetRect.bottom, height: targetRect.height },
        topLimit,
        bottomLimit,
      })
    }
  }
  if (targetRect.top < topLimit) {
    const delta = topLimit - targetRect.top
    const prevScrollTop = bodyWrapper.scrollTop
    bodyWrapper.scrollTop -= delta
    editingCell.classList.remove('vxe-inline-flip-y')
    if (debugEnabled) {
      console.log('[VxeTableWrapper] ensureInlineEditorInView: scroll up', {
        delta,
        prevScrollTop,
        scrollTop: bodyWrapper.scrollTop,
        clientHeight: bodyWrapper.clientHeight,
        offsetHeight: bodyWrapper.offsetHeight,
        scrollHeight: bodyWrapper.scrollHeight,
        horizontalScrollbarHeight,
        bodyRect: { top: bodyRect.top, bottom: bodyRect.bottom, height: bodyRect.height },
        targetRect: { top: targetRect.top, bottom: targetRect.bottom, height: targetRect.height },
        topLimit,
        bottomLimit,
      })
    }
  }

  if (debugEnabled) {
    const cellRect = editingCell.getBoundingClientRect()
    console.log('[VxeTableWrapper] ensureInlineEditorInView: layout snapshot', {
      isDropdown: !!dropdown,
      bodyWrapperClass: bodyWrapper.className,
      bodyWrapperTag: bodyWrapper.tagName,
      bodyWrapperScrollTop: bodyWrapper.scrollTop,
      bodyWrapperClientHeight: bodyWrapper.clientHeight,
      bodyWrapperScrollHeight: bodyWrapper.scrollHeight,
      horizontalScrollbarHeight,
      cellRect: { top: cellRect.top, bottom: cellRect.bottom, height: cellRect.height },
      bodyRect: { top: bodyRect.top, bottom: bodyRect.bottom, height: bodyRect.height },
      targetRect: { top: targetRect.top, bottom: targetRect.bottom, height: targetRect.height },
      topLimit,
      bottomLimit,
    })
  }
}

function focusInlineEditor(): void {
  const root = wrapperRef.value
  if (!root) return

  const editingCell = root.querySelector('.vxe-body--column.is-editing-cell') as HTMLElement | null
  if (!editingCell) return

  const editor = editingCell.querySelector('.edit-inline') as HTMLElement | null
  if (!editor) return

  const preferred = editor.querySelector('.edit-inline__textarea, .edit-inline__input, .edit-inline__select, .fk-edit-trigger, .toggle-switch') as HTMLElement | null
  const fallback = editor.querySelector('input, textarea, select, button, [tabindex]:not([tabindex="-1"])') as HTMLElement | null
  const target = preferred || fallback
  target?.focus?.()
}

function getPercentageDisplayValue(raw: unknown): number {
  const num = Number(raw)
  return isNaN(num) ? 0 : num * 100
}

function getDecimalPlaces(value: number): number {
  if (!isFinite(value)) return 0
  const str = String(value)
  const dotIndex = str.indexOf('.')
  if (dotIndex === -1) return 0
  const places = str.length - dotIndex - 1
  return places
}

function validateDecimal(value: unknown, col: WrapperColumn): string | null {
  if (value == null || value === '') return null
  if (col.fieldType !== 'number' && col.fieldType !== 'currency' && col.fieldType !== 'money' && col.fieldType !== 'percent') return null
  if (col.decimal == null) return null
  const num = Number(value)
  if (isNaN(num)) return null
  const actualPlaces = getDecimalPlaces(num)
  const mode = col.decimalMode ?? 'fixed'
  const maxDec = mode === 'range' ? (col.maxDecimal ?? col.decimal) : col.decimal
  if (actualPlaces <= maxDec) return null
  return `最多允许${maxDec}位小数，当前${actualPlaces}位`
}

async function startEdit(row: Record<string, unknown>, col: WrapperColumn): Promise<void> {
  // 双保险：绝对只读/有限编辑字段不进编辑态（正常路径已在 handleCellDblclick 拦截）
  if (col.readonly || col.editMode === 'limited') return
  const rowId = row[props.rowKey] as string
  editingRowId.value = rowId
  editingField.value = col.field
  if (col.fieldType === 'percent') {
    editValue.value = getPercentageDisplayValue(row[col.field])
  } else {
    editValue.value = row[col.field]
  }
  fkDropdownOpen.value = false
  fkSearchText.value = ''

  const debugEnabled = typeof window !== 'undefined' && (
    (window as any).__SCHEMAGINE_VXE_DEBUG__ === true
    || window.localStorage?.getItem('SCHEMAGINE_VXE_DEBUG') === '1'
  )
  if (debugEnabled) {
    console.log('[VxeTableWrapper] startEdit', {
      rowId,
      field: col.field,
      fieldType: col.fieldType,
      width: col.width,
    })
  }

  void nextTick().then(() => {
    ensureInlineEditorInView()
    focusInlineEditor()
  })

  if (col.fieldType === 'fk' && col.targetModule) {
    fkTargetModule = col.targetModule
    const cached = fkOptionsCache.value.get(col.targetModule)
    if (cached) {
      fkOptions.value = cached
    } else {
      fkLoading.value = true
      try {
        const res = await candidateService.query({
          targetModule: col.targetModule,
          page: 1,
          pageSize: 500,
        })
        if (res.success) {
          fkOptions.value = res.data.options
          const cache = new Map(fkOptionsCache.value)
          cache.set(col.targetModule, res.data.options)
          fkOptionsCache.value = cache
        }
      } finally {
        fkLoading.value = false
      }
    }
  }
}

function confirmEdit(row: Record<string, unknown>, col: WrapperColumn): void {
  let val = editValue.value
  if (col.fieldType === 'percent') {
    val = Number(val) / 100
  }
  const error = validateDecimal(val, col)
  if (error) {
    cancelEdit()
    import('element-plus').then(({ ElMessage }) => {
      ElMessage.warning(`${col.title}: ${error}`)
    })
    return
  }
  const field = col.field
  const oldValue = row[field]
  if (val !== oldValue && !(val === '' && oldValue == null)) {
    emit('inline-edit', { row, field, value: val, oldValue })
    row[field] = val
  }
  editingRowId.value = null
  editingField.value = null
}

function onTextareaEnter(e: KeyboardEvent, row: Record<string, unknown>, col: WrapperColumn): void {
  if (e.ctrlKey || e.metaKey) {
    return
  }
  e.preventDefault()
  confirmEdit(row, col)
}

function cancelEdit(): void {
  editingRowId.value = null
  editingField.value = null
  fkSearchText.value = ''
  fkDropdownOpen.value = false
}

function toggleEditValue(): void {
  editValue.value = !editValue.value
}

function getFkLabel(value: unknown): string {
  if (value == null || value === '') return ''
  const idStr = String(value)
  const opt = fkOptions.value.find(o => String(o.value) === idStr)
  return opt?.label || String(value)
}

function toggleFkDropdown(): void {
  fkDropdownOpen.value = !fkDropdownOpen.value
  if (fkDropdownOpen.value) {
    fkSearchText.value = ''
    nextTick(() => {
      ensureInlineEditorInView()
      const input = document.querySelector('.fk-edit-search-input') as HTMLInputElement | null
      input?.focus()
    })
  }
}

function closeFkDropdown(): void {
  fkDropdownOpen.value = false
  fkSearchText.value = ''
}

function selectFkOption(opt: CandidateOption): void {
  editValue.value = opt.value
  fkDropdownOpen.value = false
  fkSearchText.value = ''
}

function clearFkSelection(): void {
  editValue.value = ''
}

// ---- mediaImage 行内编辑：媒体库选择 / 上传新资源 / 清除 ----
const mediaPickerVisible = ref(false)
const mediaUploading = ref(false)
const mediaFileInput = ref<HTMLInputElement | null>(null)

function openMediaPicker(): void {
  mediaPickerVisible.value = true
}

function onMediaPicked(asset: { id: string }): void {
  editValue.value = asset.id
}

function triggerMediaUpload(e?: Event): void {
  // VxeTable 把单元格 slot 挂到内部单元格实例，template ref 解析不到父组件 setup 作用域；
  // 且列表有多行 media-edit，必须就近定位「被点按钮所在行」的 input，避免点到别的行。
  // 用真实事件 target（永不为 null）沿 .media-edit 向上找本行 input，比 ref/currentTarget 都稳。
  let input: HTMLInputElement | null = null
  const el = (e?.target ?? e?.currentTarget) as HTMLElement | null
  const container = el?.closest('.media-edit') as HTMLElement | null
  if (container) {
    input = container.querySelector('input[type="file"]') as HTMLInputElement | null
  }
  if (!input) input = mediaFileInput.value
  input?.click()
}

function onMediaFileChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  mediaUploading.value = true
  mediaService
    .upload(file)
    .then((res) => {
      if (res.success) {
        editValue.value = res.data.id
      } else {
        import('element-plus').then(({ ElMessage }) => ElMessage.error(res.message || '上传失败'))
      }
    })
    .finally(() => {
      mediaUploading.value = false
    })
}

function clearMediaSelection(): void {
  editValue.value = ''
}

// ===== 截断单元格内容查看：单击省略单元格原地弹出完整内容 =====
// 动机：列宽不足时长值被省略，原生 title 悬停提示慢且不可复制；原地展开会撑开行高，
// 且仍受列宽约束。自管浮层（Teleport+fixed 定位）以单元格为锚，开关只由 cellDetail
// 单一状态机决定——不用 el-popover 的 trigger/click-outside 机制：换格点击时旧弹层的
// 外点关闭会在新弹层打开后再次触发，把刚打开的弹层秒关（事件周期冲突）。
// 宽度策略：随内容自适应（width:max-content），上限 400px（.schemagine-cell-detail-panel 样式）。
const CELL_DETAIL_GAP = 6
const cellDetail = ref<{
  visible: boolean
  triggerEl: HTMLElement | null
  title: string
  content: string
}>({ visible: false, triggerEl: null, title: '', content: '' })
const cellDetailPanelRef = ref<HTMLDivElement | null>(null)
const cellDetailPos = ref<{ left: number; top: number }>({ left: 0, top: 0 })

/** 单元格展示全文（与列渲染同口径：datetime 走专用格式化，fk 直读缓存避免 formatDisplay 的 HTML 转义，其余走 formatDisplay） */
function getCellDetailText(row: Record<string, unknown>, col: WrapperColumn): string {
  const value = row[col.field]
  if (value == null || value === '') return ''
  if (col.fieldType === 'datetime' || col.fieldType === 'date') {
    return formatDateTimeCell(value, col.fieldType)
  }
  if (col.fieldType === 'fk' && col.targetModule) {
    const cached = fkOptionsCache.value.get(col.targetModule)
    const opt = cached?.find(o => String(o.value) === String(value))
    return opt ? opt.label : String(value)
  }
  return formatDisplay(value, col)
}

function closeCellDetail(): void {
  cellDetail.value = { visible: false, triggerEl: null, title: '', content: '' }
}

/** 渲染后按锚单元格定位：贴下方起始，空间不足翻到上方，左右夹在视口内 */
function positionCellDetailPanel(): void {
  const el = cellDetail.value.triggerEl
  const panel = cellDetailPanelRef.value
  if (!el || !panel) return
  const r = el.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pw = panel.offsetWidth
  const ph = panel.offsetHeight
  const left = Math.min(Math.max(r.left, 8), Math.max(8, vw - pw - 8))
  let top = r.bottom + CELL_DETAIL_GAP
  if (top + ph > vh - 8) {
    top = r.top - ph - CELL_DETAIL_GAP
    if (top < 8) top = Math.max(8, vh - ph - 8)
  }
  cellDetailPos.value = { left: Math.round(left), top: Math.round(top) }
}

/** 溢出判定：裁剪可能发生在 .vxe-cell 或其带 ellipsis 的后代（如 .cell-value span）上，须逐层检查 */
function isContentTruncated(root: HTMLElement | null): boolean {
  if (!root) return false
  if (root.scrollWidth > root.clientWidth + 1) return true
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (el.scrollWidth > el.clientWidth + 1) return true
  }
  return false
}

/** 单击单元格时尝试打开内容浮层：仅当内容真的被省略（横向溢出）时弹出 */
function maybeOpenCellDetail(params: any, col: WrapperColumn): void {
  // 媒体/图片单元格无可省略文本；编辑态单元格交给行内编辑器
  if (col.isAction || col.fieldType === 'mediaImage' || col.fieldType === 'image' || col.fieldType === 'attachment') return
  if (isEditing(params.row[props.rowKey], col.field)) return
  const cellEl = (tableRef.value?.getCellElement(params.row, params.column) as HTMLElement | null) ?? null
  // 再点同一格 → 收起（点外部/其他格的收起走 onCellDetailOutsidePointerDown，不与此处竞争）
  if (cellDetail.value.visible && cellDetail.value.triggerEl && cellDetail.value.triggerEl === cellEl) {
    closeCellDetail()
    return
  }
  const inner = cellEl?.querySelector('.vxe-cell') as HTMLElement | null
  const text = getCellDetailText(params.row, col)
  if (!text || !isContentTruncated(inner)) {
    closeCellDetail()
    return
  }
  cellDetail.value = { visible: true, triggerEl: cellEl, title: col.title, content: text }
  void nextTick(positionCellDetailPanel)
}

async function copyCellDetail(): Promise<void> {
  const text = cellDetail.value.content
  if (!text) return
  const { ElMessage } = await import('element-plus')
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch {
    // 非安全上下文（http 内网部署）无 navigator.clipboard，回落隐藏 textarea + execCommand
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      if (document.execCommand('copy')) {
        ElMessage.success('已复制')
      } else {
        ElMessage.error('复制失败，请手动选择复制')
      }
    } catch {
      ElMessage.error('复制失败，请手动选择复制')
    } finally {
      ta.remove()
    }
  }
}

function onCellDetailKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeCellDetail()
}

// 浮层打开期间的点外部收起：面板内部与锚单元格自身的 pointerdown 忽略
// （锚单元格忽略是为了让单击切换语义完整到达 maybeOpenCellDetail 的同格判断）
function onCellDetailOutsidePointerDown(e: PointerEvent): void {
  const target = e.target as Node | null
  if (!target) return
  if (cellDetailPanelRef.value?.contains(target)) return
  if (cellDetail.value.triggerEl?.contains(target)) return
  closeCellDetail()
}

// 任意容器滚动（表体/页面容器）都可能让锚易位或错位，统一收起；面板内部滚动除外
function onCellDetailScroll(e: Event): void {
  const target = e.target as Node | null
  if (target && cellDetailPanelRef.value?.contains(target)) return
  closeCellDetail()
}

function onCellDetailResize(): void {
  closeCellDetail()
}

watch(() => cellDetail.value.visible, (v) => {
  if (v) {
    window.addEventListener('keydown', onCellDetailKeydown, true)
    window.addEventListener('pointerdown', onCellDetailOutsidePointerDown, true)
    window.addEventListener('scroll', onCellDetailScroll, true)
    window.addEventListener('resize', onCellDetailResize)
  } else {
    window.removeEventListener('keydown', onCellDetailKeydown, true)
    window.removeEventListener('pointerdown', onCellDetailOutsidePointerDown, true)
    window.removeEventListener('scroll', onCellDetailScroll, true)
    window.removeEventListener('resize', onCellDetailResize)
  }
})

function handleSortChange(params: any): void {
  const { field, order } = params
  emit('sort-change', { field, order: order || null })
}

function handleCellClick(params: any): void {
  emit('row-click', { row: params.row, rowIndex: params.rowIndex })
  const col = visibleColumns.value.find(c => c.field === params.column.field)
  if (!col) return
  if (col.isRelation) {
    emit('relation-click', { row: params.row, column: col })
    return
  }
  // 截断内容查看与 cell-click 上抛互不影响（宿主监听仍照常触发）
  maybeOpenCellDetail(params, col)
  emit('cell-click', { row: params.row, column: col, rowIndex: params.rowIndex, colIndex: params.column.index })
}

function handleOpClick(row: Record<string, unknown>, col: WrapperColumn): void {
  // 标准删除操作统一以 'delete' 作为 actionId 上抛，与字段 key 解耦
  emit('row-action', { row, actionId: col.actionDanger ? 'delete' : col.field })
}

function handleCellDblclick(params: any): void {
  const col = visibleColumns.value.find(c => c.field === params.column.field)
  if (!col) return
  // 双击即切换交互语义（进编辑/关联打开），内容浮层随之收起
  closeCellDetail()
  if (col.isRelation) {
    emit('relation-click', { row: params.row, column: col })
    return
  }
  if (col.isAction) return
  // readonly（绝对只读，任何权限不豁免）与 limited（有限编辑）字段禁止行内编辑：
  // readonly 与后端 editablePatch 的更新拦截对齐；limited 仅关闭行内入口
  if (col.readonly || col.editMode === 'limited') {
    emit('cell-dblclick', { row: params.row, column: col, rowIndex: params.rowIndex })
    return
  }
  if (props.editable) {
    startEdit(params.row, col)
    return
  }
  emit('cell-dblclick', { row: params.row, column: col, rowIndex: params.rowIndex })
}

function handleColumnDragEnd(params: any): void {
  const newOrder: string[] = params.columns.map((col: any) => col.field)
  emit('column-drag-end', { columns: props.columns, newOrder })
}

function handleSelectionChange(): void {
  const table = tableRef.value
  if (!table) {
    emit('selection-change', [])
    return
  }
  const records = (table.getCheckboxRecords() as Array<Record<string, unknown>>) ?? []
  const ids = records
    .map((r) => r[props.rowKey] as string)
    .filter((id): id is string => !!id)
  emit('selection-change', ids)
}

const wrapperRef = ref<HTMLDivElement | null>(null)
const observerHeight = ref(0)
const isObserving = ref(false)

let resizeObserver: ResizeObserver | null = null
let fkClickOutsideHandler: ((e: MouseEvent) => void) | null = null

function startObserving(): void {
  if (resizeObserver || !wrapperRef.value) return
  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const h = entry.contentRect.height
      if (h > 0) {
        observerHeight.value = Math.floor(h)
        isObserving.value = true
      }
    }
  })
  resizeObserver.observe(wrapperRef.value)
}

function stopObserving(): void {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
}

function bindFkClickOutside(): void {
  if (fkClickOutsideHandler) return
  fkClickOutsideHandler = (e: MouseEvent) => {
    if (fkDropdownOpen.value) {
      const target = e.target as HTMLElement | null
      if (target && !target.closest('.fk-edit-dropdown') && !target.closest('.fk-edit-trigger')) {
        closeFkDropdown()
      }
    }
  }
  document.addEventListener('click', fkClickOutsideHandler, true)
}

function unbindFkClickOutside(): void {
  if (fkClickOutsideHandler) {
    document.removeEventListener('click', fkClickOutsideHandler, true)
    fkClickOutsideHandler = null
  }
}

onMounted(() => {
  if (!props.fixedRowCount) {
    startObserving()
  }
  preloadFkOptions()
  bindFkClickOutside()
})

onUnmounted(() => {
  stopObserving()
  unbindFkClickOutside()
  // 内容浮层若在打开状态，随组件卸载摘除全部 window 监听
  window.removeEventListener('keydown', onCellDetailKeydown, true)
  window.removeEventListener('pointerdown', onCellDetailOutsidePointerDown, true)
  window.removeEventListener('scroll', onCellDetailScroll, true)
  window.removeEventListener('resize', onCellDetailResize)
})

function preloadFkOptions(): void {
  const fkColumns = props.columns.filter(c => c.fieldType === 'fk' && c.targetModule)
  for (const col of fkColumns) {
    const module = col.targetModule!
    reloadFkOptionsForModule(module)
  }
}

async function reloadFkOptionsForModule(module: string): Promise<void> {
  try {
    const res = await candidateService.query({
      targetModule: module,
      page: 1,
      pageSize: 500,
    })
    if (res.success) {
      const cache = new Map(fkOptionsCache.value)
      cache.set(module, res.data.options)
      fkOptionsCache.value = cache
    }
  } catch {
    // keep existing cache on error
  }
}

async function resolveFkLabel(targetModule: string, id: string): Promise<void> {
  const dedupeKey = `${targetModule}:${id}`
  if (resolvingFkIds.value.has(dedupeKey)) return
  // 已缓存（含失败 fallback）则不再请求，避免重渲染时无限重试
  const cached = fkOptionsCache.value.get(targetModule)
  if (cached && cached.some(o => String(o.value) === id)) return
  resolvingFkIds.value = new Set([...resolvingFkIds.value, dedupeKey])

  let resolvedLabel: string | null = null
  try {
    const res = await recordService.getDetail(targetModule, id)
    if (res.success) {
      const record = res.data
      const labelField = record.fields.name ?? record.fields.label ?? record.fields.title
      if (typeof labelField === 'string') resolvedLabel = labelField
    }
  } catch {
    // keep showing raw value
  } finally {
    // 无论成功失败都写入 fallback 缓存：成功用真实 label，失败用原始 id
    // 这样下次 formatDisplay 命中缓存，不再触发请求
    const label = resolvedLabel ?? id
    const newOpt: CandidateOption = { value: id, label }
    const cache = new Map(fkOptionsCache.value)
    const existing = cache.get(targetModule) || []
    if (!existing.some(o => String(o.value) === id)) {
      cache.set(targetModule, [newOpt, ...existing])
    }
    fkOptionsCache.value = cache
    const next = new Set(resolvingFkIds.value)
    next.delete(dedupeKey)
    resolvingFkIds.value = next
  }
}

watch(() => props.data, () => {
  // 数据刷新会整体重渲染行，浮层锚元素随时失效，先行收起
  closeCellDetail()
  const fkColumns = props.columns.filter(c => c.fieldType === 'fk' && c.targetModule)
  for (const col of fkColumns) {
    reloadFkOptionsForModule(col.targetModule!)
  }
})

const tableHeight = computed(() => {
  if (props.fixedRowCount) {
    return HEADER_HEIGHT + props.fixedRowCount * ROW_HEIGHT + BORDER_HEIGHT
  }
  if (isObserving.value && observerHeight.value > 0) {
    return observerHeight.value
  }
  return props.height
})

const tableMaxHeight = computed(() => {
  if (props.fixedRowCount) return undefined
  return props.maxHeight
})

function clearSort(): void {
  tableRef.value?.clearSort()
}

function getTableRef(): VxeTableInstance | null {
  return tableRef.value
}

function getCellClassName({ row, column }: any): string {
  const col = visibleColumns.value.find((c: WrapperColumn) => c.field === column.field)
  const classes: string[] = []
  if (col?.isAction) classes.push('action-cell')
  if (col?.isRelation) classes.push('relation-cell')
  if (col && isEditing(row[props.rowKey], col.field)) classes.push('is-editing-cell')
  if (col?.cellClass) {
    const value = row[column.field]
    classes.push(col.cellClass({ value }))
  }
  return classes.filter(Boolean).join(' ')
}

function getRowClassName({ row }: any): string {
  const classes: string[] = []
  if (editingRowId.value && editingRowId.value === row[props.rowKey]) classes.push('is-editing-row')
  if (props.selectedRowId && props.selectedRowId === row[props.rowKey]) classes.push('is-selected-row')
  return classes.join(' ')
}

// 列拖拽提示：vxe 默认读取表头单元格 textContent，会把自定义表头里的
// 筛选/排序下拉按钮（▼）一并带入，这里显式只取列名
function columnDragTooltipMethod({ column }: { column: { title?: string | number } }): string {
  return getI18n('vxe.table.dragTip', [String(column?.title ?? '')]) as string
}

function handleRelationClick(col: WrapperColumn, row: Record<string, unknown>): void {
  emit('relation-click', { row, column: col })
}

function relationFormatter(col: WrapperColumn): string {
  return col.formatter ? col.formatter({ cellValue: undefined, row: {}, column: col }) : '查看'
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getFilterClause(col: WrapperColumn): FilterClause | undefined {
  if (!props.filterClauses) return undefined
  return props.filterClauses.find(c => c.field === col.field)
}

function hasFilterMatch(col: WrapperColumn): boolean {
  return !!getFilterClause(col)
}

function getCellHighlightHtml(value: unknown, col: WrapperColumn): string {
  const clause = getFilterClause(col)
  if (!clause) return escapeHtml(formatDisplay(value, col))

  const textValue = formatDisplay(value, col)
  if (!textValue) return ''

  const defaultStyle = 'background:var(--sg-color-highlight);color:var(--sg-color-on-highlight);font-weight:bold;padding:0 var(--sg-spacing-1);border-radius:var(--sg-radius-xs)'
  const style = col.highlightStyle || defaultStyle
  const escaped = escapeHtml(textValue)

  if (clause.operator === 'like' && clause.value != null) {
    const keyword = String(clause.value)
    if (!keyword) return escaped
    const regex = new RegExp(`(${escapeRegex(keyword)})`, 'gi')
    const html = escaped.replace(regex, (match) => `<span class="filter-match-highlight" style="${style}">${match}</span>`)
    if (html !== escaped) return html
  }

  return `<span class="filter-match-highlight" style="${style}">${escaped}</span>`
}

/** boolean 列默认状态配色：是=绿 / 否=红；业务可用 trueLabelClass/falseLabelClass 覆盖（如灰色预设 cell-boolean--neutral） */
function getBooleanStateClass(value: unknown): string {
  return value ? 'cell-boolean--yes' : 'cell-boolean--no'
}

/** select / multi-select / status 三类枚举列（有候选值或 statusMap 才可能出彩色标签） */
function isEnumColumn(col: WrapperColumn): boolean {
  return (col.fieldType === 'select' || col.fieldType === 'multi-select' || col.fieldType === 'status')
    && (!!col.selectOptions && col.selectOptions.length > 0 || !!col.statusMap)
}

/** 任一取值声明了颜色才走彩色标签通道，其余完全回落既有渲染（零声明零变化） */function hasEnumTagStyle(value: unknown, col: WrapperColumn): boolean {
  if (value == null || value === '') return false
  const parts = Array.isArray(value) ? value : [value]
  return parts.some(part => resolveEnumColor(part, col.selectOptions, col.statusMap) != null)
}

/**
 * 枚举列单元格 HTML：逐值渲染彩色标签（声明了颜色的用取色三件套，
 * 未声明的取值回落默认蓝标签样式类）。
 */
function getEnumCellHtml(value: unknown, col: WrapperColumn): string {
  const parts = Array.isArray(value) ? value : [value]
  return parts
    .map(part => {
      const label = escapeHtml(formatDisplay(part, col))
      const style = resolveEnumTagStyle(resolveEnumColor(part, col.selectOptions, col.statusMap))
      const css = style
        ? ` style="background:${style.background};color:${style.color};border-color:${style.borderColor}"`
        : ''
      return `<span class="cell-tag"${css}>${label}</span>`
    })
    .join('')
}

function formatDisplay(value: unknown, col: WrapperColumn): string {
  // 操作列（type:'action'）没有底层数据值，必须优先用 formatter 渲染动作标签（如「删除」），
  // 否则 value==null 会提前返回空字符串导致单元格空白。
  if (col.formatter) {
    return col.formatter({ cellValue: value })
  }
  if (value == null) return ''
  if (col.fieldType === 'boolean') {
    return value ? (col.trueLabel || '是') : (col.falseLabel || '否')
  }
  // money：默认两位小数，源数据存在更高位有效小数时按实际位数展示（口径见 utils/formatMoney）
  if (col.fieldType === 'money') {
    return formatMoney(value)
  }
  if (col.fieldType === 'percent') {
    const num = Number(value)
    const decimal = col.decimal ?? 0
    const mode = col.decimalMode ?? 'fixed'
    if (mode === 'max') {
      return isNaN(num) ? String(value) : `${(num * 100).toString()}%`
    }
    return isNaN(num) ? String(value) : `${(num * 100).toFixed(decimal)}%`
  }
  if (col.fieldType === 'fk' && col.targetModule) {
    const cachedOptions = fkOptionsCache.value.get(col.targetModule)
    if (cachedOptions) {
      // 统一转 string 比较：后端 FK 字段值可能是 number，而缓存 option.value 是 string
      const idStr = String(value)
      const opt = cachedOptions.find(o => String(o.value) === idStr)
      if (opt) return opt.label
    }
    resolveFkLabel(col.targetModule, String(value))
    return escapeHtml(String(value))
  }
  if (col.selectOptions) {
    if (Array.isArray(value)) {
      return value.map(v => {
        const opt = col.selectOptions!.find(o => o.value === v)
        return opt?.label || String(v)
      }).join(', ')
    }
    const opt = col.selectOptions.find(o => o.value === value)
    return opt?.label || String(value)
  }
  return String(value)
}

function openImage(src: unknown): void {
  const s = src == null ? '' : String(src)
  if (s) window.open(s, '_blank', 'noopener')
}

defineExpose({
  clearSort,
  getTableRef,
})
</script>

<template>
  <div
    ref="wrapperRef"
    class="vxe-table-wrapper"
    :class="{ 'is-auto-fill': !fixedRowCount }"
  >
    <VxeTable
      ref="tableRef"
      :data="data"
      :height="tableHeight"
      :max-height="tableMaxHeight"
      :row-config="{ keyField: rowKey, isHover: true }"
      :row-class-name="getRowClassName"
      :sort-config="{ trigger: 'default', remote: true, defaultSort: sortConfig as any, showIcon: false, multiple: false }"
      :keep-source="true"
      :column-config="{ drag: columnDraggable }"
      :column-drag-config="{ tooltipMethod: columnDragTooltipMethod }"
      :cell-class-name="getCellClassName"
      :align="'left'"
      :show-overflow="'title'"
      :border="'inner'"
      :stripe="false"
      :checkbox-config="{ highlight: true }"
      @sort-change="handleSortChange"
      @cell-click="handleCellClick"
      @cell-dblclick="handleCellDblclick"
      @column-drag-end="handleColumnDragEnd"
      @checkbox-change="handleSelectionChange"
      @checkbox-all="handleSelectionChange"
    >
      <template v-if="loading" #loading>
        <VxeLoading />
      </template>
      <!-- 行首复选框列：仅在需要批量操作（如批量删除）时显示 -->
      <VxeColumn v-if="showSelection" type="checkbox" width="48" fixed="left" />
      <!-- 数据列：view 模式显示值，edit 模式显示编辑器 -->
      <VxeColumn
        v-for="col in dataColumns"
        :key="col.field"
        :field="col.field"
        :title="col.title"
        :width="col.width"
        :min-width="col.minWidth"
        :fixed="col.fixed"
        :sortable="col.sortable"
        :align="col.align || 'left'"
      >
        <template #header="hdrParams">
          <div class="schema-header-cell" @click.stop>
            <span class="schema-header-cell__title">{{ col.title }}</span>
            <!-- vxe-table 固定列会把整份表头克隆到 fixed-wrapper（isHidden 列仅 visibility:hidden 但保留布局坐标），
                 克隆份若也挂 popover，受控 visible 会两份同开，且克隆份定位偏移到表格外侧 -->
            <ElPopover
              v-if="!hdrParams?.isHidden"
              trigger="click"
              placement="bottom-start"
              :width="320"
              :teleported="true"
              popper-class="schemagine-header-popover"
              :z-index="4000"
              :visible="headerMenuField === col.field"
              @update:visible="(v: boolean) => handleHeaderPopoverVisibleChange(col.field, v)"
            >
              <template #reference>
                <button
                  type="button"
                  class="schema-header-cell__arrow"
                  :class="{ 'is-active': !!getHeaderFilterClause(col.field) || (sortConfig?.field === col.field) }"
                  aria-label="筛选与排序"
                  @click.stop
                >▼</button>
              </template>

              <div class="header-popover">
                <div class="header-popover__sort">
                  <ElButton size="small" type="success" plain @click="applyHeaderSort(col.field, 'asc')">
                    <span class="sort-icon sort-icon--asc">↑</span>
                    升序
                  </ElButton>
                  <ElButton size="small" type="danger" plain @click="applyHeaderSort(col.field, 'desc')">
                    <span class="sort-icon sort-icon--desc">↓</span>
                    降序
                  </ElButton>
                  <ElButton size="small" text type="info" @click="applyHeaderSort(col.field, null)">
                    <span class="sort-icon sort-icon--clear">×</span>
                    清除排序
                  </ElButton>
                </div>

                <div class="header-popover__filter">
                  <div class="header-popover__filter-title">
                    <span>{{ isCandidateMode ? '候选值筛选' : (isDatetimeCol(col) ? '时间段筛选' : '内容筛选') }}</span>
                    <label v-if="modeSwitchable(col)" class="header-popover__mode-switch" @click.stop>
                      <span class="header-popover__mode-label">候选值模式</span>
                      <ElSwitch v-model="isCandidateMode" size="small" />
                    </label>
                  </div>
                  <!-- 时间段筛选（range 模式，date/datetime 列专用）：起止闭区间，between 子句。
                       显式 filterCandidates 的日期列默认候选值模式，经开关切回 range 才渲染此分支 -->
                  <template v-if="headerFilterMode === 'range'">
                    <ElDatePicker
                      :model-value="headerFilterRange"
                      :type="isDateOnlyCol(col) ? 'daterange' : 'datetimerange'"
                      :format="isDateOnlyCol(col) ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss'"
                      :value-format="isDateOnlyCol(col) ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss'"
                      range-separator="至"
                      :start-placeholder="isDateOnlyCol(col) ? '开始日期' : '开始时间'"
                      :end-placeholder="isDateOnlyCol(col) ? '结束日期' : '结束时间'"
                      :default-time="isDateOnlyCol(col) ? undefined : [new Date(2000, 0, 1, 0, 0, 0), new Date(2000, 0, 1, 23, 59, 59)]"
                      size="small"
                      clearable
                      :teleported="false"
                      style="width: 280px"
                      @update:model-value="onRangePick"
                    />
                    <!-- 时间段快捷预设：一键填充起止并应用 -->
                    <div class="header-popover__presets">
                      <ElButton
                        v-for="p in RANGE_PRESETS"
                        :key="p.key"
                        size="small"
                        text
                        type="primary"
                        @click="applyRangePreset(col.field, p.key)"
                      >{{ p.label }}</ElButton>
                    </div>
                    <div class="header-popover__filter-actions">
                      <span class="header-popover__mode-hint">按起止时间筛选（含边界）</span>
                      <ElButton
                        v-if="getHeaderFilterClause(col.field)"
                        size="small"
                        text
                        type="danger"
                        @click="clearHeaderFilter(col.field)"
                      >清除筛选</ElButton>
                    </div>
                  </template>
                  <template v-else>
                  <ElInput
                    v-model="headerMenuKeyword"
                    size="small"
                    clearable
                    :placeholder="isCandidateMode ? '搜索候选值' : '输入关键词，回车筛选'"
                    :title="isCandidateMode ? undefined : '关键词对列内容做包含匹配；外键列匹配关联对象的名称'"
                    @keyup.enter="() => { if (!isCandidateMode) applyHeaderFilter(col.field) }"
                  />

                  <!-- 关键词模式（默认）：直接以输入内容作为 like 条件 -->
                  <template v-if="!isCandidateMode">
                    <div
                      v-if="getHeaderFilterClause(col.field)"
                      class="header-popover__filter-actions"
                    >
                      <span class="header-popover__mode-hint">
                        当前：包含「{{ typeof getHeaderFilterClause(col.field)!.value === 'string' ? getHeaderFilterClause(col.field)!.value : '' }}」
                      </span>
                      <ElButton
                        size="small"
                        text
                        type="danger"
                        @click="clearHeaderFilter(col.field)"
                      >清除筛选</ElButton>
                    </div>
                    <div v-else class="header-popover__filter-actions">
                      <span class="header-popover__mode-hint">外键列将按关联对象的名称匹配</span>
                    </div>
                  </template>

                  <!-- 候选值模式：勾选具体值（in 条件） -->
                  <template v-else>
                    <div
                      v-if="headerMenuOptions.length > 0 || getHeaderFilterClause(col.field)"
                      class="header-popover__filter-actions"
                    >
                      <ElCheckbox
                        v-if="headerMenuOptions.length > 0"
                        :model-value="headerSelectAll"
                        :indeterminate="headerSelectIndeterminate"
                        @update:model-value="(v: any) => toggleHeaderSelectAll(!!v)"
                      >全选</ElCheckbox>
                      <ElButton
                        v-if="getHeaderFilterClause(col.field)"
                        size="small"
                        text
                        type="danger"
                        @click="clearHeaderFilter(col.field)"
                      >清除筛选</ElButton>
                    </div>

                    <!-- 无候选值时不渲染空选项区（加载中除外） -->
                    <div
                      v-if="headerMenuLoading || headerMenuOptions.length > 0"
                      class="header-popover__options"
                      @scroll.passive="(e: Event) => { const el = e.target as HTMLElement; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 12) loadMoreHeaderMenuOptions() }"
                    >
                      <div v-if="headerMenuLoading && headerMenuOptions.length === 0" class="header-popover__loading">加载中...</div>
                      <ElCheckboxGroup v-model="headerMenuSelectedKeys">
                        <ElCheckbox
                          v-for="opt in headerMenuOptions"
                          :key="facetValueKey(opt.value)"
                          :value="facetValueKey(opt.value)"
                          :disabled="opt.disabled"
                        >
                          <span class="header-popover__opt-label">{{ opt.label }}</span>
                          <span class="header-popover__opt-count">({{ opt.count }})</span>
                        </ElCheckbox>
                      </ElCheckboxGroup>
                      <div v-if="headerMenuLoading && headerMenuOptions.length > 0" class="header-popover__loading-more">加载中...</div>
                    </div>
                  </template>
                  </template>

                  <div class="header-popover__footer">
                    <ElButton size="small" type="primary" @click="applyHeaderFilter(col.field)">确定</ElButton>
                    <ElButton size="small" @click="headerMenuField = null">取消</ElButton>
                  </div>
                </div>
              </div>
            </ElPopover>
          </div>
        </template>
        <template #default="{ row }">
          <template v-if="isEditing(row[props.rowKey], col.field)">
            <div class="edit-inline" @click.stop>
              <div class="edit-inline__editor">
                <!-- text / email / url / phone -->
                <input
                  v-if="!col.fieldType || col.fieldType === 'text' || col.fieldType === 'email' || col.fieldType === 'url' || col.fieldType === 'phone'"
                  v-model="editValue"
                  class="edit-inline__input"
                  @keydown.enter="confirmEdit(row, col)"
                  @keydown.escape="cancelEdit"
                />
                <!-- number / currency / percent -->
                <div
                  v-else-if="col.fieldType === 'number' || col.fieldType === 'currency' || col.fieldType === 'money' || col.fieldType === 'percent'"
                  class="edit-inline__number-wrapper"
                  :class="{ 'has-suffix': col.fieldType === 'percent' }"
                >
                  <input
                    v-model.number="editValue"
                    type="number"
                    class="edit-inline__input"
                    @keydown.enter="confirmEdit(row, col)"
                    @keydown.escape="cancelEdit"
                  />
                  <span
                    v-if="col.fieldType === 'percent'"
                    class="edit-inline__suffix"
                  >%</span>
                </div>
                <!-- date -->
                <input
                  v-else-if="col.fieldType === 'date'"
                  v-model="editValue"
                  type="date"
                  class="edit-inline__input"
                  @keydown.enter="confirmEdit(row, col)"
                  @keydown.escape="cancelEdit"
                />
                <!-- datetime -->
                <input
                  v-else-if="col.fieldType === 'datetime'"
                  v-model="editValue"
                  type="datetime-local"
                  class="edit-inline__input"
                  @keydown.enter="confirmEdit(row, col)"
                  @keydown.escape="cancelEdit"
                />
                <!-- textarea -->
                <textarea
                  v-else-if="col.fieldType === 'textarea'"
                  v-model="editValue"
                  class="edit-inline__input edit-inline__textarea"
                  @keydown.enter.prevent="onTextareaEnter($event, row, col)"
                  @keydown.escape="cancelEdit"
                />
                <!-- boolean：toggle switch 切换预览，确认后才保存 -->
                <button
                  v-else-if="col.fieldType === 'boolean'"
                  type="button"
                  class="toggle-switch"
                  :class="{ 'toggle-switch--on': editValue }"
                  :aria-checked="!!editValue"
                  role="switch"
                  @click="toggleEditValue()"
                >
                  <span class="toggle-switch__label toggle-switch__label--yes" :class="{ 'is-active': editValue }">{{ col.trueLabel || '是' }}</span>
                  <span class="toggle-switch__thumb"></span>
                  <span class="toggle-switch__label toggle-switch__label--no" :class="{ 'is-active': !editValue }">{{ col.falseLabel || '否' }}</span>
                </button>
                <!-- select / status -->
                <select
                  v-else-if="(col.fieldType === 'select' || col.fieldType === 'status') && col.selectOptions"
                  v-model="editValue"
                  class="edit-inline__select"
                >
                  <option
                    v-for="o in col.selectOptions"
                    :key="String(o.value)"
                    :value="o.value"
                  >
                    {{ o.label }}
                  </option>
                </select>
                <!-- fk -->
                <div
                  v-else-if="col.fieldType === 'fk'"
                  class="fk-edit-wrapper"
                >
                  <div
                    class="fk-edit-trigger"
                    :class="{ 'is-open': fkDropdownOpen }"
                    @click="toggleFkDropdown"
                  >
                    <span v-if="getFkLabel(editValue)" class="fk-edit-tag">
                      <span class="fk-edit-tag-text">{{ getFkLabel(editValue) }}</span>
                      <button
                        class="fk-edit-tag-close"
                        @click.stop="clearFkSelection"
                        title="清除"
                        aria-label="清除选择"
                      >&#10005;</button>
                    </span>
                    <span v-else class="fk-edit-placeholder">
                      {{ fkLoading ? '加载中...' : '点击选择关联...' }}
                    </span>
                    <svg class="fk-edit-arrow" width="12" height="12" viewBox="0 0 12 12">
                      <path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                  <div v-if="fkDropdownOpen" class="fk-edit-dropdown" @click.stop>
                    <div class="fk-edit-dropdown-search">
                      <input
                        v-model="fkSearchText"
                        class="fk-edit-search-input"
                        type="text"
                        placeholder="搜索..."
                        @keydown.escape="closeFkDropdown"
                      />
                    </div>
                    <div class="fk-edit-dropdown-list">
                      <div
                        v-for="o in fkFilteredOptions"
                        :key="String(o.value)"
                        class="fk-edit-dropdown-item"
                        :class="{
                          'is-selected': o.value === editValue,
                          'is-disabled': o.disabled,
                        }"
                        @click="selectFkOption(o)"
                      >
                        <span class="fk-edit-dropdown-label">{{ o.label }}</span>
                        <svg
                          v-if="o.value === editValue"
                          class="fk-edit-dropdown-check"
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                        >
                          <path d="M2.5 7l3 3 6-6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </div>
                      <div v-if="fkFilteredOptions.length === 0" class="fk-edit-dropdown-empty">
                        {{ fkSearchText ? '无匹配结果' : '暂无可选项' }}
                      </div>
                    </div>
                    <button
                      v-if="col.quickCreate"
                      type="button"
                      class="fk-edit-quick-create"
                      @click="openFkQuickCreate"
                    >+ 新建{{ col.title }}</button>
                  </div>
                </div>
                <!-- mediaImage：媒体库选择 / 上传新资源 / 清除，确认后才保存媒体 id -->
                <div v-else-if="col.fieldType === 'mediaImage'" class="media-edit">
                  <span class="media-edit__thumb">
                    <MediaImageCell :value="editValue" :preview="false" />
                  </span>
                  <button
                    type="button"
                    class="edit-inline__btn media-edit__btn"
                    @click="openMediaPicker"
                  >媒体库</button>
                  <button
                    type="button"
                    class="edit-inline__btn media-edit__btn"
                    :disabled="mediaUploading"
                    @click="triggerMediaUpload($event)"
                  >{{ mediaUploading ? '上传中...' : '上传' }}</button>
                  <button
                    type="button"
                    class="edit-inline__btn media-edit__btn media-edit__btn--clear"
                    @click="clearMediaSelection"
                  >清除</button>
                  <!-- 关键：不能用 hidden/display:none，否则内嵌 webview/部分浏览器下 .click() 无法唤起系统文件框 -->
                  <input ref="mediaFileInput" type="file" accept="image/*" class="media-edit__file" @change="onMediaFileChange" />
                </div>
                <!-- fallback -->
                <input
                  v-else
                  v-model="editValue"
                  class="edit-inline__input"
                  @keydown.enter="confirmEdit(row, col)"
                  @keydown.escape="cancelEdit"
                />
              </div>

              <div class="edit-inline__actions">
                <button
                  class="edit-inline__btn edit-inline__btn--confirm"
                  @click="confirmEdit(row, col)"
                  title="保存"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </button>
                <button
                  class="edit-inline__btn edit-inline__btn--cancel"
                  @click="cancelEdit"
                  title="取消"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
          </template>
          <MediaImageCell
            v-else-if="col.fieldType === 'mediaImage' && row[col.field]"
            :value="row[col.field]"
          />
          <img
            v-else-if="(col.fieldType === 'image' || col.fieldType === 'attachment') && row[col.field]"
            :src="String(row[col.field])"
            class="cell-image"
            alt=""
            loading="lazy"
            @click="openImage(row[col.field])"
          />
          <span v-else-if="col.fieldType === 'datetime' || col.fieldType === 'date'" class="cell-value cell-datetime">{{ formatDateTimeCell(row[col.field], col.fieldType) }}</span>
          <!-- 枚举彩色标签：任一取值声明了颜色（options[].color / statusMap）时逐值渲染带色标签 -->
          <span
            v-else-if="isEnumColumn(col) && hasEnumTagStyle(row[col.field], col)"
            class="cell-value cell-enum"
            v-html="getEnumCellHtml(row[col.field], col)"
          ></span>
            <!-- select/fk 空值不挂 cell-tag：否则空单元格渲染出空胶囊占位 -->
            <span v-else class="cell-value" :class="[(col.fieldType === 'select' || col.fieldType === 'fk') && row[col.field] != null && row[col.field] !== '' ? 'cell-tag' : '', col.fieldType === 'fk' ? 'cell-tag--fk' : '', col.fieldType === 'boolean' ? ['cell-boolean', getBooleanStateClass(row[col.field]), row[col.field] ? col.trueLabelClass : col.falseLabelClass] : '', hasFilterMatch(col) ? 'cell-highlighted' : '']" v-html="getCellHighlightHtml(row[col.field], col)"></span>
        </template>
      </VxeColumn>

      <!-- 关联列：单击打开对话框，不可编辑 -->
      <VxeColumn
        v-for="col in relationColumns"
        :key="col.field"
        :field="col.field"
        :title="col.title"
        :width="col.width"
        :fixed="col.fixed"
        :sortable="col.sortable"
        :align="col.align || 'center'"
      >
        <template #default="{ row }">
          <span
            class="relation-click-trigger"
            @click.stop="handleRelationClick(col, row)"
          >
            {{ relationFormatter(col) }}
          </span>
        </template>
      </VxeColumn>

      <!-- 标准操作列：固定右侧，不参与排序/筛选/隐藏/拖拽（数据标准操作与普通数据列地位不同） -->
      <VxeColumn
        v-if="opColumns.length > 0"
        field="__operations__"
        title="操作"
        :width="opColumnWidth"
        fixed="right"
        align="center"
        class-name="op-column"
      >
        <template #default="{ row }">
          <span class="op-cell">
            <button
              v-for="op in visibleOps(row)"
              :key="op.field"
              type="button"
              class="op-link"
              :class="{ 'op-link--danger': op.actionDanger }"
              @click.stop="handleOpClick(row, op)"
            >
              {{ op.title }}
            </button>
          </span>
        </template>
      </VxeColumn>
    </VxeTable>

    <!-- mediaImage 行内编辑共用媒体选择弹窗（append-to-body，不参与表格布局） -->
    <MediaPickerDialog v-model="mediaPickerVisible" :selected-id="editValue" @select="onMediaPicked" />

    <!-- fk 行内编辑快速新建弹窗（col.quickCreate 开启时下拉底部出现入口；创建成功自动选中，确认后落库） -->
    <QuickCreateDialog
      :visible="fkQuickCreateVisible"
      :target-module-id="editingCol?.targetModule || ''"
      :prefill-data="fkSearchText ? { name: fkSearchText } : undefined"
      @created="handleFkQuickCreated"
      @cancel="fkQuickCreateVisible = false"
      @close="fkQuickCreateVisible = false"
    />

    <!-- 截断单元格内容查看浮层：单击省略单元格原地弹出完整内容（锚定单元格，不撑行高、不受列宽限制）。
         自管浮层而非 el-popover：开关只由 cellDetail 状态机决定，避免换格点击时旧弹层的外点关闭与新弹层打开竞争 -->
    <Teleport to="body">
      <div
        v-if="cellDetail.visible && cellDetail.triggerEl"
        ref="cellDetailPanelRef"
        class="schemagine-cell-detail-panel"
        :style="{ left: cellDetailPos.left + 'px', top: cellDetailPos.top + 'px' }"
      >
        <div class="cell-detail-popover__head">
          <span class="cell-detail-popover__title">{{ cellDetail.title }}</span>
          <button type="button" class="cell-detail-popover__copy" @click="copyCellDetail">复制</button>
        </div>
        <div class="cell-detail-popover__content">{{ cellDetail.content }}</div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.vxe-table-wrapper {
  width: 100%;
}
/* 列宽分配兜底：vxe 的 fit 剩余宽度分配在部分挂载时序下不会被重算（首次 calc 时
   容器尚窄则 meanWidth=0 永久定格），主层表格声明 min-width:100% 交给浏览器
   fixed 布局把差额均摊到各列，表头/表体同 colgroup 天然对齐。
   列总宽超出容器（横向滚动）时 vxe 内联 width 生效、min-width 不参与，固定列层不在选择域内不受影响 */
.vxe-table-wrapper :deep(.vxe-table--render-default .vxe-table--main-wrapper table) {
  min-width: 100%;
}
.vxe-table-wrapper.is-auto-fill {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
:deep(.schema-header-cell) {
  display: inline-flex;
  align-items: center;
  gap: var(--sg-spacing-3);
  max-width: 100%;
}
:deep(.schema-header-cell__title) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.schema-header-cell__arrow {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid transparent;
  background: transparent;
  color: var(--sg-text-color-regular);
  line-height: 16px;
  font-size: var(--sg-font-size-base);
  border-radius: var(--sg-radius-sm);
  cursor: pointer;
}
.schema-header-cell__arrow:hover {
  background: var(--sg-fill-color-light);
  border-color: var(--sg-border-color-light);
}
.schema-header-cell__arrow.is-active {
  color: var(--sg-color-primary);
  border-color: var(--sg-color-primary-light-7);
  background: var(--sg-color-primary-light-9);
}
:deep(.action-cell) {
  cursor: pointer;
  color: var(--sg-color-primary);
  font-weight: 500;
}
:deep(.action-cell:hover) {
  background-color: var(--sg-color-primary-light-9) !important;
}
:deep(.relation-cell) {
  cursor: pointer;
  color: var(--sg-color-primary);
}
:deep(.relation-cell:hover) {
  background-color: var(--sg-color-primary-light-9) !important;
  text-decoration: underline;
}
:deep(.vxe-body--row .vxe-body--column) {
  cursor: default;
}
:deep(.vxe-body--row .vxe-body--column:not(.relation-cell):not(.action-cell)) {
  cursor: pointer;
}
:deep(.vxe-body--column.is-editing-cell > .vxe-cell) {
  overflow: visible !important;
  align-items: flex-start;
  position: relative;
}
:deep(.vxe-body--column.is-editing-cell .vxe-cell--wrapper) {
  overflow: visible !important;
  position: absolute;
  top: 2px;
  left: 0;
  right: 0;
  width: auto;
  z-index: var(--sg-z-index-topmost);
}
:deep(.vxe-body--column.is-editing-cell.vxe-inline-flip-y .vxe-cell--wrapper) {
  top: auto;
  bottom: 2px;
}
:deep(.vxe-body--row.is-editing-row) {
  background-color: var(--sg-color-primary-light-9) !important;
}
:deep(.vxe-body--row.is-selected-row) {
  background-color: var(--sg-color-primary-light-9) !important;
}

.relation-click-trigger {
  cursor: pointer;
  color: var(--sg-color-primary);
  user-select: none;
}
.relation-click-trigger:hover {
  text-decoration: underline;
  color: var(--sg-color-primary-light-3);
}

/* 标准操作列 */
:deep(.op-column) {
  background: var(--sg-fill-color-lighter);
}
/* 按钮为内容宽（列宽由 opColumnWidth 按实测文本计价），单元格 gap 与 OP_LINK_GAP 保持一致 */
.op-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.op-link {
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--sg-color-primary);
  font-size: var(--sg-font-size-md);
  line-height: 22px;
  user-select: none;
  white-space: nowrap;
}
.op-link:hover {
  text-decoration: underline;
  color: var(--sg-color-primary-light-3);
}
.op-link--danger {
  color: var(--sg-color-danger);
}
.op-link--danger:hover {
  color: var(--sg-color-danger-light-3);
}

.edit-inline {
  position: relative;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: stretch;
  background-color: var(--sg-bg-color);
  gap: var(--sg-spacing-3);
  padding: var(--sg-spacing-2);
  border-radius: var(--sg-radius-md);
  box-shadow: var(--sg-shadow-sm);
  min-width: 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.edit-inline__editor {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--sg-color-primary);
  border-radius: var(--sg-radius-md);
  background: var(--sg-color-primary-light-9);
}
.edit-inline__actions {
  display: flex;
  align-items: stretch;
  gap: var(--sg-spacing-2);
  padding: 0;
  background-color: transparent;
  z-index: var(--sg-z-index-sticky);
  flex: 1;
  margin-left: auto;
}
.edit-inline__input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 var(--sg-spacing-3);
  border: none;
  border-radius: var(--sg-radius-sm);
  outline: none;
  font-size: var(--sg-font-size-md);
  background: var(--sg-bg-color);
}
.edit-inline__textarea {
  height: auto;
  min-height: 28px;
  padding: var(--sg-spacing-2) var(--sg-spacing-3);
  resize: vertical;
  line-height: 1.4;
  font-family: inherit;
}
.edit-inline__select {
  flex: 1;
  min-width: 0;
  height: 28px;
  border: none;
  border-radius: var(--sg-radius-sm);
  outline: none;
  font-size: var(--sg-font-size-md);
  background: var(--sg-bg-color);
  line-height: 1;
  padding: 0 var(--sg-spacing-3);
}
.edit-inline__btn {
  flex: 1;
  width: 28px;
  padding: 0;
  border: 1px solid;
  border-radius: var(--sg-radius-sm);
  font-size: var(--sg-font-size-base);
  line-height: 1;
  cursor: pointer;
  background: var(--sg-bg-color);
  display: flex;
  justify-content: center;
  align-items: center;
}
/* mediaImage 行内编辑：缩略图置顶 + 按钮竖排，严格约束在列宽内（右侧固定列不遮挡） */
.edit-inline__editor:has(.media-edit) {
  flex-basis: 100%;
}
.media-edit {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--sg-spacing-2);
  width: 100%;
  min-width: 0;
}
/* 视觉隐藏但保留渲染，保证 mediaFileInput.click() 在各类浏览器/内嵌 webview 中都能唤起系统文件框 */
.media-edit__file {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
  pointer-events: none;
}
.media-edit__thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 56px;
  flex: none;
  border-radius: var(--sg-radius-md);
  background: var(--sg-fill-color-light);
  overflow: hidden;
}
.media-edit__thumb :deep(.media-image-cell) {
  max-width: 100%;
  max-height: 100%;
}
.media-edit__btn {
  width: 100%;
  height: 24px;
  padding: 0 var(--sg-spacing-3);
  color: var(--sg-color-primary);
  border-color: var(--sg-color-primary-light-7);
  flex: none;
}
.media-edit__btn:hover {
  color: var(--sg-color-white);
  background: var(--sg-color-primary);
}
.media-edit__btn:disabled {
  color: var(--sg-color-primary-light-5);
  border-color: var(--sg-color-primary-light-8);
  background: var(--sg-color-primary-light-9);
  cursor: not-allowed;
}
.media-edit__btn--clear {
  color: var(--sg-text-color-secondary);
  border-color: var(--sg-border-color);
}
.media-edit__btn--clear:hover {
  color: var(--sg-color-white);
  background: var(--sg-color-info);
}
.edit-inline__btn--confirm {
  color: var(--sg-color-success);
  border-color: var(--sg-color-success);
}
.edit-inline__btn--confirm:hover {
  color: var(--sg-color-white);
  background: var(--sg-color-success);
}
.edit-inline__btn--cancel {
  color: var(--sg-color-danger);
  border-color: var(--sg-color-danger);
}
.edit-inline__btn--cancel:hover {
  color: var(--sg-color-white);
  background: var(--sg-color-danger);
}
.toggle-switch {
  flex: 1 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sg-spacing-2);
  height: 28px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  outline: none;
  font-size: var(--sg-font-size-base);
}
.toggle-switch:focus-visible {
  box-shadow: var(--sg-shadow-focus-strong);
  border-radius: var(--sg-radius-md);
}
.toggle-switch__thumb {
  flex-shrink: 0;
  position: relative;
  width: 22px;
  height: 14px;
  border-radius: var(--sg-radius-xl);
  background: var(--sg-text-color-placeholder);
  transition: background var(--sg-duration-normal) ease;
}
.toggle-switch__thumb::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: var(--sg-radius-circle);
  background: var(--sg-bg-color);
  box-shadow: var(--sg-shadow-sm);
  transform: translateX(8px);
  transition: transform var(--sg-duration-normal) ease;
}
.toggle-switch--on .toggle-switch__thumb {
  background: var(--sg-color-primary);
}
.toggle-switch--on .toggle-switch__thumb::after {
  transform: translateX(0);
}
.toggle-switch__label {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--sg-text-color-placeholder);
  transition: color var(--sg-duration-normal) ease, font-weight var(--sg-duration-normal) ease;
}
.toggle-switch__label.is-active {
  color: var(--sg-text-color-primary);
  font-weight: 600;
}

.cell-value {
  display: inline-block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-image {
  display: inline-block;
  max-width: 64px;
  max-height: 64px;
  border-radius: var(--sg-radius-lg);
  object-fit: cover;
  cursor: zoom-in;
  border: 1px solid var(--sg-border-color-lighter);
  vertical-align: middle;
  transition: box-shadow var(--sg-duration-fast) ease;
}
.cell-image:hover {
  box-shadow: var(--sg-shadow-md);
}
.cell-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  min-width: 48px;
  padding: 0 var(--sg-spacing-5);
  height: 26px;
  line-height: 26px;
  border-radius: var(--sg-radius-md);
  background: var(--sg-color-primary-light-9);
  color: var(--sg-color-primary);
  font-size: var(--sg-font-size-base);
  font-weight: 500;
  border: 1px solid var(--sg-color-primary-light-8);
}
.cell-boolean {
  display: inline-flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  font-weight: 500;
}
.cell-boolean::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: var(--sg-radius-circle);
  background: currentColor;
  flex-shrink: 0;
}
/* boolean 状态默认配色：是=绿、否=红；自定义走 trueLabelClass/falseLabelClass
   （span 经 :class 绑定带 scoped 属性，预设类可直接命中；自定义色同样以此方式覆盖 color 即可） */
.cell-boolean--yes {
  color: var(--sg-color-success);
}
.cell-boolean--no {
  color: var(--sg-color-danger);
}
/* 预设：否/是无关紧要的中性灰（如「支持积分支付=否」）。
   固定色值不走 --el-color-info——宿主主题会把它映射成品牌蓝，失去「中性」语义 */
.cell-boolean--neutral {
  color: var(--sg-text-color-secondary);
}

.cell-tag--fk {
  background: var(--sg-color-primary-light-9);
  color: var(--sg-color-primary);
  border-color: var(--sg-color-primary-light-7);
}
/* 枚举彩色标签：span 经 v-html 注入拿不到 scoped 属性，几何样式在此重述；
   背景文字描边由 getEnumCellHtml 内联样式逐值覆盖，未声明颜色的取值即默认蓝标签 */
.cell-enum {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sg-spacing-2);
  flex-wrap: wrap;
}
.cell-enum :deep(.cell-tag) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 0 var(--sg-spacing-5);
  height: 26px;
  line-height: 26px;
  border-radius: var(--sg-radius-md);
  background: var(--sg-color-primary-light-9);
  color: var(--sg-color-primary);
  font-size: var(--sg-font-size-base);
  font-weight: 500;
  border: 1px solid var(--sg-color-primary-light-8);
}

/* FK 编辑组件 */
.fk-edit-wrapper {
  flex: 1;
  min-width: 0;
  position: relative;
}

.fk-edit-trigger {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  height: 28px;
  padding: 0 var(--sg-spacing-3);
  border: 1px solid var(--sg-color-primary);
  border-radius: var(--sg-radius-sm);
  background: var(--sg-bg-color);
  cursor: pointer;
  transition: border-color var(--sg-duration-normal) ease, box-shadow var(--sg-duration-normal) ease;
  user-select: none;
}

.fk-edit-trigger:hover {
  border-color: var(--sg-color-primary-light-3);
}

.fk-edit-trigger.is-open {
  border-color: var(--sg-color-primary);
  box-shadow: var(--sg-shadow-focus);
}

.fk-edit-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  padding: 1px var(--sg-spacing-3);
  background: var(--sg-color-primary-light-9);
  border-radius: var(--sg-radius-sm);
  font-size: var(--sg-font-size-base);
  color: var(--sg-color-primary);
  font-weight: 500;
  max-width: 100%;
  overflow: hidden;
}

.fk-edit-tag-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fk-edit-tag-close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: var(--sg-radius-circle);
  background: transparent;
  color: var(--sg-color-primary);
  font-size: var(--sg-font-size-xs);
  cursor: pointer;
  line-height: 1;
  transition: background var(--sg-duration-fast) ease, color var(--sg-duration-fast) ease;
}

.fk-edit-tag-close:hover {
  background: var(--sg-color-primary);
  color: var(--sg-color-white);
}

.fk-edit-placeholder {
  flex: 1;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-placeholder);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fk-edit-arrow {
  flex-shrink: 0;
  color: var(--sg-text-color-secondary);
  transition: transform var(--sg-duration-normal) ease;
}

.is-open .fk-edit-arrow {
  transform: rotate(180deg);
  color: var(--sg-color-primary);
}

.fk-edit-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  min-width: 160px;
  margin-top: var(--sg-spacing-1);
  background: var(--sg-bg-color);
  border: 1px solid var(--sg-border-color-light);
  border-radius: var(--sg-radius-md);
  box-shadow: var(--sg-shadow-lg);
  z-index: var(--sg-z-index-overlay);
  overflow: hidden;
}

.fk-edit-dropdown-search {
  padding: var(--sg-spacing-3);
  border-bottom: 1px solid var(--sg-border-color-extra-light);
}

.fk-edit-search-input {
  width: 100%;
  height: 28px;
  padding: 0 var(--sg-spacing-4);
  border: 1px solid var(--sg-border-color);
  border-radius: var(--sg-radius-sm);
  outline: none;
  font-size: var(--sg-font-size-base);
  transition: border-color var(--sg-duration-normal) ease;
  box-sizing: border-box;
}

.fk-edit-search-input:focus {
  border-color: var(--sg-color-primary);
}

.fk-edit-search-input::placeholder {
  color: var(--sg-text-color-placeholder);
}

.fk-edit-dropdown-list {
  max-height: 180px;
  overflow-y: auto;
  padding: var(--sg-spacing-2) 0;
}

.fk-edit-dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sg-spacing-2) var(--sg-spacing-5);
  cursor: pointer;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-primary);
  transition: background-color var(--sg-duration-fast) ease;
}

.fk-edit-dropdown-item:hover {
  background-color: var(--sg-fill-color-light);
}

.fk-edit-dropdown-item.is-selected {
  color: var(--sg-color-primary);
  font-weight: 500;
  background-color: var(--sg-color-primary-light-9);
}

.fk-edit-dropdown-item.is-disabled {
  color: var(--sg-text-color-placeholder);
  cursor: not-allowed;
  pointer-events: none;
}

.fk-edit-dropdown-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fk-edit-dropdown-check {
  flex-shrink: 0;
  color: var(--sg-color-primary);
  margin-left: var(--sg-spacing-3);
}

.fk-edit-dropdown-empty {
  padding: var(--sg-spacing-6) var(--sg-spacing-5);
  text-align: center;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-placeholder);
}

/* fk 下拉底部快速新建（col.quickCreate）：与候选列表分隔的常驻入口 */
.fk-edit-quick-create {
  display: block;
  width: 100%;
  padding: var(--sg-spacing-4) var(--sg-spacing-5);
  border: none;
  border-top: 1px solid var(--sg-border-color-lighter);
  background: var(--sg-fill-color-light);
  color: var(--sg-color-primary);
  font-size: var(--sg-font-size-base);
  font-weight: 500;
  text-align: center;
  cursor: pointer;
}
.fk-edit-quick-create:hover {
  background: var(--sg-color-primary-light-9);
  color: var(--sg-color-primary-dark-2);
}

.sort-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  margin-right: var(--sg-spacing-1);
  font-size: var(--sg-font-size-base);
  line-height: 1;
  color: currentColor;
}

.cell-highlighted :deep(.filter-match-highlight) {
  display: inline;
}

.edit-inline__number-wrapper {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  border: 1px solid var(--sg-color-primary);
  border-radius: var(--sg-radius-sm);
  background: var(--sg-bg-color);
  overflow: hidden;
}

.edit-inline__number-wrapper .edit-inline__input {
  flex: 1;
  border: none;
  border-radius: 0;
}

.edit-inline__number-wrapper.has-suffix .edit-inline__input {
  border-right: 1px solid var(--sg-border-color-light);
}

.edit-inline__suffix {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-secondary);
  background: var(--sg-fill-color-light);
  user-select: none;
}
</style>

<style>
.schemagine-header-popover .header-popover {
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-5);
}
.schemagine-header-popover .header-popover__sort {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-3);
  padding-bottom: var(--sg-spacing-4);
  border-bottom: 1px solid var(--sg-border-color-lighter);
}
.schemagine-header-popover .header-popover__filter {
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-4);
}
.schemagine-header-popover .header-popover__filter-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-regular);
}
.schemagine-header-popover .header-popover__mode-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  cursor: pointer;
}
.schemagine-header-popover .header-popover__mode-label {
  color: var(--sg-text-color-secondary);
}
.schemagine-header-popover .header-popover__mode-hint {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-secondary);
}
.schemagine-header-popover .header-popover__filter-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.schemagine-header-popover .header-popover__presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sg-spacing-1) var(--sg-spacing-2);
  margin-top: var(--sg-spacing-3);
}
.schemagine-header-popover .header-popover__presets .el-button {
  margin: 0;
  padding: var(--sg-spacing-2) var(--sg-spacing-3);
}
.schemagine-header-popover .header-popover__options {
  max-height: 240px;
  overflow: auto;
  padding: var(--sg-spacing-3) var(--sg-spacing-1);
  border: 1px solid var(--sg-border-color-lighter);
  border-radius: var(--sg-radius-md);
}
.schemagine-header-popover .header-popover__options .el-checkbox {
  display: flex;
  align-items: center;
  width: 100%;
  margin-right: 0;
  padding: var(--sg-spacing-2) var(--sg-spacing-3);
  border-radius: var(--sg-radius-md);
}
.schemagine-header-popover .header-popover__options .el-checkbox:hover {
  background: var(--sg-fill-color-light);
}
.schemagine-header-popover .header-popover__options .el-checkbox__label {
  flex: 1;
  min-width: 0;
}
.schemagine-header-popover .header-popover__opt-label,
.schemagine-header-popover .header-popover__opt-count {
  transition: color var(--sg-duration-fast) ease;
}
.schemagine-header-popover .header-popover__options .el-checkbox:hover .header-popover__opt-label {
  color: var(--sg-text-color-primary);
}
.schemagine-header-popover .header-popover__options .el-checkbox:hover .header-popover__opt-count {
  color: var(--sg-text-color-regular);
}
.schemagine-header-popover .header-popover__opt-label {
  margin-right: var(--sg-spacing-3);
}
.schemagine-header-popover .header-popover__opt-count {
  color: var(--sg-text-color-secondary);
}
.schemagine-header-popover .header-popover__loading,
.schemagine-header-popover .header-popover__loading-more {
  padding: var(--sg-spacing-4);
  color: var(--sg-text-color-secondary);
  font-size: var(--sg-font-size-base);
  text-align: center;
}
.schemagine-header-popover .header-popover__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--sg-spacing-4);
}

/* 截断单元格内容查看浮层（Teleport 到 body，全局样式；自管定位 fixed，开关单一状态机）。
   宽度随内容自适应，上限 400px：长值在 400px 处折行，短值面板收缩贴内容 */
.schemagine-cell-detail-panel {
  position: fixed;
  z-index: 4000;
  box-sizing: border-box;
  width: max-content;
  max-width: 400px;
  padding: var(--sg-spacing-5) var(--sg-spacing-6);
  background: var(--sg-bg-color);
  border: 1px solid var(--sg-border-color-light);
  border-radius: var(--sg-radius-xl);
  box-shadow: var(--sg-shadow-xl);
}
.schemagine-cell-detail-panel .cell-detail-popover__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sg-spacing-6);
  margin-bottom: var(--sg-spacing-3);
}
.schemagine-cell-detail-panel .cell-detail-popover__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--sg-font-size-base);
  font-weight: 600;
  color: var(--sg-text-color-secondary);
}
.schemagine-cell-detail-panel .cell-detail-popover__copy {
  flex-shrink: 0;
  padding: var(--sg-spacing-1) var(--sg-spacing-4);
  border: none;
  border-radius: var(--sg-radius-md);
  background: transparent;
  color: var(--sg-color-primary);
  font-size: var(--sg-font-size-base);
  cursor: pointer;
}
.schemagine-cell-detail-panel .cell-detail-popover__copy:hover {
  background: var(--sg-color-primary-light-9);
}
.schemagine-cell-detail-panel .cell-detail-popover__content {
  max-height: 260px;
  overflow: auto;
  font-size: var(--sg-font-size-md);
  line-height: 1.6;
  color: var(--sg-text-color-primary);
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
}
</style>
