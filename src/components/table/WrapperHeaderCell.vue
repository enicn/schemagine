<script setup lang="ts">
/**
 * 表头单元格内容（VxeTableWrapper 抽出·F3）：
 * 「列名 + 筛选/排序弹层」模板，供平铺列与多级表头（colgroup）子列复用。
 * 状态与动作经 TableCtx 注入（见 cellCtx.ts），与原先同作用域模板等价。
 */
import { ElPopover, ElInput, ElCheckbox, ElCheckboxGroup, ElButton, ElSwitch, ElDatePicker } from 'element-plus'
import { t } from '@/locales'
import type { WrapperColumn } from './wrapperTypes'
import type { TableCtx } from './cellCtx'

const props = defineProps<{
  col: WrapperColumn
  ctx: TableCtx
  /** vxe 表头插槽参数；固定列克隆份 isHidden=true 时不挂弹层 */
  hdr?: { isHidden?: boolean } | null
}>()

const ctx = props.ctx
</script>

<template>
  <div v-if="!hdr?.isHidden" class="schema-header-cell" @click.stop>
    <span class="schema-header-cell__title">{{ col.title }}</span>
    <!-- vxe-table 固定列会把整份表头克隆到 fixed-wrapper（isHidden 列仅 visibility:hidden 但保留布局坐标），
         克隆份若也挂 popover，受控 visible 会两份同开，且克隆份定位偏移到表格外侧 -->
    <ElPopover
      trigger="click"
      placement="bottom-start"
      :width="320"
      :teleported="true"
      popper-class="schemagine-header-popover"
      :z-index="4000"
      :visible="ctx.headerMenuField === col.field"
      @update:visible="(v: boolean) => ctx.handleHeaderPopoverVisibleChange(col.field, v)"
    >
      <template #reference>
        <button
          type="button"
          class="schema-header-cell__arrow"
          :class="{ 'is-active': !!ctx.getHeaderFilterClause(col.field) || (ctx.sortConfig?.field === col.field) }"
          :aria-label="t('table.filter.filterSortLabel')"
          @click.stop
        >▼</button>
      </template>

      <div class="header-popover">
        <div class="header-popover__sort">
          <ElButton size="small" type="success" plain @click="ctx.applyHeaderSort(col.field, 'asc')">
            <span class="sort-icon sort-icon--asc">↑</span>
            {{ t('table.filter.asc') }}
          </ElButton>
          <ElButton size="small" type="danger" plain @click="ctx.applyHeaderSort(col.field, 'desc')">
            <span class="sort-icon sort-icon--desc">↓</span>
            {{ t('table.filter.desc') }}
          </ElButton>
          <ElButton size="small" text type="info" @click="ctx.applyHeaderSort(col.field, null)">
            <span class="sort-icon sort-icon--clear">×</span>
            {{ t('table.filter.clearSort') }}
          </ElButton>
        </div>

        <div class="header-popover__filter">
          <div class="header-popover__filter-title">
            <span>{{ ctx.isCandidateMode ? t('table.filter.candidatesTitle') : (ctx.isDatetimeCol(col) ? t('table.filter.rangeTitle') : t('table.filter.contentTitle')) }}</span>
            <label v-if="ctx.modeSwitchable(col)" class="header-popover__mode-switch" @click.stop>
              <span class="header-popover__mode-label">{{ t('table.filter.candidateMode') }}</span>
              <ElSwitch v-model="ctx.isCandidateMode" size="small" />
            </label>
          </div>
          <!-- 时间段筛选（range 模式，date/datetime 列专用）：起止闭区间，between 子句。
               显式 filterCandidates 的日期列默认候选值模式，经开关切回 range 才渲染此分支 -->
          <template v-if="ctx.headerFilterMode === 'range'">
            <ElDatePicker
              :model-value="ctx.headerFilterRange"
              :type="ctx.isDateOnlyCol(col) ? 'daterange' : 'datetimerange'"
              :format="ctx.isDateOnlyCol(col) ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss'"
              :value-format="ctx.isDateOnlyCol(col) ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss'"
              :range-separator="t('table.filter.rangeSeparator')"
              :start-placeholder="ctx.isDateOnlyCol(col) ? t('table.filter.startPlaceholderDate') : t('table.filter.startPlaceholderTime')"
              :end-placeholder="ctx.isDateOnlyCol(col) ? t('table.filter.endPlaceholderDate') : t('table.filter.endPlaceholderTime')"
              :default-time="ctx.isDateOnlyCol(col) ? undefined : [new Date(2000, 0, 1, 0, 0, 0), new Date(2000, 0, 1, 23, 59, 59)]"
              size="small"
              clearable
              :teleported="false"
              style="width: 280px"
              @update:model-value="ctx.onRangePick"
            />
            <!-- 时间段快捷预设：一键填充起止并应用 -->
            <div class="header-popover__presets">
              <ElButton
                v-for="p in ctx.RANGE_PRESETS"
                :key="p.key"
                size="small"
                text
                type="primary"
                @click="ctx.applyRangePreset(col.field, p.key)"
              >{{ t('table.preset.' + p.key) }}</ElButton>
            </div>
            <div class="header-popover__filter-actions">
              <span class="header-popover__mode-hint">{{ t('table.filter.rangeHint') }}</span>
              <ElButton
                v-if="ctx.getHeaderFilterClause(col.field)"
                size="small"
                text
                type="danger"
                @click="ctx.clearHeaderFilter(col.field)"
              >{{ t('table.filter.clearFilter') }}</ElButton>
            </div>
          </template>
          <template v-else>
            <ElInput
              v-model="ctx.headerMenuKeyword"
              size="small"
              clearable
              :placeholder="ctx.isCandidateMode ? t('table.filter.searchPlaceholder') : t('table.filter.keywordPlaceholder')"
              :title="ctx.isCandidateMode ? undefined : t('table.filter.keywordTitle')"
              @keyup.enter="() => { if (!ctx.isCandidateMode) ctx.applyHeaderFilter(col.field) }"
            />

            <!-- 关键词模式（默认）：直接以输入内容作为 like 条件 -->
            <template v-if="!ctx.isCandidateMode">
              <div
                v-if="ctx.getHeaderFilterClause(col.field)"
                class="header-popover__filter-actions"
              >
                <span class="header-popover__mode-hint">
                  {{ t('table.filter.currentKeywordPrefix', { value: typeof ctx.getHeaderFilterClause(col.field)!.value === 'string' ? (ctx.getHeaderFilterClause(col.field)!.value as string) : '' }) }}
                </span>
                <ElButton
                  size="small"
                  text
                  type="danger"
                  @click="ctx.clearHeaderFilter(col.field)"
                >{{ t('table.filter.clearFilter') }}</ElButton>
              </div>
              <div v-else class="header-popover__filter-actions">
                <span class="header-popover__mode-hint">{{ t('table.filter.fkKeywordHint') }}</span>
              </div>
            </template>

            <!-- 候选值模式：勾选具体值（in 条件） -->
            <template v-else>
              <div
                v-if="ctx.headerMenuOptions.length > 0 || ctx.getHeaderFilterClause(col.field)"
                class="header-popover__filter-actions"
              >
                <ElCheckbox
                  v-if="ctx.headerMenuOptions.length > 0"
                  :model-value="ctx.headerSelectAll"
                  :indeterminate="ctx.headerSelectIndeterminate"
                  @update:model-value="(v: any) => ctx.toggleHeaderSelectAll(!!v)"
                >{{ t('table.filter.selectAll') }}</ElCheckbox>
                <ElButton
                  v-if="ctx.getHeaderFilterClause(col.field)"
                  size="small"
                  text
                  type="danger"
                  @click="ctx.clearHeaderFilter(col.field)"
                >{{ t('table.filter.clearFilter') }}</ElButton>
              </div>

              <!-- 无候选值时不渲染空选项区（加载中除外） -->
              <div
                v-if="ctx.headerMenuLoading || ctx.headerMenuOptions.length > 0"
                class="header-popover__options"
                @scroll.passive="(e: Event) => { const el = e.target as HTMLElement; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 12) ctx.loadMoreHeaderMenuOptions() }"
              >
                <div v-if="ctx.headerMenuLoading && ctx.headerMenuOptions.length === 0" class="header-popover__loading">{{ t('table.filter.loading') }}</div>
                <ElCheckboxGroup v-model="ctx.headerMenuSelectedKeys">
                  <ElCheckbox
                    v-for="opt in ctx.headerMenuOptions"
                    :key="ctx.facetValueKey(opt.value)"
                    :value="ctx.facetValueKey(opt.value)"
                    :disabled="opt.disabled"
                  >
                    <span class="header-popover__opt-label">{{ opt.label }}</span>
                    <span class="header-popover__opt-count">({{ opt.count }})</span>
                  </ElCheckbox>
                </ElCheckboxGroup>
                <div v-if="ctx.headerMenuLoading && ctx.headerMenuOptions.length > 0" class="header-popover__loading-more">{{ t('table.filter.loadingMore') }}</div>
              </div>
            </template>
          </template>

          <div class="header-popover__footer">
            <ElButton size="small" type="primary" @click="ctx.applyHeaderFilter(col.field)">{{ t('table.filter.ok') }}</ElButton>
            <ElButton size="small" @click="ctx.headerMenuField = null">{{ t('table.filter.cancel') }}</ElButton>
          </div>
        </div>
      </div>
    </ElPopover>
  </div>
  <!-- 固定列克隆份（isHidden）：只渲染列名占位 -->
  <div v-else class="schema-header-cell" @click.stop>
    <span class="schema-header-cell__title">{{ col.title }}</span>
  </div>
</template>
