/**
 * 表头筛选（docs/19 批次 F 前置拆分）：从 VxeTableWrapper 抽出列头
 * 「筛选 + 排序」弹层的全部状态与动作——关键词/候选值/时间段三种模式、
 * 候选值分页加载、时间段快捷预设，以及子句的产出与清除。
 */
import { computed, ref, watch } from 'vue'
import { recordService } from '@/services/api/recordService'
import type { FilterClause, FieldValueCandidateOption } from '@/types'
import type { WrapperColumn } from './wrapperTypes'

export interface HeaderFilterEmit {
  (e: 'sort-change', payload: { field: string; order: 'asc' | 'desc' | null }): void
  (e: 'filter-change', payload: { field: string; clause: FilterClause | null }): void
}

export function useHeaderFilter(
  props: {
    moduleId: string
    columns: WrapperColumn[]
    filterClauses?: FilterClause[]
  },
  emit: HeaderFilterEmit,
) {
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

  /** 时间段快捷预设：一键填充并应用（订单管理等按天/周/月看数据的最高频动作）；文案经 t('table.preset.<key>') 取 */
  const RANGE_PRESETS = [
    { key: 'today' },
    { key: 'yesterday' },
    { key: 'last7' },
    { key: 'week' },
    { key: 'lastweek' },
    { key: 'month' },
    { key: 'lastmonth' },
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

  return {
    headerMenuField,
    headerMenuKeyword,
    headerMenuOptions,
    headerMenuSelectedKeys,
    headerMenuLoading,
    headerFilterMode,
    headerFilterRange,
    isCandidateMode,
    onRangePick,
    RANGE_PRESETS,
    applyRangePreset,
    isDatetimeCol,
    isDateOnlyCol,
    modeSwitchable,
    facetValueKey,
    getHeaderFilterClause,
    handleHeaderPopoverVisibleChange,
    headerSelectAll,
    headerSelectIndeterminate,
    toggleHeaderSelectAll,
    loadMoreHeaderMenuOptions,
    applyHeaderSort,
    applyHeaderFilter,
    clearHeaderFilter,
  }
}
