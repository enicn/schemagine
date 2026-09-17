<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElDialog, ElButton, ElForm, ElFormItem, ElInput, ElInputNumber, ElSelect, ElOption, ElDatePicker, ElSwitch, ElMessage } from 'element-plus'
import { recordService } from '@/services/api/recordService'
import { schemaService } from '@/services/api/schemaService'
import { validateFieldValue, validateRecordRow } from '@/utils/fieldValidation'
import type { FieldSchema, ModuleSchema } from '@/types'

const props = defineProps<{
  visible: boolean
  targetModuleId: string
  prefillData?: Record<string, unknown>
}>()

const emit = defineEmits<{
  created: [payload: { id: string; label: string; value: string }]
  cancel: [payload: void]
  close: [payload: void]
}>()

const submitting = ref(false)
const schemaLoading = ref(false)
const formRef = ref<InstanceType<typeof ElForm> | null>(null)
const targetSchema = ref<ModuleSchema | null>(null)

const formModel = reactive<Record<string, any>>({})

const moduleName = computed(() => targetSchema.value?.name || '记录')

/**
 * 快速创建表单字段口径：
 * 1) 目标模块有独立模块定义 → 只渲染「必选字段」（默认值经 initFormModel 注入），
 *    可选字段留给目标模块页补录——弹层只收集必要信息；
 * 2) 定义存在但没有任何必选字段 → 回落到标签字段（name/label/title）；
 * 3) 目标无模块定义（schema record 虚表等）→ 降级为仅填 name，创建 {name} 记录。
 */
const formFields = computed<FieldSchema[]>(() => {
  if (!targetSchema.value) {
    return [{
      id: 'name', name: 'name', key: 'name', label: '名称', type: 'text',
      required: true, readonly: false, order: 0, visible: true, sortable: false, filterable: false,
    }]
  }
  const editable = (f: FieldSchema) =>
    f.visible !== false && !f.readonly && f.type !== 'action' && f.type !== 'formula'
    && !['fk', 'one-to-many', 'many-to-many', 'reverse-ref', 'mediaImage', 'image', 'attachment', 'json'].includes(f.type)
  let fields = targetSchema.value.fields.filter(f => editable(f) && f.required)
  if (fields.length === 0) {
    fields = targetSchema.value.fields.filter(f => editable(f) && ['name', 'label', 'title'].includes(f.key))
  }
  return fields.sort((a, b) => a.order - b.order)
})

const labelField = computed(() => {
  return formFields.value.find(f => f.key === 'name' || f.key === 'label' || f.key === 'title')
})

function getFieldRules(field: FieldSchema) {
  // docs/19 批次 D3:统一走共享校验器(此前仅映射 required/长度/pattern,min/max/custom 缺失)
  return [
    {
      validator: (_rule: unknown, value: unknown, callback: (error?: Error) => void) => {
        const result = validateFieldValue(field, value)
        if (!result.valid) callback(new Error(result.errors[0]))
        else callback()
      },
      trigger: 'blur',
    },
  ]
}

watch(() => props.visible, async (v) => {
  if (v && props.targetModuleId) {
    schemaLoading.value = true
    try {
      const res = await schemaService.loadModuleSchema(props.targetModuleId)
      if (res.success) {
        targetSchema.value = res.data
        initFormModel()
      }
    } catch {
      targetSchema.value = null
    } finally {
      schemaLoading.value = false
    }
  } else {
    targetSchema.value = null
  }
})

function initFormModel(): void {
  const fields = formFields.value
  for (const key of Object.keys(formModel)) {
    delete formModel[key]
  }
  for (const f of fields) {
    if (f.defaultValue !== undefined) {
      formModel[f.key] = f.defaultValue
    } else if (f.type === 'boolean') {
      formModel[f.key] = false
    } else if (f.type === 'number' || f.type === 'currency' || f.type === 'percent') {
      formModel[f.key] = undefined
    } else {
      formModel[f.key] = ''
    }
  }
  if (props.prefillData) {
    for (const [key, val] of Object.entries(props.prefillData)) {
      if (key in formModel) {
        formModel[key] = val
      }
    }
  }
}

async function handleSubmit(): Promise<void> {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  // docs/19 批次 H1:行级校验(跨字段规则),口径与行内编辑/创建保存一致
  if (targetSchema.value?.rowValidationRules?.length) {
    const rowValidation = validateRecordRow(targetSchema.value.rowValidationRules, { ...formModel })
    if (!rowValidation.valid) {
      ElMessage.warning(rowValidation.errors[0])
      return
    }
    if (rowValidation.warnings.length > 0) {
      ElMessage.info(rowValidation.warnings[0])
    }
  }

  submitting.value = true
  try {
    const fields: Record<string, unknown> = { ...formModel }
    for (const f of formFields.value) {
      if (f.type === 'boolean' || f.type === 'number' || f.type === 'currency' || f.type === 'percent') {
        if (fields[f.key] === '' || fields[f.key] === undefined) {
          if (f.required) {
            fields[f.key] = f.type === 'boolean' ? false : 0
          } else {
            delete fields[f.key]
          }
        }
      }
    }

    const res = await recordService.create({
      moduleId: props.targetModuleId,
      fields,
    })
    if (res.success) {
      const id = res.data.id
      const label = labelField.value
        ? String(fields[labelField.value.key] ?? id)
        : String(fields.name ?? fields.label ?? fields.title ?? id)
      ElMessage.success('创建成功')
      emit('created', { id, label, value: id })
    } else {
      ElMessage.error(res.message || '创建失败')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败'
    ElMessage.error(message)
  } finally {
    submitting.value = false
  }
}

function handleCancel(): void {
  emit('cancel')
}

function handleClose(): void {
  emit('close')
}
</script>

<template>
  <ElDialog
    :model-value="visible"
    :title="`新建${moduleName}`"
    width="520px"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    @update:model-value="handleClose"
  >
    <div v-if="schemaLoading" class="schema-loading">
      加载表单中...
    </div>
    <ElForm
      v-else
      ref="formRef"
      :model="formModel"
      label-width="90px"
      size="small"
      @submit.prevent="handleSubmit"
    >
      <ElFormItem
        v-for="field in formFields"
        :key="field.key"
        :label="field.label"
        :prop="field.key"
        :rules="getFieldRules(field)"
      >
        <ElInput
          v-if="field.type === 'text' || field.type === 'email' || field.type === 'url' || field.type === 'phone'"
          v-model="formModel[field.key]"
          :placeholder="field.placeholder || `请输入${field.label}`"
        />
        <ElInputNumber
          v-else-if="field.type === 'number' || field.type === 'currency' || field.type === 'percent'"
          v-model="formModel[field.key]"
          :placeholder="field.placeholder || `请输入${field.label}`"
          :precision="field.decimal ?? (field.type === 'currency' ? 2 : field.type === 'percent' ? 0 : undefined)"
          :min="0"
          style="width: 100%"
        />
        <ElDatePicker
          v-else-if="field.type === 'date' || field.type === 'datetime'"
          v-model="formModel[field.key]"
          :type="field.type === 'datetime' ? 'datetime' : 'date'"
          :placeholder="field.placeholder || `请选择${field.label}`"
          style="width: 100%"
        />
        <ElSelect
          v-else-if="field.type === 'select' || field.type === 'multi-select'"
          v-model="formModel[field.key]"
          :multiple="field.type === 'multi-select'"
          :placeholder="field.placeholder || `请选择${field.label}`"
        >
          <ElOption
            v-for="opt in (field.options ?? [])"
            :key="String(opt.value)"
            :label="opt.label"
            :value="opt.value"
            :disabled="opt.disabled"
          />
        </ElSelect>
        <ElSwitch
          v-else-if="field.type === 'boolean'"
          v-model="formModel[field.key]"
        />
        <ElInput
          v-else
          v-model="formModel[field.key]"
          :placeholder="field.placeholder || `请输入${field.label}`"
        />
      </ElFormItem>
    </ElForm>

    <template #footer>
      <ElButton :disabled="submitting" @click="handleCancel">取消</ElButton>
      <ElButton type="primary" :loading="submitting" @click="handleSubmit">
        创建
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.schema-loading {
  padding: var(--sg-spacing-20);
  text-align: center;
  color: var(--sg-text-color-secondary);
}
</style>
