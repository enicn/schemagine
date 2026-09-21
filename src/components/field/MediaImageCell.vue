<script setup lang="ts">
import { ref, watch } from 'vue'
import { resolveMediaUrl } from '@/services/api/mediaService'

/**
 * 媒体图片单元格：字段值为媒体 id 时经 MediaService 解析为可访问 URL 后渲染，
 * 既有记录中的静态/外部 URL 原样渲染（向后兼容）。
 * 注意：不做单击预览——单击/双击要留给表格行内编辑入口，看大图走媒体库管理页。
 */
const props = defineProps<{
  value: unknown
  /** 兼容保留：曾经控制单击预览，现恒不弹出（见上） */
  preview?: boolean
}>()

const src = ref('')

watch(
  () => props.value,
  (v) => {
    src.value = ''
    if (v == null || v === '') return
    resolveMediaUrl(v).then((url) => {
      // 解析结果不是可访问地址（如 oss/api 模式下的遗留媒体 id 恒等映射）按未解析处理，出文本占位
      src.value = /^(https?:)?\/\/|^\/|^data:|^blob:/i.test(url) ? url : ''
    })
  },
  { immediate: true },
)
</script>

<template>
  <img
    v-if="src"
    :src="src"
    class="media-image-cell"
    alt=""
    loading="lazy"
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
