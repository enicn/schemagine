<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElDialog, ElButton, ElCheckbox, ElSelect, ElOption, ElMessage } from 'element-plus'
import {
  convertCellValue,
  guessHeaderMapping,
  isHeaderFullyMatched,
  parseTsvGrid,
  parseCsvGrid,
  parseXlsxGrid,
  precheckImportRows,
  isImportableField,
} from '@/utils/clipboardImport'
import type { FieldSchema } from '@/types'

const props = defineProps<{
  visible: boolean
  fields: FieldSchema[]
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  confirm: [payload: { rows: Array<Record<string, unknown>>; mappedCount: number; source: 'clipboard' | 'file' }]
}>()

const PREVIEW_ROW_LIMIT = 5
/** 错误清单最多展示条数(超出仅提示总数) */
const ISSUE_DISPLAY_LIMIT = 50

const stage = ref<'input' | 'map'>('input')
const manualText = ref('')
const grid = ref<string[][]>([])
const includeFirstRow = ref(false)
const columnMappings = ref<Array<string | null>>([])
const autoMatched = ref(false)
const draggingKey = ref('')
const reading = ref(false)
/** docs/19 H5:数据来源,决定完成提示语 */
const dataSource = ref<'clipboard' | 'file'>('clipboard')
/** docs/19 H5:行级预检发现错误行时,勾选则跳过错误行,不勾选中止导入 */
const skipErrorRows = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const candidateFields = computed(() => props.fields.filter(isImportableField))

const fieldByKey = computed(() => {
  const map = new Map<string, FieldSchema>()
  for (const f of candidateFields.value) {
    map.set(f.key, f)
  }
  return map
})

const sourceColumns = computed(() => grid.value[0] ?? [])
const dataRows = computed(() => (includeFirstRow.value ? grid.value : grid.value.slice(1)))
const dataRowCount = computed(() => dataRows.value.length)
const previewRows = computed(() => dataRows.value.slice(0, PREVIEW_ROW_LIMIT))
const mappedCount = computed(() => columnMappings.value.filter(Boolean).length)
const importDisabled = computed(() => mappedCount.value === 0 || dataRowCount.value === 0)

// ── 行级预检(docs/19 H5):列映射/类型转换变化时即时重算,错误行可跳过或中止 ──
const columnFields = computed<Array<FieldSchema | null>>(() =>
  columnMappings.value.map(key => (key ? fieldByKey.value.get(key) ?? null : null)),
)

const rowIssues = computed(() => precheckImportRows(dataRows.value, columnFields.value))
const issueRowCount = computed(() => new Set(rowIssues.value.map(i => i.rowIndex)).size)
const validRowCount = computed(() => dataRowCount.value - issueRowCount.value)
const hasBlockingIssues = computed(() => rowIssues.value.length > 0 && !skipErrorRows.value)
const importBlocked = computed(() => importDisabled.value || hasBlockingIssues.value)
const displayedIssues = computed(() => rowIssues.value.slice(0, ISSUE_DISPLAY_LIMIT))

const importButtonText = computed(() => {
  if (rowIssues.value.length > 0 && skipErrorRows.value) {
    return `导入 ${validRowCount.value} 行（跳过 ${issueRowCount.value} 行错误）`
  }
  return `导入 ${dataRowCount.value} 行`
})

const isFieldMapped = computed(() => {
  const set = new Set<string>()
  for (const key of columnMappings.value) {
    if (key) set.add(key)
  }
  return set
})

function close(): void {
  emit('update:visible', false)
}

function resetState(): void {
  stage.value = 'input'
  manualText.value = ''
  grid.value = []
  includeFirstRow.value = false
  columnMappings.value = []
  autoMatched.value = false
  draggingKey.value = ''
  reading.value = false
  dataSource.value = 'clipboard'
  skipErrorRows.value = false
}

function applyGrid(parsed: string[][], source: 'clipboard' | 'file'): void {
  grid.value = parsed
  dataSource.value = source
  // 仅一行数据时没有表头可言，默认整行作为数据
  includeFirstRow.value = parsed.length === 1
  const guessed = guessHeaderMapping(parsed[0] ?? [], candidateFields.value)
  columnMappings.value = guessed.map(f => f?.key ?? null)
  autoMatched.value = isHeaderFullyMatched(parsed[0] ?? [], guessed)
  skipErrorRows.value = false
  stage.value = 'map'
}

// ── 文件导入(docs/19 H5):CSV 走文本解析,xlsx 走可选 peer(与导出共用),解析后进入同一映射向导 ──
async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  reading.value = true
  try {
    const isXlsx = /\.(xlsx|xls)$/i.test(file.name) || file.type.includes('sheet') || file.type.includes('excel')
    if (isXlsx) {
      const result = await parseXlsxGrid(await file.arrayBuffer())
      if ('error' in result) {
        if (result.error === 'missing-peer') {
          ElMessage.warning('解析 xlsx 需要可选依赖「xlsx」（与导出共用）；未安装时请改用 CSV 文件或剪贴板粘贴')
        } else {
          ElMessage.error(`文件解析失败：${result.message ?? '不是有效的 Excel 文件'}`)
        }
        return
      }
      if (result.grid.length === 0) {
        ElMessage.warning('文件内容为空或无法解析为表格')
        return
      }
      applyGrid(result.grid, 'file')
      return
    }

    const text = await file.text()
    const parsed = parseCsvGrid(text)
    if (parsed.length === 0) {
      ElMessage.warning('文件内容为空或无法解析为表格，请确认是 CSV 文件')
      return
    }
    applyGrid(parsed, 'file')
  } catch {
    ElMessage.error('文件读取失败，请重试')
  } finally {
    reading.value = false
  }
}

function handleSelectFile(): void {
  fileInputRef.value?.click()
}

function parseFromText(text: string): void {
  const parsed = parseTsvGrid(text)
  if (parsed.length === 0) {
    ElMessage.warning('剪贴板内容为空或无法解析为表格，请确认已复制 Excel 数据区域')
    return
  }
  applyGrid(parsed, 'clipboard')
}

async function tryAutoReadClipboard(): Promise<void> {
  reading.value = true
  try {
    if (!navigator.clipboard?.readText) return
    const text = await navigator.clipboard.readText()
    if (text && text.trim() !== '') {
      parseFromText(text)
    }
  } catch {
    // 剪贴板读取未授权/非安全上下文：留在手动粘贴页
  } finally {
    reading.value = false
  }
}

function handleReadClipboard(): void {
  void tryAutoReadClipboard()
}

function handleTextareaPaste(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData('text/plain')
  if (text) {
    event.preventDefault()
    parseFromText(text)
  }
}

function handleParseManual(): void {
  if (manualText.value.trim() !== '') {
    parseFromText(manualText.value)
  }
}

function backToInput(): void {
  stage.value = 'input'
}

function setColumnMapping(columnIndex: number, key: string | null | undefined): void {
  const next = key || null
  if (next) {
    // 同一字段只允许映射一列：后选者抢占，原列置为忽略
    columnMappings.value = columnMappings.value.map((k, i) => (i !== columnIndex && k === next ? null : k))
  }
  columnMappings.value[columnIndex] = next
}

function onChipDragStart(event: DragEvent, field: FieldSchema): void {
  draggingKey.value = field.key
  event.dataTransfer?.setData('text/plain', field.key)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
  }
}

function onChipDragEnd(): void {
  draggingKey.value = ''
}

function onColumnDragOver(event: DragEvent): void {
  if (draggingKey.value) {
    event.preventDefault()
  }
}

function onColumnDrop(event: DragEvent, columnIndex: number): void {
  event.preventDefault()
  const key = event.dataTransfer?.getData('text/plain') || draggingKey.value
  if (key && fieldByKey.value.has(key)) {
    setColumnMapping(columnIndex, key)
  }
  draggingKey.value = ''
}

function onChipsDrop(event: DragEvent): void {
  event.preventDefault()
  const key = event.dataTransfer?.getData('text/plain') || draggingKey.value
  if (key) {
    // 拖回候选区 = 取消该字段映射
    columnMappings.value = columnMappings.value.map(k => (k === key ? null : k))
  }
  draggingKey.value = ''
}

function formatPreviewValue(value: unknown, field: FieldSchema): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'boolean') {
    return value ? field.trueLabel || '是' : field.falseLabel || '否'
  }
  if (Array.isArray(value)) return value.map(v => String(v)).join('、')
  return String(value)
}

function previewCell(row: string[], columnIndex: number): string {
  const raw = row[columnIndex] ?? ''
  const key = columnMappings.value[columnIndex]
  if (!key) return raw
  const field = fieldByKey.value.get(key)
  if (!field) return raw
  return formatPreviewValue(convertCellValue(raw, field), field)
}

function handleImport(): void {
  // docs/19 H5:勾选跳过时,预检报错的行整行不导入;未勾选时按钮已禁用(中止)
  const errorRowIndexes = new Set(rowIssues.value.map(i => i.rowIndex))

  const rows: Array<Record<string, unknown>> = []
  dataRows.value.forEach((row, rowIdx) => {
    if (skipErrorRows.value && errorRowIndexes.has(rowIdx + 1)) return
    const record: Record<string, unknown> = {}
    let hasValue = false
    columnMappings.value.forEach((key, columnIndex) => {
      if (!key) return
      const field = fieldByKey.value.get(key)
      if (!field) return
      const converted = convertCellValue(row[columnIndex] ?? '', field)
      if (converted !== undefined) {
        record[key] = converted
        hasValue = true
      }
    })
    if (hasValue) {
      rows.push(record)
    }
  })
  if (rows.length === 0) {
    ElMessage.warning('没有可导入的数据行')
    return
  }
  emit('confirm', { rows, mappedCount: mappedCount.value, source: dataSource.value })
  close()
}

watch(() => props.visible, (visible) => {
  if (visible) {
    resetState()
    void tryAutoReadClipboard()
  }
})
</script>

<template>
  <ElDialog
    :model-value="visible"
    title="导入数据"
    width="880px"
    :close-on-click-modal="false"
    class="paste-excel-dialog"
    @update:model-value="(val: boolean) => emit('update:visible', val)"
  >
    <div v-if="stage === 'input'" class="paste-stage">
      <p class="paste-hint">
        支持 CSV / xlsx 文件导入，或先在 Excel 中复制数据区域后点击「读取剪贴板」；
        若浏览器未授权读取剪贴板，可直接在下方文本框中按 Ctrl+V 粘贴。
      </p>
      <div class="paste-actions">
        <ElButton type="primary" :loading="reading" @click="handleSelectFile">
          选择文件（CSV / xlsx）
        </ElButton>
        <ElButton :loading="reading" @click="handleReadClipboard">
          读取剪贴板
        </ElButton>
        <input
          ref="fileInputRef"
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          class="paste-file-input"
          @change="handleFileChange"
        />
      </div>
      <textarea
        v-model="manualText"
        class="paste-textarea"
        placeholder="或在此处按 Ctrl+V 粘贴 Excel 数据…"
        @paste="handleTextareaPaste"
      ></textarea>
    </div>

    <div v-else class="map-stage">
        <div class="map-status">
          <span v-if="autoMatched" class="match-ok">
            已按第一行自动匹配表头（{{ mappedCount }}/{{ sourceColumns.length }} 列）
          </span>
          <span v-else class="match-warn">
            第一行未能完全匹配表头，已显示为潜在表头，请手动映射各列
          </span>
          <span class="match-summary">共解析 {{ grid.length }} 行 × {{ sourceColumns.length }} 列</span>
        </div>

        <ElCheckbox v-model="includeFirstRow" size="small" class="include-first-row">
          包含第一行作为数据行（当前按{{ includeFirstRow ? '包含' : '表头' }}处理，共 {{ dataRowCount }} 行数据）
        </ElCheckbox>

        <div
          class="field-chips"
          :class="{ 'drop-active': draggingKey }"
          @dragover.prevent
          @drop="onChipsDrop"
        >
          <span class="chips-label">Schema 列（拖动到下方表格列完成匹配，拖回此处取消映射）：</span>
          <span
            v-for="field in candidateFields"
            :key="field.key"
            class="field-chip"
            :class="{ 'is-mapped': isFieldMapped.has(field.key), 'is-dragging': draggingKey === field.key }"
            draggable="true"
            @dragstart="onChipDragStart($event, field)"
            @dragend="onChipDragEnd"
          >
            {{ field.label }}
          </span>
        </div>

        <div class="map-table-wrapper">
          <table class="map-table">
            <thead>
              <tr>
                <th
                  v-for="(headerText, columnIndex) in sourceColumns"
                  :key="columnIndex"
                  class="map-col"
                  :class="{ 'is-mapped': columnMappings[columnIndex], 'drop-active': draggingKey }"
                  @dragover="onColumnDragOver"
                  @drop="onColumnDrop($event, columnIndex)"
                >
                  <div class="map-col-header" :title="headerText || `第${columnIndex + 1}列`">
                    {{ headerText || `第${columnIndex + 1}列` }}
                  </div>
                  <ElSelect
                    :model-value="columnMappings[columnIndex]"
                    placeholder="忽略该列"
                    clearable
                    size="small"
                    class="map-col-select"
                    @update:model-value="(val: unknown) => setColumnMapping(columnIndex, val as string | null)"
                  >
                    <ElOption
                      v-for="field in candidateFields"
                      :key="field.key"
                      :label="field.label"
                      :value="field.key"
                    />
                  </ElSelect>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rowIndex) in previewRows" :key="rowIndex">
                <td
                  v-for="(headerText, columnIndex) in sourceColumns"
                  :key="columnIndex"
                  class="preview-cell"
                  :class="{ 'is-unmapped': !columnMappings[columnIndex] }"
                  :title="row[columnIndex]"
                >
                  {{ previewCell(row, columnIndex) }}
                </td>
              </tr>
              <tr v-if="previewRows.length === 0">
                <td :colspan="sourceColumns.length" class="preview-empty">没有数据行，可勾选「包含第一行作为数据行」</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="dataRowCount > previewRows.length" class="preview-note">
          仅预览前 {{ previewRows.length }} 行，导入时包含全部 {{ dataRowCount }} 行数据
        </p>

        <!-- 行级预检(docs/19 H5):带行号的错误清单;勾选跳过则错误行不导入,不勾选则中止 -->
        <div v-if="rowIssues.length > 0" class="issue-panel">
          <div class="issue-summary">
            <span class="issue-title">行级预检发现 {{ rowIssues.length }} 个问题（涉及 {{ issueRowCount }} 行）：</span>
            <ElCheckbox v-model="skipErrorRows" size="small">
              跳过 {{ issueRowCount }} 个错误行，导入其余 {{ validRowCount }} 行
            </ElCheckbox>
          </div>
          <ul class="issue-list">
            <li v-for="(issue, idx) in displayedIssues" :key="idx" class="issue-item">
              第 {{ issue.rowIndex }} 行<template v-if="issue.fieldLabel">「{{ issue.fieldLabel }}」</template>：{{ issue.message }}
            </li>
          </ul>
          <p v-if="rowIssues.length > displayedIssues.length" class="issue-more">
            仅显示前 {{ displayedIssues.length }} 条，其余 {{ rowIssues.length - displayedIssues.length }} 条不再展示
          </p>
          <p v-if="!skipErrorRows" class="issue-block-hint">
            存在错误行时导入已中止；勾选「跳过错误行」后可导入其余 {{ validRowCount }} 行。
          </p>
        </div>
      </div>

    <template #footer>
      <ElButton v-if="stage === 'input'" @click="close">取消</ElButton>
      <ElButton
        v-if="stage === 'input'"
        type="primary"
        :disabled="manualText.trim() === ''"
        @click="handleParseManual"
      >
        解析
      </ElButton>
      <ElButton v-if="stage !== 'input'" @click="backToInput">重新粘贴</ElButton>
      <ElButton v-if="stage !== 'input'" @click="close">取消</ElButton>
      <ElButton
        v-if="stage !== 'input'"
        type="primary"
        :disabled="importBlocked"
        @click="handleImport"
      >
        {{ importButtonText }}
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.paste-hint {
  margin: 0 0 var(--sg-spacing-4);
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
  line-height: 1.6;
}
.paste-actions {
  margin-bottom: var(--sg-spacing-4);
}
.paste-file-input {
  display: none;
}
.issue-panel {
  margin-top: var(--sg-spacing-4);
  padding: var(--sg-spacing-3) var(--sg-spacing-4);
  border: 1px solid var(--sg-color-danger-light-7, var(--sg-border-color-light));
  border-radius: var(--sg-radius-md);
  background: var(--sg-color-danger-light-9, var(--sg-fill-color-lighter));
}
.issue-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sg-spacing-4);
  flex-wrap: wrap;
  margin-bottom: var(--sg-spacing-2);
}
.issue-title {
  font-size: var(--sg-font-size-sm);
  font-weight: 600;
  color: var(--sg-color-danger);
}
.issue-list {
  margin: 0;
  padding: 0 0 0 var(--sg-spacing-5);
  max-height: 120px;
  overflow: auto;
  font-size: var(--sg-font-size-xs);
  color: var(--sg-text-color-regular);
  line-height: 1.7;
}
.issue-more {
  margin: var(--sg-spacing-1) 0 0;
  font-size: var(--sg-font-size-xs);
  color: var(--sg-text-color-secondary);
}
.issue-block-hint {
  margin: var(--sg-spacing-1) 0 0;
  font-size: var(--sg-font-size-xs);
  color: var(--sg-color-warning);
}
.paste-textarea {
  box-sizing: border-box;
  width: 100%;
  height: 160px;
  padding: var(--sg-spacing-3) var(--sg-spacing-4);
  border: 1px dashed var(--sg-border-color);
  border-radius: var(--sg-radius-md);
  font-size: var(--sg-font-size-sm);
  font-family: var(--sg-font-family);
  color: var(--sg-text-color-primary);
  background: var(--sg-fill-color-lighter);
  resize: vertical;
}
.paste-textarea:focus {
  outline: none;
  border-color: var(--sg-color-primary);
  background: var(--sg-bg-color);
}
.map-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sg-spacing-4);
  margin-bottom: var(--sg-spacing-3);
  font-size: var(--sg-font-size-sm);
}
.match-ok {
  color: var(--sg-color-success);
  font-weight: 600;
}
.match-warn {
  color: var(--sg-color-warning);
  font-weight: 600;
}
.match-summary {
  color: var(--sg-text-color-secondary);
  flex-shrink: 0;
}
.include-first-row {
  margin-bottom: var(--sg-spacing-3);
}
.field-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sg-spacing-2);
  padding: var(--sg-spacing-2) var(--sg-spacing-3);
  margin-bottom: var(--sg-spacing-3);
  border: 1px dashed var(--sg-border-color-light);
  border-radius: var(--sg-radius-md);
  transition: border-color var(--sg-duration-fast) ease;
}
.field-chips.drop-active {
  border-color: var(--sg-color-primary);
  background: var(--sg-color-primary-light-9);
}
.chips-label {
  font-size: var(--sg-font-size-xs);
  color: var(--sg-text-color-secondary);
}
.field-chip {
  display: inline-block;
  padding: var(--sg-spacing-1) var(--sg-spacing-3);
  font-size: var(--sg-font-size-xs);
  line-height: 1.5;
  color: var(--sg-text-color-regular);
  background: var(--sg-fill-color-light);
  border: 1px solid var(--sg-border-color-light);
  border-radius: var(--sg-radius-round);
  cursor: grab;
  user-select: none;
  transition: all var(--sg-duration-fast) ease;
}
.field-chip:hover {
  border-color: var(--sg-color-primary);
  color: var(--sg-color-primary);
}
.field-chip.is-mapped {
  color: var(--sg-text-color-disabled);
  background: var(--sg-fill-color-lighter);
  border-style: dashed;
  opacity: 0.75;
}
.field-chip.is-dragging {
  opacity: 0.5;
}
.map-table-wrapper {
  overflow: auto;
  border: 1px solid var(--sg-border-color-light);
  border-radius: var(--sg-radius-md);
  max-height: 320px;
}
.map-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--sg-font-size-sm);
}
.map-table th {
  position: sticky;
  top: 0;
  z-index: var(--sg-z-index-base);
  min-width: 140px;
  padding: var(--sg-spacing-2) var(--sg-spacing-3);
  text-align: left;
  vertical-align: top;
  background: var(--sg-fill-color-light);
  border-bottom: 2px solid var(--sg-border-color-light);
}
.map-col-header {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--sg-text-color-primary);
  margin-bottom: var(--sg-spacing-1);
}
.map-col.is-mapped .map-col-header {
  color: var(--sg-color-primary);
}
.map-col.drop-active {
  background: var(--sg-color-primary-light-9);
  outline: 2px dashed var(--sg-color-primary);
  outline-offset: -2px;
}
.map-col-select {
  width: 100%;
}
.map-table td {
  max-width: 160px;
  padding: var(--sg-spacing-2) var(--sg-spacing-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-bottom: 1px solid var(--sg-border-color-lighter);
  color: var(--sg-text-color-regular);
}
.preview-cell.is-unmapped {
  color: var(--sg-text-color-disabled);
  background: var(--sg-fill-color-lighter);
}
.preview-empty {
  text-align: center;
  color: var(--sg-text-color-secondary);
  padding: var(--sg-spacing-5) 0 !important;
}
.preview-note {
  margin: var(--sg-spacing-2) 0 0;
  font-size: var(--sg-font-size-xs);
  color: var(--sg-text-color-secondary);
}
</style>
