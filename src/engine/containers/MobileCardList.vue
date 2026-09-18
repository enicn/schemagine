<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElButton, ElDrawer, ElInput, ElTag, ElMessage, ElMessageBox } from 'element-plus'
import MobileCardItem from '@/components/card/MobileCardItem.vue'
import SchemaCard from '@/components/card/SchemaCard.vue'
import FilterConditionControls from '@/components/filter/FilterConditionControls.vue'
import BottomTabs from '@/components/filter/BottomTabs.vue'
import type { FilterTab } from '@/components/filter/BottomTabs.vue'
import ListActionBar from '@/engine/actions/ListActionBar.vue'
import { useRecords, useSchemaMeta, useUi } from '@/composables/instanceState'
import { useCellEdit } from '@/composables/useCellEdit'
import { usePermission } from '@/composables/usePermission'
import { recordService } from '@/services/api/recordService'
import { validateFieldValue } from '@/utils/fieldValidation'
import { deriveCardProjection, resolveSearchFields } from '@/utils/cardProjection'
import { resolveRowActionMobilePolicy } from '@/utils/mobileActions'
import { buildFilterSummaryItems } from '@/utils/filterSummary'
import { flattenFilterConditions } from '@/utils/filterConditions'
import { evaluateCondition } from '@/utils/condition'
import type { ModuleSchema, FilterCondition, SortParam, ListAction, ActionTriggerEvent, FieldSchema, RecordEntity } from '@/types'

/**
 * 移动端卡片列表容器（管理端移动适配 §3.4/3.5/3.6/3.7）：
 * sticky 搜索栏 + 筛选底部抽屉 + 状态页签 + 卡片列表（content-visibility）+ 触底加载
 * + 详情底部抽屉（SchemaCard 三段式编辑手柄）+ 动作排（allow/block 降级）。
 * 数据：首屏由 ListView 共用的 fetchData 写入 recordStore；本组件只负责 loadMore 追加分支
 * （独立 mobilePage 计数，不触碰 currentPage 的全量重拉语义）。
 */
const props = defineProps<{
  schema: ModuleSchema
  /** 已提交筛选条件（loadMore 透传；由 ListView 拥有） */
  filters: FilterCondition[]
  sort: SortParam | null
  /** 关键词（由 ListView 拥有并进 list 查询；本组件防抖上抛） */
  keyword: string
  /** 状态页签（由 ListView 按第一个可筛选 select 字段推导） */
  tabs: FilterTab[]
  activeTabId: string
  listActions: ListAction[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  'update:keyword': [value: string]
  search: [conditions: FilterCondition[]]
  'remove-filter': [fieldKey: string]
  'tab-change': [tabId: string]
  'row-action': [payload: { rowId: string; field: string; actionId: string }]
  'action-trigger': [payload: ActionTriggerEvent]
}>()

const recordStore = useRecords()
const schemaMeta = useSchemaMeta()
const uiState = useUi()
const permission = usePermission(schemaMeta)
// 单字段保存通道：与表格行内编辑同终点（patchField + 版本冲突重试 + 撤销栈）
const cellEdit = useCellEdit(recordStore, schemaMeta, uiState)

const canEdit = computed(() => permission.canEdit.value && !props.readonly)

// ── 吸顶基准补偿：Chromium 的 sticky top 吸附在滚动容器内容盒顶边（csswg-drafts 互操作分歧，
// 实测 top:0 会被宿主滚动容器的 padding-top 顶下来），吸顶后其上方留出一条缝隙、卡片从其中
// 穿过并造成"抖动"观感。运行时量取最近滚动祖先的 padding-top 反向偏移，让筛选栏贴住滚动口
// 可视顶边、实底直接盖住整条缝隙。
const toolbarRef = ref<HTMLElement | null>(null)

function resolveScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return node
    node = node.parentElement
  }
  return null
}

function applyStickyCompensation(): void {
  const toolbar = toolbarRef.value
  if (!toolbar) return
  const scroller = resolveScrollParent(toolbar)
  if (!scroller) return
  const padTop = parseFloat(getComputedStyle(scroller).paddingTop)
  toolbar.style.setProperty('--sg-mobile-sticky-top', padTop > 0 ? `-${padTop}px` : '0px')
}

onMounted(() => {
  // 挂载即同步量一次：rAF 在后台/被遮挡标签页会被节流（不触发），不能作为唯一时机
  applyStickyCompensation()
  // 下一帧再量一次：宿主可能在挂载后才完成滚动容器的布局/类名装配
  requestAnimationFrame(applyStickyCompensation)
  window.addEventListener('resize', applyStickyCompensation)
})

onUnmounted(() => {
  window.removeEventListener('resize', applyStickyCompensation)
})

const projection = computed(() => deriveCardProjection(props.schema))
const searchFieldKeys = computed(() => resolveSearchFields(props.schema))
const chips = computed(() => buildFilterSummaryItems(flattenFilterConditions(props.filters), props.schema.fields))

// ── 顶部搜索：防抖 400ms 上抛（§3.6）──
const keywordDraft = ref(props.keyword)
let keywordTimer: ReturnType<typeof setTimeout> | null = null

watch(() => props.keyword, (v) => {
  if (v !== keywordDraft.value) keywordDraft.value = v
})

function onKeywordInput(value: string): void {
  keywordDraft.value = value
  if (keywordTimer) clearTimeout(keywordTimer)
  keywordTimer = setTimeout(() => {
    emit('update:keyword', keywordDraft.value)
  }, 400)
}

onUnmounted(() => {
  if (keywordTimer) clearTimeout(keywordTimer)
})

// ── 触底加载（§3.5）：独立 mobilePage 追加分支，不碰 currentPage ──
const MOBILE_MAX_LOADED = 500

const mobilePage = ref(1)
const loadingMore = ref(false)
const loadError = ref(false)

watch([() => props.filters, () => props.sort, () => props.keyword], () => {
  mobilePage.value = 1
  loadError.value = false
})

const pageSize = computed(() => recordStore.queryState.pagination.pageSize || 20)

const reachedCap = computed(() => recordStore.records.length >= MOBILE_MAX_LOADED)

const hasMore = computed(() => {
  if (reachedCap.value) return false
  if (recordStore.totalRecords <= 0) return false
  if (recordStore.hasMoreRecords !== null) return recordStore.hasMoreRecords
  return recordStore.records.length < recordStore.totalRecords
})

async function loadMore(): Promise<void> {
  if (loadingMore.value || recordStore.isLoading || !hasMore.value) return
  loadingMore.value = true
  loadError.value = false
  try {
    const res = await recordService.list({
      moduleId: props.schema.id,
      filters: props.filters,
      keyword: props.keyword.trim() || undefined,
      sort: props.sort || undefined,
      page: mobilePage.value + 1,
      pageSize: pageSize.value,
    })
    if (!res.success) {
      loadError.value = true
      return
    }
    mobilePage.value += 1
    recordStore.appendRecords(res.data.records, res.data.total, res.data.hasMore)
  } catch {
    loadError.value = true
  } finally {
    loadingMore.value = false
  }
}

// 触底哨兵：IntersectionObserver + rootMargin 400px 预取
const sentinelRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) void loadMore()
    }
  }, { rootMargin: '400px' })
  if (sentinelRef.value) observer.observe(sentinelRef.value)
})

watch(sentinelRef, (el, old) => {
  if (old && observer) observer.unobserve(old)
  if (el && observer) observer.observe(el)
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
})

async function retryLoad(): Promise<void> {
  loadError.value = false
  await loadMore()
}

// ── 筛选底部抽屉（§3.6）：FilterConditionControls 单源草稿 ──
const supportedFilterTypes = new Set<FieldSchema['type']>(['text', 'select', 'multi-select', 'date', 'datetime', 'boolean', 'fk'])
const filterableFields = computed(() => props.schema.fields.filter(f => f.filterable && supportedFilterTypes.has(f.type)))

const filterDrawerVisible = ref(false)
const filterControlsRef = ref<InstanceType<typeof FilterConditionControls> | null>(null)
const filterMatchType = ref<'all' | 'any'>('all')

function openFilterDrawer(): void {
  filterControlsRef.value?.resync()
  filterDrawerVisible.value = true
}

function applyFilterDrawer(): void {
  emit('search', filterControlsRef.value?.apply() ?? [])
  filterDrawerVisible.value = false
}

function resetFilterDrawer(): void {
  filterControlsRef.value?.reset()
  emit('search', [])
  filterDrawerVisible.value = false
}

// ── 详情底部抽屉（§3.7）：三段式编辑手柄 + 动作排 ──
const detailId = ref<string | null>(null)
const detailDrawerVisible = ref(false)
const schemaCardRef = ref<InstanceType<typeof SchemaCard> | null>(null)

const detailRecord = computed<RecordEntity | null>(() => {
  return detailId.value ? recordStore.getRecordById(detailId.value) ?? null : null
})

/** 编辑中（手柄单字段或整卡草稿）：动作排整体禁用（§3.7.2 互斥） */
const detailEditing = computed(() => {
  const card = schemaCardRef.value as unknown as {
    editing?: boolean
    handleEditingField?: string | null
  } | null
  return !!(card?.editing || card?.handleEditingField)
})

function openDetail(recordId: string): void {
  detailId.value = recordId
  detailDrawerVisible.value = true
}

function closeDetail(): void {
  detailDrawerVisible.value = false
  detailId.value = null
}

/** 详情面板「编辑」：整卡草稿编辑（多字段联动路径，§3.7.3） */
function startFullEdit(): void {
  schemaCardRef.value?.startEdit?.()
}

async function confirmDelete(): Promise<void> {
  if (!detailId.value) return
  try {
    await ElMessageBox.confirm('确定删除该记录？', '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  const rowId = detailId.value
  closeDetail()
  emit('row-action', { rowId, field: '', actionId: 'delete' })
}

/** 单字段保存（手柄 ✓）：校验 → 单字段更新通道（与行内编辑同终点）；失败保留编辑器 */
async function handleSaveField(payload: { field: string; value: unknown; oldValue: unknown }): Promise<boolean> {
  const field = schemaMeta.getField(payload.field)
  if (!field || !detailRecord.value) return false
  const validation = validateFieldValue(field, payload.value)
  if (!validation.valid) {
    uiState.showMessage(`「${field.label}」${validation.errors[0] ?? '校验未通过'}`, 'warning')
    return false
  }
  const ok = await cellEdit.onCellEdit({
    rowId: detailRecord.value.id,
    field: payload.field,
    value: payload.value,
    oldValue: payload.oldValue,
    mode: 'row',
    source: 'user',
  })
  if (ok) ElMessage.success('已保存')
  return ok
}

/** 详情动作排的 schema 放行动作（§3.3：rowAction 默认 block，allow 名单显式放行） */
interface DetailRowAction {
  field: FieldSchema
  policy: 'allow' | 'block'
  visible: boolean
  actionId: string
}

const detailRowActions = computed<DetailRowAction[]>(() => {
  const record = detailRecord.value
  if (!record) return []
  return props.schema.fields
    .filter(f => f.type === 'action' && f.rowAction)
    .map((f) => {
      const action = f.rowAction!
      const policy = resolveRowActionMobilePolicy(action)
      const visible = action.visibleWhen
        ? evaluateCondition(action.visibleWhen, { record: record.fields, global: {} })
        : true
      return {
        field: f,
        policy: policy === 'hidden' ? 'block' : policy,
        visible,
        actionId: action.type === 'delete' ? 'delete' : f.key,
      } as DetailRowAction
    })
    .filter(a => a.policy === 'allow' || a.policy === 'block')
    .filter(a => a.visible)
})

function handleRowActionClick(action: DetailRowAction): void {
  if (action.policy === 'block') {
    ElMessage.info('该操作请在桌面端完成')
    return
  }
  if (!detailRecord.value) return
  if (action.actionId === 'delete') {
    void confirmDelete()
    return
  }
  const rowId = detailRecord.value.id
  closeDetail()
  emit('row-action', { rowId, field: action.field.key, actionId: action.actionId })
}
</script>

<template>
  <div class="sg-mobile-list">
    <!-- sticky 搜索栏（相对宿主滚动容器吸附；top 由吸顶基准补偿写入） -->
    <div ref="toolbarRef" class="sg-mobile-toolbar">
      <div v-if="searchFieldKeys.length > 0 || filterableFields.length > 0" class="sg-mobile-toolbar__row">
        <ElInput
          v-if="searchFieldKeys.length > 0"
          class="sg-mobile-search"
          :model-value="keywordDraft"
          :placeholder="`搜索${schema.name}`"
          clearable
          enterkeyhint="search"
          @update:model-value="onKeywordInput"
        >
          <template #prefix>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"
                fill="currentColor"
              />
            </svg>
          </template>
        </ElInput>
        <ElButton
          v-if="filterableFields.length > 0"
          class="sg-mobile-filter-btn"
          :type="chips.length > 0 ? 'primary' : 'default'"
          @click="openFilterDrawer"
        >
          筛选
          <ElTag v-if="chips.length > 0" size="small" round class="sg-mobile-filter-count">{{ chips.length }}</ElTag>
        </ElButton>
      </div>

      <!-- 激活条件 chips（可删） -->
      <div v-if="chips.length > 0" class="sg-mobile-chips">
        <ElTag
          v-for="item in chips"
          :key="item.fieldKey"
          size="small"
          closable
          @close="emit('remove-filter', item.fieldKey)"
        >
          <span class="sg-mobile-chip-label">{{ item.label }}</span>
          <span class="sg-mobile-chip-value">{{ item.valueLabel }}</span>
        </ElTag>
      </div>

      <!-- 状态页签（横移滚动） -->
      <BottomTabs
        v-if="tabs.length > 1"
        class="sg-mobile-tabs"
        :tabs="tabs"
        :active-tab-id="activeTabId"
        :show-count="true"
        @change="(id: string) => emit('tab-change', id)"
      />

      <!-- 放行的工具栏动作（批量类已在 ListActionBar 内按策略隐藏/置灰） -->
      <ListActionBar
        v-if="listActions.length > 0"
        class="sg-mobile-actions"
        :actions="listActions"
        :active-filters="[]"
        mobile
        @action-trigger="(p: ActionTriggerEvent) => emit('action-trigger', p)"
      />
    </div>

    <!-- 卡片列表 -->
    <div class="sg-mobile-cards">
      <el-empty v-if="!recordStore.isLoading && recordStore.records.length === 0" description="暂无数据" />
      <template v-else>
        <MobileCardItem
          v-for="r in recordStore.records"
          :key="r.id"
          :record="r"
          :schema="schema"
          :projection="projection"
          @open="openDetail"
        />
      </template>

      <!-- 触底哨兵：加载中 / 失败重试 / 护栏 / 没有更多 -->
      <div ref="sentinelRef" class="sg-mobile-sentinel">
        <span v-if="loadingMore || recordStore.isLoading" class="sg-mobile-sentinel__loading">加载中…</span>
        <button v-else-if="loadError" class="sg-mobile-sentinel__retry" @click="retryLoad">加载失败，点击重试</button>
        <span v-else-if="reachedCap" class="sg-mobile-sentinel__hint">结果过多，请用筛选收窄</span>
        <span v-else-if="!hasMore && recordStore.records.length > 0" class="sg-mobile-sentinel__hint">
          没有更多了（共 {{ recordStore.totalRecords }} 条）
        </span>
      </div>
    </div>

    <!-- 筛选底部抽屉 -->
    <ElDrawer
      v-model="filterDrawerVisible"
      direction="btt"
      append-to-body
      class="sg-mobile-bottom-drawer"
      :title="'筛选'"
      size="auto"
    >
      <div class="sg-mobile-filter-body">
        <FilterConditionControls
          ref="filterControlsRef"
          :fields="filterableFields"
          :model-value="filters"
          :match-type="filterMatchType"
          @submit="applyFilterDrawer"
        />
        <div v-if="filterableFields.length > 1" class="sg-mobile-filter-match">
          <span class="sg-mobile-filter-match__label">匹配</span>
          <ElButton size="small" :type="filterMatchType === 'all' ? 'primary' : ''" @click="filterMatchType = 'all'">全部条件</ElButton>
          <ElButton size="small" :type="filterMatchType === 'any' ? 'primary' : ''" @click="filterMatchType = 'any'">任一条件</ElButton>
        </div>
      </div>
      <template #footer>
        <div class="sg-mobile-drawer-footer">
          <ElButton @click="resetFilterDrawer">重置</ElButton>
          <ElButton type="primary" @click="applyFilterDrawer">应用</ElButton>
        </div>
      </template>
    </ElDrawer>

    <!-- 详情底部抽屉（复用 SchemaCard，三段式手柄） -->
    <ElDrawer
      v-model="detailDrawerVisible"
      direction="btt"
      append-to-body
      class="sg-mobile-bottom-drawer sg-mobile-detail-drawer"
      :title="detailRecord ? String(detailRecord.id) : '详情'"
      size="85%"
      @closed="closeDetail"
    >
      <div v-if="detailRecord" class="sg-mobile-detail-body">
        <SchemaCard
          :ref="(el: unknown) => (schemaCardRef = el as InstanceType<typeof SchemaCard>)"
          :key="detailRecord.id"
          :record="detailRecord"
          :field-schemas="schemaMeta.visibleFields"
          :editable="canEdit"
          :field-handle="canEdit"
          :title-field="projection.titleField"
          :save-field="handleSaveField"
        />
      </div>
      <template #footer>
        <div class="sg-mobile-drawer-footer sg-mobile-detail-actions" :class="{ 'is-disabled': detailEditing }">
          <ElButton v-if="canEdit" :disabled="detailEditing" @click="startFullEdit">编辑</ElButton>
          <ElButton
            v-for="action in detailRowActions"
            :key="action.field.key"
            :type="action.policy === 'block' ? 'default' : 'primary'"
            plain
            :disabled="detailEditing"
            @click="handleRowActionClick(action)"
          >
            {{ action.field.rowAction?.label || action.field.label }}
            <span v-if="action.policy === 'block'" class="sg-mobile-desktop-badge">桌面端</span>
          </ElButton>
          <ElButton
            v-if="permission.canDeleteRecords.value"
            type="danger"
            plain
            :disabled="detailEditing"
            @click="confirmDelete"
          >
            删除
          </ElButton>
        </div>
      </template>
    </ElDrawer>
  </div>
</template>

<style scoped>
.sg-mobile-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* sticky 搜索栏：相对最近滚动祖先（宿主提供的滚动容器）吸附；
   实底背景 + 底边线压住滚过的卡片。top 默认 0，挂载后由吸顶基准补偿覆写
   （抵消滚动容器 padding-top 造成的吸附下移，见脚本区说明）。
   注意：引擎源码不得引用任何具体宿主类名——滚动容器契约见 docs/17 §1.7 */
.sg-mobile-toolbar {
  position: sticky;
  top: var(--sg-mobile-sticky-top, 0px);
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-2);
  padding: var(--sg-spacing-3) var(--sg-spacing-4);
  background: var(--sg-bg-color);
  border-bottom: 1px solid var(--sg-border-color-light);
}

.sg-mobile-toolbar__row {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
}

.sg-mobile-search {
  flex: 1;
  min-width: 0;
}

.sg-mobile-filter-btn {
  flex-shrink: 0;
  min-height: 40px;
}

.sg-mobile-filter-count {
  margin-left: var(--sg-spacing-1);
  background: var(--sg-bg-color);
  color: var(--sg-color-primary);
  border: none;
  font-weight: 600;
}

.sg-mobile-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sg-spacing-2);
}

.sg-mobile-chip-label {
  font-weight: 600;
  margin-right: var(--sg-spacing-1);
}

.sg-mobile-tabs {
  margin: calc(-1 * var(--sg-spacing-2)) calc(-1 * var(--sg-spacing-4)) calc(-1 * var(--sg-spacing-2));
  border-top: none;
  background: transparent;
}

.sg-mobile-actions {
  padding: 0;
  border: none;
  background: transparent;
}

.sg-mobile-cards {
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-3);
  padding: var(--sg-spacing-3) var(--sg-spacing-4) var(--sg-spacing-6);
}

.sg-mobile-sentinel {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 40px;
  padding: var(--sg-spacing-3) 0;
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
}

.sg-mobile-sentinel__loading::before {
  content: '';
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: var(--sg-spacing-2);
  border: 2px solid var(--sg-border-color-light);
  border-top-color: var(--sg-color-primary);
  border-radius: 50%;
  animation: sg-mobile-spin 0.6s linear infinite;
  vertical-align: -2px;
}

@keyframes sg-mobile-spin {
  to { transform: rotate(360deg); }
}

.sg-mobile-sentinel__retry {
  border: none;
  background: none;
  color: var(--sg-color-primary);
  font-size: var(--sg-font-size-sm);
  cursor: pointer;
  min-height: 40px;
}

/* 抽屉内控件区可滚 */
.sg-mobile-filter-body {
  overflow-y: auto;
  max-height: 65vh;
  padding: 0 var(--sg-spacing-2);
}

.sg-mobile-filter-match {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  padding: var(--sg-spacing-3) 0;
}

.sg-mobile-filter-match__label {
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
}

.sg-mobile-detail-body {
  overflow-y: auto;
  max-height: calc(85vh - 120px);
}

.sg-mobile-detail-body :deep(.schema-card) {
  margin-bottom: 0;
  box-shadow: none;
}

.sg-mobile-drawer-footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sg-spacing-2);
}

.sg-mobile-drawer-footer .el-button {
  min-height: 40px;
}

/* 编辑态互斥：动作排整体禁用（视觉降透明 + 指针禁用兜底） */
.sg-mobile-detail-actions.is-disabled {
  opacity: 0.55;
  pointer-events: none;
}

.sg-mobile-desktop-badge {
  display: inline-flex;
  align-items: center;
  margin-left: var(--sg-spacing-1);
  padding: 0 var(--sg-spacing-2);
  height: 18px;
  border-radius: var(--sg-radius-md);
  border: 1px solid var(--sg-border-color);
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
  background: var(--sg-fill-color-lighter);
}
</style>

<style>
/* 底部抽屉全局形态（append-to-body，非 scoped）：全宽圆角顶边 */
.sg-mobile-bottom-drawer.el-drawer.btt {
  border-radius: 12px 12px 0 0;
  max-width: 100vw;
}
.sg-mobile-bottom-drawer .el-drawer__header {
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--sg-border-color-light, #ebeef5);
}
</style>
