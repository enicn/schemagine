<script setup lang="ts">
import { formatDateTimeCell } from '@/utils/recordRow'
import { formatMoney } from '@/utils/formatMoney'
import { resolveEnumColor, resolveEnumTagStyle, type EnumTagStyle } from '@/utils/enumTag'
import { ref, computed, watch } from 'vue'
import type { FieldSchema } from '@/types'
import { useRuntimeCacheStore } from '@/stores/runtimeCacheStore'
import { candidateService } from '@/services/api/candidateService'
import { recordService } from '@/services/api/recordService'
import { resolveMediaUrl } from '@/services/api/mediaService'

const props = defineProps<{
  value: unknown
  fieldSchema: FieldSchema
}>()

const displayText = ref('')
const displayClass = ref('')
const cacheStore = useRuntimeCacheStore()

const isBoolean = computed(() => props.fieldSchema.type === 'boolean')
const isEnumType = computed(
  () => props.fieldSchema.type === 'select' || props.fieldSchema.type === 'multi-select' || props.fieldSchema.type === 'status',
)

interface EnumTagPart {
  label: string
  style: EnumTagStyle | null
}

/** 枚举彩色标签：任一取值声明了颜色（options[].color / statusMap）时逐值出标签，否则 null 走纯文本 */
const enumTags = computed<EnumTagPart[] | null>(() => {
  const field = props.fieldSchema
  if (!isEnumType.value) return null
  if (props.value == null || props.value === '') return null
  const parts = Array.isArray(props.value) ? props.value : [props.value]
  const tags: EnumTagPart[] = parts.map(part => ({
    label: field.options?.find(o => o.value === part || String(o.value) === String(part))?.label ?? String(part),
    style: resolveEnumTagStyle(resolveEnumColor(part, field.options, field.statusMap)),
  }))
  return tags.some(t => t.style) ? tags : null
})

const isImage = computed(
  () => props.fieldSchema.type === 'image' || props.fieldSchema.type === 'attachment',
)
const isMediaImage = computed(() => props.fieldSchema.type === 'mediaImage')
/** mediaImage：媒体 id 经 MediaService 解析出的可访问 URL（非媒体 id 的存量 URL 原样） */
const mediaSrc = ref('')
function imageSrc(): string {
  if (props.value == null) return ''
  return String(props.value)
}
function displaySrc(): string {
  return isMediaImage.value ? mediaSrc.value : imageSrc()
}
function openImage(): void {
  const src = displaySrc()
  if (src) window.open(src, '_blank', 'noopener')
}

function formatValue(value: unknown, field: FieldSchema): string {
  if (value === null || value === undefined) return ''
  if (field.type === 'boolean') {
    const trueLabel = field.trueLabel || '是'
    const falseLabel = field.falseLabel || '否'
    return value ? trueLabel : falseLabel
  }
  if (field.type === 'date' || field.type === 'datetime') {
    // 与表格单元格同口径：date 只出日期，datetime 出 日期+时分
    return formatDateTimeCell(value, field.type)
  }
  if (field.type === 'currency') {
    const num = Number(value)
    return isNaN(num) ? String(value) : `¥${num.toFixed(2)}`
  }
  if (field.type === 'money') {
    return formatMoney(value)
  }
  if (field.type === 'percent') {
    const num = Number(value)
    const decimal = field.decimal ?? 0
    const mode = field.decimalMode ?? 'fixed'
    if (mode === 'max') {
      return isNaN(num) ? String(value) : `${(num * 100).toString()}%`
    }
    return isNaN(num) ? String(value) : `${(num * 100).toFixed(decimal)}%`
  }
  if ((field.type === 'select' || field.type === 'multi-select') && field.options) {
    if (Array.isArray(value)) {
      return value.map(v => {
        const opt = field.options!.find(o => o.value === v)
        return opt?.label || String(v)
      }).join(', ')
    }
    const opt = field.options.find(o => o.value === value)
    return opt?.label || String(value)
  }
  return String(value)
}

/** fk 单 id → 展示 label：缓存 → 候选查询 → getDetail 兜底，全失败回落原始 id */
async function resolveFkDisplayLabel(targetModule: string, id: string): Promise<string> {
  const cached = cacheStore.getCandidates(targetModule, '')
  const cachedMatch = cached?.find(o => o.value === id)
  if (cachedMatch) return cachedMatch.label

  try {
    const res = await candidateService.query({
      targetModule,
      keyword: '',
      page: 1,
      pageSize: 200,
    })
    if (res.success) {
      const match = res.data.options.find(o => o.value === id)
      if (match) {
        cacheStore.setCandidates(targetModule, '', res.data.options)
        return match.label
      }
    }
  } catch {
    // candidate query failed, try recordService
  }

  try {
    const res = await recordService.getDetail(targetModule, id)
    if (res.success) {
      const record = res.data
      const labelField = record.fields.name ?? record.fields.label ?? record.fields.title
      const label = typeof labelField === 'string' ? labelField : id
      const existing = cacheStore.getCandidates(targetModule, '') || []
      cacheStore.setCandidates(targetModule, '', [{ value: id, label }, ...existing.filter(o => o.value !== id)])
      return label
    }
  } catch {
    // Keep showing raw value on error
  }
  return id
}

async function resolveDisplay(): Promise<void> {
  const { value, fieldSchema } = props

  if (isMediaImage.value) {
    mediaSrc.value = ''
    displayText.value = ''
    if (value != null && value !== '') {
      const url = await resolveMediaUrl(value)
      // 非可访问地址（如直传模式下的遗留媒体 id 恒等映射）不进 img，按原值文本展示
      if (/^(https?:)?\/\/|^\/|^data:|^blob:/i.test(url)) mediaSrc.value = url
      else displayText.value = String(value)
    }
    return
  }

  if (isBoolean.value) {
    displayText.value = formatValue(value, fieldSchema)
    displayClass.value = value ? (fieldSchema.trueLabelClass || '') : (fieldSchema.falseLabelClass || '')
    return
  }

  displayClass.value = ''

  if (fieldSchema.type === 'fk' && fieldSchema.targetModule && value != null && value !== '') {
    // fk 值单 id（字符串）或 id 数组（fkSearchMultiple 多选），逐个解析 label 后拼接
    const targetModule = fieldSchema.targetModule
    const ids = Array.isArray(value) ? value.map(String) : [String(value)]
    const labels = await Promise.all(ids.map(id => resolveFkDisplayLabel(targetModule, id)))
    displayText.value = labels.join('、')
  } else if (fieldSchema.type === 'one-to-many' || fieldSchema.type === 'many-to-many') {
    displayText.value = '\u{1F517} \u67E5\u770B\u5173\u8054'
  } else if (fieldSchema.type === 'reverse-ref') {
    displayText.value = '\u{1F4CB} \u67E5\u770B\u6E90\u5355\u636E'
  } else {
    displayText.value = formatValue(value, fieldSchema)
  }
}

watch(() => props.value, resolveDisplay, { immediate: true })
watch(() => props.fieldSchema, resolveDisplay, { immediate: true })
</script>

<template>
  <span class="value-renderer" :class="displayClass">
    <img
      v-if="(isImage || isMediaImage) && displaySrc()"
      :src="displaySrc()"
      class="vr-image"
      alt=""
      loading="lazy"
      @click="openImage"
    />
    <template v-else-if="enumTags">
      <span
        v-for="(tag, idx) in enumTags"
        :key="idx"
        class="vr-enum-tag"
        :style="tag.style ? { background: tag.style.background, color: tag.style.color, borderColor: tag.style.borderColor } : undefined"
      >{{ tag.label }}</span>
    </template>
    <template v-else>{{ displayText }}</template>
  </span>
</template>

<style scoped>
.value-renderer {
  font-size: var(--sg-font-size-md);
  color: var(--sg-text-color-primary);
  padding: 0 var(--sg-spacing-2);
}
.vr-enum-tag {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--sg-spacing-5);
  height: 24px;
  line-height: 24px;
  border-radius: var(--sg-radius-md);
  font-size: var(--sg-font-size-base);
  font-weight: 500;
  background: var(--sg-color-primary-light-9);
  color: var(--sg-color-primary);
  border: 1px solid var(--sg-color-primary-light-8);
}
.vr-enum-tag + .vr-enum-tag {
  margin-left: var(--sg-spacing-2);
}
.vr-image {
  display: inline-block;
  max-width: 72px;
  max-height: 72px;
  border-radius: var(--sg-radius-lg);
  object-fit: cover;
  cursor: zoom-in;
  border: 1px solid var(--sg-border-color-lighter);
  vertical-align: middle;
}
.vr-image:hover {
  box-shadow: var(--sg-shadow-md);
}
</style>
