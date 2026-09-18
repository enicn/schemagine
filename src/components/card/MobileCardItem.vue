<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ModuleSchema, RecordEntity } from '@/types'
import ValueRenderer from '@/components/field/editors/ValueRenderer.vue'
import { resolveMediaUrl } from '@/services/api/mediaService'
import { formatDateTimeCell } from '@/utils/recordRow'
import type { CardProjection } from '@/utils/cardProjection'

/**
 * 移动端卡片列表的单卡投影（§3.4）：**纯只读**——不含任何可编辑元素，
 * 点卡片唯一语义 = 打开详情底部面板（防滑动误触的结构性保证之一）。
 * 值渲染唯一入口 = ValueRenderer（与桌面表格/筛选同源同色）。
 * content-visibility:auto 跳过视口外卡片的 layout/paint（§3.5）。
 */
const props = defineProps<{
  record: RecordEntity
  schema: ModuleSchema
  projection: CardProjection
}>()

const emit = defineEmits<{
  open: [recordId: string]
}>()

const fieldByKey = computed(() => {
  const map = new Map<string, typeof props.schema.fields[number]>()
  for (const f of props.schema.fields) map.set(f.key, f)
  return map
})

const titleText = computed(() => {
  const key = props.projection.titleField
  if (key) {
    const v = props.record.fields[key]
    if (v !== undefined && v !== null && v !== '') return String(v)
  }
  return props.record.id
})

const statusFieldSchema = computed(() =>
  props.projection.statusField ? fieldByKey.value.get(props.projection.statusField) ?? null : null,
)

const metaFields = computed(() => {
  return props.projection.fields
    .map(key => fieldByKey.value.get(key))
    .filter((f): f is NonNullable<typeof f> => !!f)
})

const thumbFieldSchema = computed(() =>
  props.projection.thumbField ? fieldByKey.value.get(props.projection.thumbField) ?? null : null,
)

const thumbSrc = ref('')
watch(
  [() => thumbFieldSchema.value?.key, () => props.record.id],
  async () => {
    thumbSrc.value = ''
    const field = thumbFieldSchema.value
    if (!field) return
    const v = props.record.fields[field.key]
    if (v == null || v === '') return
    thumbSrc.value = await resolveMediaUrl(v)
  },
  { immediate: true },
)

const timeText = computed(() => {
  const raw = props.record.updatedAt || props.record.createdAt
  if (!raw) return ''
  return formatDateTimeCell(raw, 'datetime')
})
</script>

<template>
  <div
    class="sg-mobile-card"
    role="button"
    tabindex="0"
    @click="emit('open', record.id)"
    @keydown.enter="emit('open', record.id)"
  >
    <img v-if="thumbSrc" :src="thumbSrc" class="sg-mobile-card__thumb" alt="" loading="lazy" />
    <div class="sg-mobile-card__body">
      <div class="sg-mobile-card__head">
        <span class="sg-mobile-card__title">{{ titleText }}</span>
        <span v-if="statusFieldSchema" class="sg-mobile-card__status">
          <ValueRenderer :value="record.fields[statusFieldSchema.key]" :field-schema="statusFieldSchema" />
        </span>
      </div>
      <div v-if="metaFields.length" class="sg-mobile-card__meta">
        <template v-for="(f, i) in metaFields" :key="f.key">
          <span v-if="i > 0" class="sg-mobile-card__meta-dot">·</span>
          <span class="sg-mobile-card__meta-item">
            <ValueRenderer :value="record.fields[f.key]" :field-schema="f" />
          </span>
        </template>
      </div>
      <div v-if="timeText" class="sg-mobile-card__time">{{ timeText }}</div>
    </div>
  </div>
</template>

<style scoped>
.sg-mobile-card {
  display: flex;
  gap: var(--sg-spacing-3);
  padding: var(--sg-spacing-4);
  background: var(--sg-bg-color);
  border: 1px solid var(--sg-border-color-lighter);
  border-radius: var(--sg-radius-lg);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  /* 视口外不渲染（§3.5）：浏览器原生跳过 layout/paint，auto 记住上次渲染尺寸 */
  content-visibility: auto;
  contain-intrinsic-size: auto 120px;
}
.sg-mobile-card:active {
  background: var(--sg-fill-color-lighter);
}
.sg-mobile-card__thumb {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: var(--sg-radius-md);
  object-fit: cover;
  border: 1px solid var(--sg-border-color-lighter);
}
.sg-mobile-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-1);
}
.sg-mobile-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sg-spacing-2);
}
.sg-mobile-card__title {
  font-size: var(--sg-font-size-md);
  font-weight: 600;
  color: var(--sg-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.sg-mobile-card__status {
  flex-shrink: 0;
}
.sg-mobile-card__status :deep(.value-renderer) {
  padding: 0;
}
.sg-mobile-card__meta {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  overflow: hidden;
  gap: var(--sg-spacing-1);
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-regular);
  min-width: 0;
}
.sg-mobile-card__meta-dot {
  color: var(--sg-text-color-secondary);
  flex-shrink: 0;
}
.sg-mobile-card__meta-item {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-mobile-card__meta-item :deep(.value-renderer) {
  padding: 0;
  font-size: var(--sg-font-size-sm);
}
.sg-mobile-card__time {
  align-self: flex-end;
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
}
</style>
