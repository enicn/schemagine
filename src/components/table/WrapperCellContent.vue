<script setup lang="ts">
/**
 * 单元格内容（VxeTableWrapper 抽出·F3）：宿主插槽透传 / 行内编辑器 /
 * 查看态渲染（媒体、日期、枚举标签、筛选高亮）模板，供平铺列与
 * 多级表头（colgroup）子列复用。状态与动作经 TableCtx 注入（cellCtx.ts）。
 */
import { formatDateTimeCell } from '@/utils/recordRow'
import MediaImageCell from '@/components/field/MediaImageCell.vue'
import type { WrapperColumn } from './wrapperTypes'
import type { TableCtx } from './cellCtx'

const props = defineProps<{
  col: WrapperColumn
  row: Record<string, unknown>
  ctx: TableCtx
}>()

const ctx = props.ctx
</script>

<template>
  <!-- 分组组行（docs/19 F6）：标记行整行按组值/小计渲染 -->
  <span v-if="row.__sgGroup__" class="cell-value group-row-cell">{{ ctx.groupCellDisplay(row, col) }}</span>
  <template v-else-if="ctx.isEditing(row[ctx.rowKey], col.field)">
    <div class="edit-inline" @click.stop>
      <div class="edit-inline__editor">
        <!-- 自定义字段类型（docs/19 B1）：注册了编辑器组件的自定义类型 -->
        <component
          :is="ctx.customEditorDef(col)"
          v-if="ctx.customEditorDef(col)"
          :value="ctx.editValue"
          :model-value="ctx.editValue"
          :field-schema="col.fieldSchema"
          @update:model-value="ctx.editValue = $event"
          @update:value="ctx.editValue = $event"
        />
        <!-- text / email / url / phone -->
        <input
          v-if="!ctx.customEditorDef(col) && (!col.fieldType || col.fieldType === 'text' || col.fieldType === 'email' || col.fieldType === 'url' || col.fieldType === 'phone')"
          v-model="ctx.editValue"
          class="edit-inline__input"
          @keydown.enter="ctx.confirmEdit(row, col)"
          @keydown.escape="ctx.cancelEdit"
        />
        <!-- number / currency / percent -->
        <div
          v-else-if="col.fieldType === 'number' || col.fieldType === 'currency' || col.fieldType === 'money' || col.fieldType === 'percent'"
          class="edit-inline__number-wrapper"
          :class="{ 'has-suffix': col.fieldType === 'percent' }"
        >
          <input
            v-model.number="ctx.editValue"
            type="number"
            class="edit-inline__input"
            @keydown.enter="ctx.confirmEdit(row, col)"
            @keydown.escape="ctx.cancelEdit"
          />
          <span
            v-if="col.fieldType === 'percent'"
            class="edit-inline__suffix"
          >%</span>
        </div>
        <!-- date -->
        <input
          v-else-if="col.fieldType === 'date'"
          v-model="ctx.editValue"
          type="date"
          class="edit-inline__input"
          @keydown.enter="ctx.confirmEdit(row, col)"
          @keydown.escape="ctx.cancelEdit"
        />
        <!-- datetime -->
        <input
          v-else-if="col.fieldType === 'datetime'"
          v-model="ctx.editValue"
          type="datetime-local"
          class="edit-inline__input"
          @keydown.enter="ctx.confirmEdit(row, col)"
          @keydown.escape="ctx.cancelEdit"
        />
        <!-- textarea -->
        <textarea
          v-else-if="col.fieldType === 'textarea'"
          v-model="ctx.editValue"
          class="edit-inline__input edit-inline__textarea"
          @keydown.enter.prevent="ctx.onTextareaEnter($event, row, col)"
          @keydown.escape="ctx.cancelEdit"
        />
        <!-- boolean：toggle switch 切换预览，确认后才保存 -->
        <button
          v-else-if="col.fieldType === 'boolean'"
          type="button"
          class="toggle-switch"
          :class="{ 'toggle-switch--on': ctx.editValue }"
          :aria-checked="!!ctx.editValue"
          role="switch"
          @click="ctx.toggleEditValue()"
        >
          <span class="toggle-switch__label toggle-switch__label--yes" :class="{ 'is-active': ctx.editValue }">{{ col.trueLabel || '是' }}</span>
          <span class="toggle-switch__thumb"></span>
          <span class="toggle-switch__label toggle-switch__label--no" :class="{ 'is-active': !ctx.editValue }">{{ col.falseLabel || '否' }}</span>
        </button>
        <!-- select / status -->
        <select
          v-else-if="(col.fieldType === 'select' || col.fieldType === 'status') && col.selectOptions"
          v-model="ctx.editValue"
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
            :class="{ 'is-open': ctx.fkDropdownOpen }"
            @click="ctx.toggleFkDropdown"
          >
            <span v-if="ctx.getFkLabel(ctx.editValue)" class="fk-edit-tag">
              <span class="fk-edit-tag-text">{{ ctx.getFkLabel(ctx.editValue) }}</span>
              <button
                class="fk-edit-tag-close"
                @click.stop="ctx.clearFkSelection"
                title="清除"
                aria-label="清除选择"
              >&#10005;</button>
            </span>
            <span v-else class="fk-edit-placeholder">
              {{ ctx.fkLoading ? '加载中...' : '点击选择关联...' }}
            </span>
            <svg class="fk-edit-arrow" width="12" height="12" viewBox="0 0 12 12">
              <path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div v-if="ctx.fkDropdownOpen" class="fk-edit-dropdown" @click.stop>
            <div class="fk-edit-dropdown-search">
              <input
                v-model="ctx.fkSearchText"
                class="fk-edit-search-input"
                type="text"
                placeholder="搜索..."
                @keydown.escape="ctx.closeFkDropdown"
              />
            </div>
            <div class="fk-edit-dropdown-list">
              <div
                v-for="o in ctx.fkFilteredOptions"
                :key="String(o.value)"
                class="fk-edit-dropdown-item"
                :class="{
                  'is-selected': o.value === ctx.editValue,
                  'is-disabled': o.disabled,
                }"
                @click="ctx.selectFkOption(o)"
              >
                <span class="fk-edit-dropdown-label">{{ o.label }}</span>
                <svg
                  v-if="o.value === ctx.editValue"
                  class="fk-edit-dropdown-check"
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                >
                  <path d="M2.5 7l3 3 6-6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div v-if="ctx.fkFilteredOptions.length === 0" class="fk-edit-dropdown-empty">
                {{ ctx.fkSearchText ? '无匹配结果' : '暂无可选项' }}
              </div>
            </div>
            <button
              v-if="col.quickCreate"
              type="button"
              class="fk-edit-quick-create"
              @click="ctx.openFkQuickCreate"
            >+ 新建{{ col.title }}</button>
          </div>
        </div>
        <!-- mediaImage：媒体库选择 / 上传新资源 / 清除，确认后才保存媒体 id -->
        <div v-else-if="col.fieldType === 'mediaImage'" class="media-edit">
          <span class="media-edit__thumb">
            <MediaImageCell :value="ctx.editValue" :preview="false" />
          </span>
          <button
            type="button"
            class="edit-inline__btn media-edit__btn"
            @click="ctx.openMediaPicker"
          >媒体库</button>
          <button
            type="button"
            class="edit-inline__btn media-edit__btn"
            :disabled="ctx.mediaUploading"
            @click="ctx.triggerMediaUpload($event)"
          >{{ ctx.mediaUploading ? '上传中...' : '上传' }}</button>
          <button
            type="button"
            class="edit-inline__btn media-edit__btn media-edit__btn--clear"
            @click="ctx.clearMediaSelection"
          >清除</button>
          <!-- 关键：不能用 hidden/display:none，否则内嵌 webview/部分浏览器下 .click() 无法唤起系统文件框；
               定位走 triggerMediaUpload 的 closest('.media-edit') 查询，无需 template ref -->
          <input type="file" accept="image/*" class="media-edit__file" @change="ctx.onMediaFileChange" />
        </div>
        <!-- fallback -->
        <input
          v-else
          v-model="ctx.editValue"
          class="edit-inline__input"
          @keydown.enter="ctx.confirmEdit(row, col)"
          @keydown.escape="ctx.cancelEdit"
        />
      </div>

      <div class="edit-inline__actions">
        <button
          class="edit-inline__btn edit-inline__btn--confirm"
          @click="ctx.confirmEdit(row, col)"
          title="保存"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
        <button
          class="edit-inline__btn edit-inline__btn--cancel"
          @click="ctx.cancelEdit"
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
    @click="ctx.openImage(row[col.field])"
  />
  <span v-else-if="col.fieldType === 'datetime' || col.fieldType === 'date'" class="cell-value cell-datetime">{{ formatDateTimeCell(row[col.field], col.fieldType) }}</span>
  <!-- 枚举彩色标签：任一取值声明了颜色（options[].color / statusMap）时逐值渲染带色标签 -->
  <span
    v-else-if="ctx.isEnumColumn(col) && ctx.hasEnumTagStyle(row[col.field], col)"
    class="cell-value cell-enum"
    v-html="ctx.getEnumCellHtml(row[col.field], col)"
  ></span>
    <!-- select/fk 空值不挂 cell-tag：否则空单元格渲染出空胶囊占位 -->
    <span v-else class="cell-value" :class="[(col.fieldType === 'select' || col.fieldType === 'fk') && row[col.field] != null && row[col.field] !== '' ? 'cell-tag' : '', col.fieldType === 'fk' ? 'cell-tag--fk' : '', col.fieldType === 'boolean' ? ['cell-boolean', ctx.getBooleanStateClass(row[col.field]), row[col.field] ? col.trueLabelClass : col.falseLabelClass] : '', ctx.hasFilterMatch(col) ? 'cell-highlighted' : '']" v-html="ctx.getCellHighlightHtml(row[col.field], col)"></span>
</template>
