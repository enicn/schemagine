<script setup lang="ts">
import { ref, watch } from 'vue'
import { resolveMediaUrl } from '@/services/api/mediaService'

/**
 * 媒体图片单元格：字段值为媒体 id 时经 MediaService 解析为可访问 URL 后渲染，
 * 既有记录中的静态/外部 URL 原样渲染（向后兼容）。点击新窗口预览大图。
 */
const props = withDefaults(defineProps<{
  value: unknown
  /** 是否允许点击预览 */
  preview?: boolean
}>(), {
  preview: true,
})

const src = ref('')

watch(
  () => props.value,
  (v) => {
    src.value = ''
    if (v == null || v === '') return
    resolveMediaUrl(v).then((url) => {
      src.value = url
    })
  },
  { immediate: true },
)

function open(): void {
  if (props.preview && src.value) window.open(src.value, '_blank', 'noopener')
}
</script>

<template>
  <img
    v-if="src"
    :src="src"
    class="media-image-cell"
    alt=""
    loading="lazy"
    @click.stop="open"
  />
  <span v-else-if="value != null && value !== ''" class="media-image-cell--pending">{{ String(value) }}</span>
</template>

<style scoped>
.media-image-cell {
  display: inline-block;
  max-width: 72px;
  max-height: 72px;
  border-radius: var(--sg-radius-lg);
  object-fit: cover;
  cursor: zoom-in;
  border: 1px solid var(--sg-border-color-lighter);
  vertical-align: middle;
}
.media-image-cell:hover {
  box-shadow: var(--sg-shadow-md);
}
.media-image-cell--pending {
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-secondary);
}
</style>
