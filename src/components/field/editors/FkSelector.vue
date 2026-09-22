<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue'
import { ElSelect, ElOption, ElButton, ElEmpty } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { useRuntimeCacheStore } from '@/stores/runtimeCacheStore'
import { candidateService } from '@/services/api/candidateService'
import { recordService } from '@/services/api/recordService'
import QuickCreateDialog from '@/engine/dialogs/QuickCreateDialog.vue'
import SchemaEngineDialog from '@/engine/dialogs/SchemaEngineDialog.vue'
import type { FieldSchema, CandidateOption } from '@/types'

const props = defineProps<{
  modelValue: unknown
  fieldSchema: FieldSchema
  readonly?: boolean
  disabled?: boolean
  allowQuickCreate?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | string[]]
  search: [payload: string]
  blur: [payload: void]
}>()

const cacheStore = useRuntimeCacheStore()

const loading = ref(false)
const options = ref<CandidateOption[]>([])
const searchKeyword = ref('')
const hasSearched = ref(false)
const noMatch = ref(false)
const cursorPage = ref(1)
const hasMore = ref(false)

const quickCreateVisible = ref(false)
const searchDialogVisible = ref(false)

const targetModule = computed(() => props.fieldSchema.targetModule || '')

/** 弹窗搜索多选开关（FieldSchema.fkSearchMultiple）：默认单选，显式开启才可多选 */
const searchMultiple = computed(() => !!props.fieldSchema.fkSearchMultiple)

/** 弹窗打开时的回显选中集（单选取首个，多选全量） */
const dialogSelectedIds = computed<string[]>(() => {
  const v = props.modelValue
  if (v == null || v === '') return []
  return Array.isArray(v) ? v.map(String) : [String(v)]
})

/** ElSelect 绑定值归一：multiple 模式要数组，单选要字符串 */
const selectValue = computed<string | string[]>(() => {
  const v = props.modelValue
  if (searchMultiple.value) {
    if (v == null || v === '') return []
    return Array.isArray(v) ? v.map(String) : [String(v)]
  }
  if (Array.isArray(v)) return String(v[0] ?? '')
  return v == null ? '' : String(v)
})

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

async function loadOptions(keyword = '', append = false): Promise<void> {
  if (!targetModule.value) return

  if (!append) {
    const cached = cacheStore.getCandidates(targetModule.value, keyword)
    if (cached && !keyword) {
      options.value = cached
      noMatch.value = false
      hasMore.value = false
      return
    }
  }

  loading.value = true
  hasSearched.value = true
  try {
    const page = append ? cursorPage.value : 1
    const res = await candidateService.query({
      targetModule: targetModule.value,
      keyword,
      page,
      pageSize: 50,
    })
    if (res.success) {
      if (append) {
        options.value = [...options.value, ...res.data.options]
      } else {
        options.value = res.data.options
        if (!keyword) {
          cacheStore.setCandidates(targetModule.value, keyword, res.data.options)
        }
      }
      noMatch.value = options.value.length === 0
      hasMore.value = res.data.hasMore

      if (props.modelValue != null && props.modelValue !== '') {
        const ids = Array.isArray(props.modelValue) ? props.modelValue.map(String) : [String(props.modelValue)]
        if (ids.some(id => !options.value.some(o => o.value === id))) {
          resolveMissingFkLabel(ids.find(id => !options.value.some(o => o.value === id))!)
        }
      }
    } else {
      if (!append) {
        options.value = []
        noMatch.value = true
      }
      hasMore.value = false
    }
  } finally {
    loading.value = false
  }
}

watch(targetModule, () => {
  resetSearch()
  loadOptions()
}, { immediate: true })

watch(() => props.modelValue, (val) => {
  if (val == null || val === '') return
  if (!targetModule.value) return
  const ids = Array.isArray(val) ? val.map(String) : [String(val)]
  if (ids.every(id => options.value.some(o => o.value === id))) return
  for (const id of ids) {
    if (!options.value.some(o => o.value === id)) resolveMissingFkLabel(id)
  }
})

async function resolveMissingFkLabel(id: string): Promise<void> {
  const cached = cacheStore.getCandidates(targetModule.value, '')
  const cachedMatch = cached?.find(o => o.value === id)
  if (cachedMatch) {
    options.value = [cachedMatch, ...options.value.filter(o => o.value !== id)]
    return
  }

  try {
    const res = await recordService.getDetail(targetModule.value, id)
    if (res.success) {
      const record = res.data
      const labelField = record.fields.name ?? record.fields.label ?? record.fields.title
      const label = typeof labelField === 'string' ? labelField : id
      const newOption: CandidateOption = { value: id, label }
      options.value = [newOption, ...options.value.filter(o => o.value !== id)]
      cacheStore.setCandidates(targetModule.value, '', options.value)
    }
  } catch {
    // Keep raw value on error
  }
}

function debounceSearch(keyword: string): void {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }
  searchDebounceTimer = setTimeout(() => {
    searchKeyword.value = keyword
    cursorPage.value = 1
    hasMore.value = false
    loadOptions(keyword)
    emit('search', keyword)
  }, 300)
}

function resetSearch(): void {
  searchKeyword.value = ''
  cursorPage.value = 1
  hasMore.value = false
  hasSearched.value = false
  noMatch.value = false
  options.value = []
}

function handleChange(value: string | string[]): void {
  noMatch.value = false
  emit('update:modelValue', value)
}

/** 弹窗搜索确认：把选中行并入候选缓存并回填字段值（单选=id 字符串，多选=id 数组） */
function handleSearchConfirm(rows: Array<{ id: string; label: string }>): void {
  searchDialogVisible.value = false
  if (rows.length === 0) return
  const picked = rows.map(r => ({ value: r.id, label: r.label }))
  options.value = [...picked, ...options.value.filter(o => !picked.some(p => p.value === o.value))]
  noMatch.value = false
  const first = picked[0]
  if (!first) return
  cacheStore.setCandidates(targetModule.value, '', options.value)
  emit('update:modelValue', searchMultiple.value ? picked.map(p => p.value) : first.value)
  emit('blur')
}

function openSearchDialog(): void {
  searchDialogVisible.value = true
}

function handleSearchDialogClose(): void {
  searchDialogVisible.value = false
}

function handleQuickCreate(): void {
  quickCreateVisible.value = true
}

function handleQuickCreateCreated(payload: { id: string; label: string; value: string }): void {
  quickCreateVisible.value = false

  const newOption: CandidateOption = { value: payload.value, label: payload.label }
  options.value = [newOption, ...options.value.filter(o => o.value !== payload.value)]
  noMatch.value = false

  cacheStore.setCandidates(targetModule.value, '', options.value)

  emit('update:modelValue', payload.value)
}

function handleQuickCreateCancel(): void {
  quickCreateVisible.value = false
}

function handleQuickCreateClose(): void {
  quickCreateVisible.value = false
}

function handleBlur(): void {
  emit('blur')
}

function handleVisibleChange(visible: boolean): void {
  if (!visible) {
    noMatch.value = false
    hasSearched.value = false
  }
}

onUnmounted(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }
})
</script>

<template>
  <div class="fk-selector">
    <ElSelect
      :model-value="selectValue"
      :placeholder="fieldSchema.placeholder || `选择${fieldSchema.label}`"
      :disabled="disabled || readonly"
      :loading="loading"
      :clearable="!readonly"
      :multiple="searchMultiple"
      :no-data-text="hasSearched && noMatch ? '未找到匹配项' : undefined"
      filterable
      remote
      :remote-method="debounceSearch"
      :popper-class="'fk-selector-popper'"
      class="full-width"
      @update:model-value="handleChange"
      @visible-change="handleVisibleChange"
      @blur="handleBlur"
    >
      <ElOption
        v-for="opt in options"
        :key="opt.value"
        :label="opt.label"
        :value="opt.value"
        :disabled="opt.disabled"
      />
      <template v-if="hasSearched && noMatch && searchKeyword" #empty>
        <div class="no-match-footer">
          <ElEmpty :image-size="60">
            <template #description>
              未找到 "{{ searchKeyword }}" 的匹配项
            </template>
          </ElEmpty>
        </div>
      </template>
      <!-- 快速新建：常驻下拉底部（字段可选属性 quickCreate 开启时渲染）；
           无匹配空态同样可用，搜索关键词经 prefill 自动带入名称 -->
      <template v-if="allowQuickCreate && !readonly" #footer>
        <ElButton type="primary" size="small" class="quick-create-btn" @click="handleQuickCreate">
          + 新建{{ fieldSchema.label }}
        </ElButton>
      </template>
    </ElSelect>

    <!-- 弹窗搜索：按目标模块打开完整列表界面选择（完整列/筛选/排序/分页），
         确认后回填字段值；默认单选，fkSearchMultiple 开启才可多选 -->
    <ElButton
      class="fk-search-btn"
      :icon="Search"
      :title="`搜索选择${fieldSchema.label}`"
      :disabled="disabled || readonly || !targetModule"
      @click="openSearchDialog"
    />

    <SchemaEngineDialog
      :visible="searchDialogVisible"
      :module-id="targetModule"
      :title="`选择${fieldSchema.label}`"
      selectable
      :selectable-multiple="searchMultiple"
      :selected-ids="dialogSelectedIds"
      @confirm="handleSearchConfirm"
      @close="handleSearchDialogClose"
    />

    <QuickCreateDialog
      :visible="quickCreateVisible"
      :target-module-id="targetModule"
      :prefill-data="searchKeyword ? { name: searchKeyword } : undefined"
      @created="handleQuickCreateCreated"
      @cancel="handleQuickCreateCancel"
      @close="handleQuickCreateClose"
    />
  </div>
</template>

<style scoped>
.fk-selector {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
}
.full-width {
  flex: 1;
}
.fk-search-btn {
  flex-shrink: 0;
}
</style>

<style>
.fk-selector-popper .no-match-footer {
  padding: var(--sg-spacing-4);
  text-align: center;
}
.fk-selector-popper .quick-create-btn {
  margin-top: var(--sg-spacing-4);
}
</style>
