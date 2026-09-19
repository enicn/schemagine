<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElButton, ElDialog, ElTable, ElTableColumn, ElInput, ElSelect, ElOption, ElPopconfirm, ElMessage } from 'element-plus'
import { relationService } from '@/services/api/relationService'
import { candidateService } from '@/services/api/candidateService'
import type { FieldSchema, RelationEntry, CandidateOption, RelationExtraField } from '@/types'

interface DraftRelation {
  id: string
  targetRecordId: string
  sourceModuleId?: string
  sourceRecordId?: string
  extraFields: Record<string, unknown>
  _original: Record<string, unknown>
  _isNew: boolean
  _deleted: boolean
}

const props = withDefaults(defineProps<{
  modelValue?: unknown
  fieldSchema: FieldSchema
  recordId: string
  moduleId: string
  readonly?: boolean
  disabled?: boolean
  autoOpen?: boolean
}>(), {
  modelValue: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
  'update:autoOpen': [value: boolean]
  close: []
}>()

const visible = ref(false)
const draftRelations = ref<DraftRelation[]>([])
const targetOptions = ref<CandidateOption[]>([])
const targetLoading = ref(false)
const isSaving = ref(false)

const relationConfig = computed(() => props.fieldSchema.relationConfig)
const reverseRefConfig = computed(() => props.fieldSchema.reverseRefConfig)
const isReverseRef = computed(() => props.fieldSchema.type === 'reverse-ref')
const extraFields = computed<RelationExtraField[]>(() => relationConfig.value?.extraFields ?? [])
const targetModule = computed(() => relationConfig.value?.targetModule ?? '')

const selectedTargetId = ref('')

const visibleRelations = computed(() => draftRelations.value.filter(r => !r._deleted))

const hasChanges = computed(() => {
  return draftRelations.value.some(r => {
    if (r._isNew || r._deleted) return true
    return extraFields.value.some(ef => r.extraFields[ef.key] !== r._original[ef.key])
  })
})

function deepClone(obj: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj))
}

async function loadDraft(): Promise<void> {
  if (!props.moduleId || !props.recordId || !props.fieldSchema.key) return

  const fieldKey = isReverseRef.value
    ? (reverseRefConfig.value?.relationFieldKey ?? props.fieldSchema.key)
    : props.fieldSchema.key
  const res = isReverseRef.value
    ? await relationService.getTargetRelations(props.moduleId, props.recordId, fieldKey)
    : await relationService.getRelations(props.moduleId, props.recordId, fieldKey)
  const rawRelations: RelationEntry[] = res.success ? res.data : []

  draftRelations.value = rawRelations.map(r => {
    const clonedExtra = deepClone(r.extraFields)
    return {
      id: r.id,
      targetRecordId: r.targetRecordId,
      sourceModuleId: r.sourceModuleId,
      sourceRecordId: r.sourceRecordId,
      extraFields: clonedExtra,
      _original: deepClone(r.extraFields),
      _isNew: false,
      _deleted: false,
    }
  })
}

function addDraftRelation(): void {
  if (!selectedTargetId.value) return

  const initExtra: Record<string, unknown> = {}
  for (const ef of extraFields.value) {
    initExtra[ef.key] = ef.defaultValue ?? ''
  }

  const draft: DraftRelation = {
    id: `__new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    targetRecordId: selectedTargetId.value,
    extraFields: initExtra,
    _original: deepClone(initExtra),
    _isNew: true,
    _deleted: false,
  }

  draftRelations.value.push(draft)
  selectedTargetId.value = ''
}

function markDelete(id: string): void {
  const found = draftRelations.value.find(r => r.id === id)
  if (found) {
    found._deleted = true
  }
}

function undoDelete(id: string): void {
  const found = draftRelations.value.find(r => r.id === id)
  if (found) {
    found._deleted = false
  }
}

async function handleSaveAll(): Promise<void> {
  if (!hasChanges.value) {
    ElMessage.info('没有需要保存的更改')
    return
  }

  isSaving.value = true
  try {
    const fieldKey = props.fieldSchema.key

    for (const draft of draftRelations.value) {
      if (draft._deleted && !draft._isNew) {
        await relationService.removeRelation(draft.id)
      } else if (draft._isNew && !draft._deleted) {
        await relationService.addRelation({
          sourceModuleId: props.moduleId,
          sourceRecordId: props.recordId,
          targetModuleId: targetModule.value,
          targetRecordId: draft.targetRecordId,
          fieldKey,
          extraFields: deepClone(draft.extraFields),
        })
      } else if (!draft._isNew && !draft._deleted) {
        const changed: Record<string, unknown> = {}
        for (const ef of extraFields.value) {
          if (draft.extraFields[ef.key] !== draft._original[ef.key]) {
            changed[ef.key] = draft.extraFields[ef.key]
          }
        }
        if (Object.keys(changed).length > 0) {
          await relationService.updateRelation(draft.id, changed)
        }
      }
    }

    ElMessage.success('关联已保存')
    await loadDraft()
    emit('update:modelValue', visibleRelations.value.length)
  } catch {
    ElMessage.error('保存失败')
  } finally {
    isSaving.value = false
  }
}

function handleCancel(): void {
  if (hasChanges.value) {
    loadDraft()
    ElMessage.info('更改已撤销')
  }
}

function getTargetLabel(targetRecordId: string): string {
  const opt = targetOptions.value.find(o => o.value === targetRecordId)
  return opt?.label ?? targetRecordId
}

async function loadTargetOptions(): Promise<void> {
  if (!targetModule.value) return
  targetLoading.value = true
  try {
    const res = await candidateService.query({
      targetModule: targetModule.value,
      page: 1,
      pageSize: 200,
    })
    if (res.success) {
      targetOptions.value = res.data.options
    }
  } finally {
    targetLoading.value = false
  }
}

function open(): void {
  visible.value = true
  loadDraft()
  loadTargetOptions()
}

function close(): void {
  if (hasChanges.value) {
    loadDraft()
  }
  visible.value = false
  emit('update:autoOpen', false)
  emit('close')
}

watch(() => props.autoOpen, (val) => {
  if (val) {
    open()
  }
}, { immediate: true })

watch(() => props.recordId, () => {
  if (visible.value) {
    loadDraft()
  }
})

onMounted(() => {
  loadDraft()
})
</script>

<template>
  <div class="relation-editor-trigger">
    <ElButton
      size="small"
      type="primary"
      plain
      :disabled="disabled"
      @click="open"
    >
      {{ draftRelations.length > 0 ? `${draftRelations.length} 笔关联` : (isReverseRef ? '查看源单据' : (disabled ? '查看关联' : '添加关联')) }}
    </ElButton>

    <ElDialog
      v-model="visible"
      :title="isReverseRef ? `${fieldSchema.label}（反向引用）` : fieldSchema.label"
      width="720px"
      top="8vh"
      :close-on-click-modal="false"
      @close="close"
    >
      <div class="relation-add-bar" v-if="!isReverseRef">
        <ElSelect
          v-model="selectedTargetId"
          :loading="targetLoading"
          filterable
          placeholder="选择要关联的记录"
          style="flex: 1"
        >
          <ElOption
            v-for="opt in targetOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
            :disabled="visibleRelations.some(r => r.targetRecordId === opt.value)"
          />
        </ElSelect>
        <ElButton
          type="primary"
          size="small"
          :disabled="!selectedTargetId"
          @click="addDraftRelation"
        >
          添加
        </ElButton>
      </div>

      <ElTable
        :data="visibleRelations"
        size="small"
        style="margin-top: var(--sg-spacing-8)"
        max-height="360"
      >
        <ElTableColumn
          :label="isReverseRef ? '源单据' : '关联记录'"
          min-width="160"
        >
          <template #default="{ row }">
            <template v-if="isReverseRef">
              {{ row.sourceModuleId }} / {{ row.sourceRecordId }}
            </template>
            <template v-else>
              {{ getTargetLabel(row.targetRecordId) }}
              <ElTag v-if="row._isNew" type="success" size="small" style="margin-left:var(--sg-spacing-3)">新增</ElTag>
            </template>
          </template>
        </ElTableColumn>

        <ElTableColumn
          v-for="ef in extraFields"
          :key="ef.key"
          :label="ef.label"
          :width="ef.type === 'select' ? 140 : 160"
        >
          <template #default="{ row }">
            <template v-if="ef.type === 'select' && ef.options">
              <ElSelect
                v-model="row.extraFields[ef.key]"
                size="small"
              >
                <ElOption
                  v-for="o in ef.options"
                  :key="String(o.value)"
                  :label="o.label"
                  :value="o.value"
                />
              </ElSelect>
            </template>
            <template v-else-if="ef.type === 'currency' || ef.type === 'number'">
              <ElInput
                v-model.number="row.extraFields[ef.key]"
                size="small"
                type="number"
                :placeholder="ef.placeholder"
              />
            </template>
            <template v-else>
              <ElInput
                v-model="row.extraFields[ef.key]"
                size="small"
                :placeholder="ef.placeholder"
              />
            </template>
          </template>
        </ElTableColumn>

        <ElTableColumn
          v-if="!isReverseRef"
          label="操作"
          width="80"
          fixed="right"
        >
          <template #default="{ row }">
            <ElPopconfirm
              title="确定移除此关联？"
              @confirm="markDelete(row.id)"
            >
              <template #reference>
                <ElButton
                  type="danger"
                  size="small"
                  text
                >
                  移除
                </ElButton>
              </template>
            </ElPopconfirm>
          </template>
        </ElTableColumn>
      </ElTable>

      <div v-if="!isReverseRef" class="deleted-info" v-show="draftRelations.some(r => r._deleted)">
        <ElTag
          v-for="d in draftRelations.filter(r => r._deleted)"
          :key="d.id"
          closable
          type="danger"
          size="small"
          style="margin-right:var(--sg-spacing-4);margin-top:var(--sg-spacing-4)"
          @close="undoDelete(d.id)"
        >
          已标记移除: {{ getTargetLabel(d.targetRecordId) }}
        </ElTag>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <span v-if="hasChanges" class="unsaved-hint">有未保存的更改</span>
          <span v-else></span>
          <div class="footer-actions">
            <ElButton @click="handleCancel" :disabled="!hasChanges">撤销更改</ElButton>
            <ElButton @click="close">取消</ElButton>
            <ElButton type="primary" :loading="isSaving" @click="handleSaveAll">保存</ElButton>
          </div>
        </div>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.relation-editor-trigger {
  display: inline-flex;
  align-items: center;
}
.relation-add-bar {
  display: flex;
  gap: var(--sg-spacing-4);
  align-items: center;
}
.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.unsaved-hint {
  color: var(--sg-color-warning);
  font-size: var(--sg-font-size-md);
}
.footer-actions {
  display: flex;
  gap: var(--sg-spacing-4);
}
.deleted-info {
  margin-top: var(--sg-spacing-2);
}
</style>
