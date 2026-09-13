<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElButton, ElMessage } from 'element-plus'
import type { FieldSchema } from '@/types'
import { mediaService, isMediaId } from '@/services/api/mediaService'
import MediaImageCell from '@/components/field/MediaImageCell.vue'
import MediaPickerDialog from '@/components/media/MediaPickerDialog.vue'

/**
 * mediaImage 字段编辑器：值即媒体 id。
 * 支持从媒体库选取、直接上传新资源（自动填入新 id）、清除。
 */
const props = defineProps<{
  value: unknown
  fieldSchema: FieldSchema
  disabled?: boolean
  readonly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
  blur: [payload: void]
  focus: [payload: void]
}>()

const pickerVisible = ref(false)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

/** 值变更后校验媒体 id 可解析（仅提示，不阻断保存） */
watch(
  () => props.value,
  (v) => {
    if (!isMediaId(v)) return
    mediaService.resolveUrls([v]).then((res) => {
      if (res.success && !res.data[v]) {
        ElMessage.warning(`媒体 ${v} 不存在，请重新选择图片`)
      }
    })
  },
  { immediate: true },
)

function onPicked(asset: { id: string }): void {
  emit('update:modelValue', asset.id)
  emit('blur')
}

function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  uploading.value = true
  mediaService
    .upload(file)
    .then((res) => {
      if (res.success) {
        emit('update:modelValue', res.data.id)
        ElMessage.success(`已上传：${res.data.file_name || file.name}`)
      } else {
        ElMessage.error(res.message || '上传失败')
      }
    })
    .finally(() => {
      uploading.value = false
      emit('blur')
    })
}

function clearValue(): void {
  emit('update:modelValue', '')
  emit('blur')
}
</script>

<template>
  <div class="media-image-editor">
    <div class="media-image-editor__preview">
      <MediaImageCell :value="value" />
      <span v-if="value == null || value === ''" class="media-image-editor__placeholder">未选择图片</span>
    </div>
    <div class="media-image-editor__actions">
      <ElButton
        size="small"
        :disabled="disabled || readonly"
        @click="pickerVisible = true; emit('focus')"
      >
        媒体库选择
      </ElButton>
      <ElButton
        size="small"
        type="primary"
        plain
        :loading="uploading"
        :disabled="disabled || readonly"
        @click="fileInput?.click()"
      >
        上传图片
      </ElButton>
      <ElButton
        v-if="value != null && value !== ''"
        size="small"
        text
        :disabled="disabled || readonly"
        @click="clearValue"
      >
        清除
      </ElButton>
    </div>
    <!-- 关键：不能用 hidden/display:none，否则部分浏览器/内嵌 webview 下 .click() 无法唤起系统文件选择框。
         用视觉隐藏但保持渲染（position:absolute + clip）确保始终可点击。 -->
    <input ref="fileInput" type="file" accept="image/*" class="media-image-editor__file" @change="onFileChange" />
    <MediaPickerDialog
      v-model="pickerVisible"
      :selected-id="typeof value === 'string' ? value : ''"
      @select="onPicked"
    />
  </div>
</template>

<style scoped>
.media-image-editor {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-6);
  width: 100%;
}
/* 视觉隐藏但保留渲染，保证 fileInput.click() 在各类浏览器/内嵌 webview 中都能唤起系统文件框 */
.media-image-editor__file {
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
.media-image-editor__preview {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-3);
  min-width: 76px;
  min-height: 40px;
}
.media-image-editor__placeholder {
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-secondary);
}
.media-image-editor__actions {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  flex-wrap: wrap;
}
</style>
