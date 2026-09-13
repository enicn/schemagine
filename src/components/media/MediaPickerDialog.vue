<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElDialog, ElButton, ElInput, ElMessage } from 'element-plus'
import type { MediaAsset } from '@/services/api/mediaService'
import { mediaService } from '@/services/api/mediaService'

/**
 * 媒体库选择弹窗：从媒体库选取一张图片，或在弹窗内直接上传新资源后自动选中。
 * 数据源由宿主注入的 MediaService 提供；仅展示 kind=image 的资源。
 */
const props = defineProps<{
  modelValue: boolean
  /** 当前字段已选中的媒体 id（用于回显高亮） */
  selectedId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [visible: boolean]
  /** 确认选中（单击选中 + 确定，或双击直接确认） */
  select: [asset: MediaAsset]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const keyword = ref('')
const loading = ref(false)
const uploading = ref(false)
const assets = ref<MediaAsset[]>([])
const pickedId = ref('')

watch(visible, (v) => {
  if (v) {
    pickedId.value = props.selectedId ?? ''
    void load()
  }
})

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await mediaService.list({ keyword: keyword.value || undefined, page: 1, pageSize: 500 })
    if (res.success) {
      assets.value = res.data.items
    } else {
      ElMessage.error(res.message || '媒体库加载失败')
    }
  } finally {
    loading.value = false
  }
}

const imageAssets = computed(() => assets.value.filter((a) => (a.kind ?? 'image') === 'image'))

function pick(asset: MediaAsset): void {
  pickedId.value = asset.id
}

function confirmPick(): void {
  const asset = assets.value.find((a) => a.id === pickedId.value)
  if (!asset) {
    ElMessage.warning('请先选择一张图片')
    return
  }
  emit('select', asset)
  visible.value = false
}

function onDoubleClick(asset: MediaAsset): void {
  pickedId.value = asset.id
  emit('select', asset)
  visible.value = false
}

async function onFileChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  uploading.value = true
  try {
    const res = await mediaService.upload(file)
    if (res.success) {
      ElMessage.success(`已上传：${res.data.file_name || file.name}`)
      pickedId.value = res.data.id
      await load()
    } else {
      ElMessage.error(res.message || '上传失败')
    }
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <ElDialog
    v-model="visible"
    title="从媒体库选择图片"
    width="720px"
    append-to-body
    class="media-picker-dialog"
  >
    <div class="media-picker__toolbar">
      <ElInput
        v-model="keyword"
        class="media-picker__search"
        placeholder="按文件名搜索..."
        clearable
        @keydown.enter="load"
        @clear="load"
      />
      <ElButton @click="load">搜索</ElButton>
      <ElButton type="primary" :loading="uploading" tag="label">
        上传新图片
        <!-- 视觉隐藏但保留渲染（不能用 hidden/display:none），否则部分环境无法唤起系统文件框 -->
        <input type="file" accept="image/*" class="media-picker__file" @change="onFileChange" />
      </ElButton>
    </div>

    <div v-loading="loading" class="media-picker__grid">
      <div
        v-for="asset in imageAssets"
        :key="asset.id"
        class="media-picker__item"
        :class="{ 'is-picked': asset.id === pickedId }"
        :title="asset.file_name || asset.id"
        @click="pick(asset)"
        @dblclick="onDoubleClick(asset)"
      >
        <img :src="asset.url" :alt="asset.file_name || asset.id" loading="lazy" />
        <span class="media-picker__name">{{ asset.file_name || asset.id }}</span>
        <span v-if="asset.id === pickedId" class="media-picker__check">&#10003;</span>
      </div>
      <div v-if="!loading && imageAssets.length === 0" class="media-picker__empty">
        媒体库中暂无图片，可先「上传新图片」
      </div>
    </div>

    <template #footer>
      <ElButton @click="visible = false">取消</ElButton>
      <ElButton type="primary" @click="confirmPick">确定</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.media-picker__toolbar {
  display: flex;
  gap: var(--sg-spacing-4);
  margin-bottom: var(--sg-spacing-6);
}
/* 视觉隐藏但保留渲染，保证 label 关联的 file input 始终可唤起系统文件框 */
.media-picker__file {
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
.media-picker__search {
  flex: 1;
}
.media-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--sg-spacing-6);
  max-height: 420px;
  overflow-y: auto;
  min-height: 160px;
}
.media-picker__item {
  position: relative;
  border: 2px solid transparent;
  border-radius: var(--sg-radius-xl);
  padding: var(--sg-spacing-3);
  cursor: pointer;
  background: var(--sg-fill-color-light);
  transition: border-color var(--sg-duration-fast);
}
.media-picker__item:hover {
  border-color: var(--sg-text-color-placeholder);
}
.media-picker__item.is-picked {
  border-color: var(--sg-color-primary);
  background: var(--sg-color-primary-light-9);
  box-shadow: var(--sg-shadow-focus);
}
.media-picker__item img {
  width: 100%;
  height: 96px;
  object-fit: cover;
  border-radius: var(--sg-radius-md);
  display: block;
}
.media-picker__name {
  display: block;
  margin-top: var(--sg-spacing-2);
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.media-picker__check {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 20px;
  height: 20px;
  border-radius: var(--sg-radius-circle);
  background: var(--sg-color-primary);
  color: var(--sg-color-white);
  font-size: var(--sg-font-size-base);
  line-height: 20px;
  text-align: center;
}
.media-picker__empty {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--sg-text-color-secondary);
  padding: var(--sg-spacing-24) 0;
}
</style>
