<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElButton, ElDialog, ElForm, ElFormItem, ElImage, ElInput, ElMessage, ElMessageBox, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn } from 'element-plus'
import { mediaService, peekMediaService, type MediaAsset } from '@/services/api/mediaService'

/**
 * 媒体库管理页（docs/17 模式四的宿主组件）：上传（多选）、按类型/关键字筛选、
 * 分页浏览、复制 ID/URL、删除、手动登记外部 URL——选择器的孪生管理面，
 * 供宿主挂到路由页或弹窗（如 supply_chain 后台的「媒体管理」）。
 *
 * 数据面是注入的 IMediaService：list/upload 必选即出列表与上传；
 * remove/createManual 可选能力缺失时对应入口自动隐藏。
 */
const props = withDefaults(defineProps<{
  /** 列表页大小（服务端分页） */
  pageSize?: number
  /** 上传控件 accept */
  accept?: string
  /** 类型筛选下拉可选项 */
  kinds?: string[]
}>(), {
  pageSize: 20,
  accept: 'image/*,video/*,audio/*,.pdf,.zip',
  kinds: () => ['image', 'video', 'audio', 'file'],
})

const KIND_LABEL: Record<string, string> = { image: '图片', video: '视频', audio: '音频', file: '文件' }
const SOURCE_LABEL: Record<string, string> = { upload: '上传', manual: '手动录入' }

const rows = ref<MediaAsset[]>([])
const loading = ref(false)
const uploadingCount = ref(0)
const page = ref(1)
const pageSize = ref(props.pageSize)
const total = ref(0)
const filterKind = ref('')
const keyword = ref('')

// 可选能力探测：服务注入晚于挂载也能生效——load() 每次刷新前重探
const canRemove = ref(false)
const canCreateManual = ref(false)
// 扩展列按数据出现才渲染（driver/source/created_at 是宿主扩展字段，约定外不强求）
const hasDriver = computed(() => rows.value.some((r) => r.driver))
const hasSource = computed(() => rows.value.some((r) => r.source))
const hasCreatedAt = computed(() => rows.value.some((r) => r.created_at))

function fmtSize(n?: number): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function fmtTime(v?: unknown): string {
  if (!v) return '—'
  const d = new Date(String(v))
  if (Number.isNaN(d.getTime())) return String(v)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function load(): Promise<void> {
  loading.value = true
  canRemove.value = !!peekMediaService()?.remove
  canCreateManual.value = !!peekMediaService()?.createManual
  try {
    const res = await mediaService.list({
      page: page.value,
      pageSize: pageSize.value,
      kind: filterKind.value || undefined,
      keyword: keyword.value.trim() || undefined,
    })
    if (!res.success) {
      ElMessage.error(res.message || '媒体列表加载失败')
      return
    }
    // 删除后当前页可能已超出范围：回退到末页重取一次
    if (page.value > 1 && res.data.items.length === 0 && res.data.total > 0) {
      page.value = Math.max(1, Math.ceil(res.data.total / pageSize.value))
      return load()
    }
    rows.value = res.data.items
    total.value = res.data.total
  } finally {
    loading.value = false
  }
}

function search(): void {
  page.value = 1
  load()
}

async function uploadFiles(files: FileList | File[]): Promise<void> {
  const list = Array.from(files)
  if (!list.length) return
  uploadingCount.value = list.length
  let okCount = 0
  for (const file of list) {
    const res = await mediaService.upload(file)
    if (res.success) okCount++
    else ElMessage.error(res.message || `上传失败：${file.name}`)
    uploadingCount.value--
  }
  if (okCount) ElMessage.success(`已上传 ${okCount} 个文件`)
  page.value = 1
  load()
}

function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const files = input.files
  input.value = ''
  if (files?.length) void uploadFiles(files)
}

function triggerUpload(e: MouseEvent): void {
  // 表格/弹层场景下 template ref 不挂到当前作用域，就近查工具栏内的 file input 最稳
  const el = e.currentTarget as HTMLElement
  const input = el.closest('.sg-media-library__toolbar')?.querySelector('input[type="file"]') as HTMLInputElement | null
  input?.click()
}

async function copyText(text: string, okMsg: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(okMsg)
  } catch {
    ElMessage.error('复制失败，请手动选择复制')
  }
}

async function remove(row: MediaAsset): Promise<void> {
  const ok = await ElMessageBox.confirm(`确定删除「${row.file_name || row.id}」？删除后引用该媒体的字段将无法显示图片。`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  }).then(() => true, () => false)
  if (!ok) return
  const res = await mediaService.remove(row.id)
  if (res.success) {
    ElMessage.success('已删除')
    load()
  } else {
    ElMessage.error(res.message || '删除失败，请重试')
  }
}

// ---- 手动登记 ----
const createVisible = ref(false)
const createForm = reactive({ file_name: '', url: '', kind: 'image' })

function openCreate(): void {
  createForm.file_name = ''
  createForm.url = ''
  createForm.kind = 'image'
  createVisible.value = true
}

async function submitCreate(): Promise<void> {
  if (!createForm.file_name || !createForm.url) {
    ElMessage.warning('请填写文件名和资源 URL')
    return
  }
  const res = await mediaService.createManual({ ...createForm })
  if (res.success) {
    ElMessage.success('已登记')
    createVisible.value = false
    page.value = 1
    load()
  } else {
    ElMessage.error(res.message || '登记失败')
  }
}

const previewList = computed(() => rows.value.filter((r) => (r.kind ?? 'image') === 'image').map((r) => r.url))

onMounted(() => {
  void load()
})

defineExpose({ refresh: load, uploadFiles })
</script>

<template>
  <div class="sg-media-library">
    <div class="sg-media-library__toolbar">
      <div class="sg-media-library__hint">
        文件统一登记为媒体记录；业务字段引用「媒体 ID」，引擎编辑时可调出媒体选择。
      </div>
      <div class="sg-media-library__actions">
        <!-- 与引擎编辑器同款：input 视觉隐藏但保留渲染，保证 .click() 可唤起系统文件框 -->
        <input type="file" multiple :accept="accept" class="sg-media-library__file" @change="onFileChange" />
        <ElButton type="primary" :loading="uploadingCount > 0" @click="triggerUpload">
          上传文件{{ uploadingCount > 0 ? `（${uploadingCount}）` : '' }}
        </ElButton>
        <ElButton v-if="canCreateManual" @click="openCreate">新建资源</ElButton>
        <ElButton :disabled="loading" @click="load">刷新</ElButton>
      </div>
    </div>

    <div class="sg-media-library__filters">
      <ElSelect v-model="filterKind" placeholder="全部类型" clearable style="width: 120px" @change="search">
        <ElOption v-for="k in kinds" :key="k" :label="KIND_LABEL[k] || k" :value="k" />
      </ElSelect>
      <ElInput
        v-model="keyword"
        placeholder="文件名 / 媒体 ID"
        clearable
        style="width: 220px"
        @keyup.enter="search"
        @clear="search"
      />
      <ElButton :disabled="loading" @click="search">查询</ElButton>
    </div>

    <ElTable
      :data="rows"
      :class="{ 'is-loading': loading }"
      class="sg-media-library__table"
      border
      stripe
      empty-text="暂无媒体资源"
    >
      <ElTableColumn label="预览" width="96" align="center">
        <template #default="{ row }">
          <ElImage
            v-if="(row.kind ?? 'image') === 'image' && row.url"
            :src="row.url"
            :preview-src-list="previewList"
            :initial-index="Math.max(0, previewList.indexOf(row.url))"
            fit="cover"
            preview-teleported
            class="sg-media-library__thumb"
          >
            <template #error><div class="sg-media-library__thumb--err">加载失败</div></template>
          </ElImage>
          <span v-else class="sg-media-library__kind-tag">{{ KIND_LABEL[row.kind] || '文件' }}</span>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="file_name" label="文件名" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.file_name || row.id }}</template>
      </ElTableColumn>
      <ElTableColumn label="类型" width="80" align="center">
        <template #default="{ row }">{{ KIND_LABEL[row.kind] || row.kind || '—' }}</template>
      </ElTableColumn>
      <ElTableColumn label="MIME" min-width="130" show-overflow-tooltip>
        <template #default="{ row }">{{ row.mime || '—' }}</template>
      </ElTableColumn>
      <ElTableColumn label="大小" width="90" align="right">
        <template #default="{ row }">{{ fmtSize(row.size) }}</template>
      </ElTableColumn>
      <ElTableColumn v-if="hasDriver" label="存储" width="90" align="center">
        <template #default="{ row }">{{ String(row.driver ?? '—') }}</template>
      </ElTableColumn>
      <ElTableColumn v-if="hasSource" label="来源" width="90" align="center">
        <template #default="{ row }">{{ SOURCE_LABEL[String(row.source)] || String(row.source ?? '—') }}</template>
      </ElTableColumn>
      <ElTableColumn v-if="hasCreatedAt" label="创建时间" width="150">
        <template #default="{ row }">{{ fmtTime(row.created_at) }}</template>
      </ElTableColumn>
      <ElTableColumn label="操作" :width="canRemove ? 210 : 150" fixed="right">
        <template #default="{ row }">
          <ElButton link type="primary" size="small" @click="copyText(row.id, `媒体 ID 已复制：${row.id}`)">复制ID</ElButton>
          <ElButton link type="primary" size="small" @click="copyText(row.url, 'URL 已复制')">复制URL</ElButton>
          <ElButton v-if="canRemove" link type="danger" size="small" @click="remove(row)">删除</ElButton>
        </template>
      </ElTableColumn>
    </ElTable>

    <div class="sg-media-library__pager">
      <ElPagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        @current-change="load"
        @size-change="() => { page = 1; load() }"
      />
    </div>

    <ElDialog v-model="createVisible" title="新建媒体资源" width="480px" append-to-body>
      <ElForm :model="createForm" label-position="top">
        <ElFormItem label="文件名" required>
          <ElInput v-model="createForm.file_name" placeholder="如 首页banner.png" maxlength="128" />
        </ElFormItem>
        <ElFormItem label="资源 URL" required>
          <ElInput v-model="createForm.url" placeholder="https://…" clearable />
        </ElFormItem>
        <ElFormItem label="类型">
          <ElSelect v-model="createForm.kind">
            <ElOption v-for="k in kinds" :key="k" :label="KIND_LABEL[k] || k" :value="k" />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="createVisible = false">取消</ElButton>
        <ElButton type="primary" @click="submitCreate">登记</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.sg-media-library {
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-6);
  min-height: 320px;
}
.sg-media-library__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sg-spacing-6);
  flex: none;
}
.sg-media-library__hint {
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-secondary);
}
.sg-media-library__actions {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  flex: none;
}
/* 视觉隐藏但保留渲染，保证 .click() 在各类浏览器/内嵌 webview 中都能唤起系统文件框 */
.sg-media-library__file {
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
.sg-media-library__filters {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
  flex: none;
}
.sg-media-library__table {
  flex: 1;
  min-height: 220px;
}
.sg-media-library__table.is-loading {
  opacity: 0.6;
  pointer-events: none;
}
.sg-media-library__pager {
  display: flex;
  justify-content: flex-end;
  flex: none;
}
.sg-media-library__thumb {
  width: 64px;
  height: 64px;
  border-radius: var(--sg-radius-md);
  background: var(--sg-fill-color-light);
  display: block;
  cursor: zoom-in;
}
.sg-media-library__thumb :deep(img) {
  object-fit: cover;
}
.sg-media-library__thumb--err {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-secondary);
}
.sg-media-library__kind-tag {
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-secondary);
}
</style>
