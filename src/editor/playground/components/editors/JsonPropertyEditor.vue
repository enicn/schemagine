<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: unknown
  /** strict=必须合法 JSON(对象/数组);loose=解析失败时按原始字符串处理(任意值) */
  mode?: 'strict' | 'loose'
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const text = ref(serialize(props.modelValue))
const error = ref('')

function serialize(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

watch(() => props.modelValue, (v) => {
  const next = serialize(v)
  if (next !== text.value) {
    text.value = next
    error.value = ''
  }
})

function handleInput(raw: string): void {
  text.value = raw
  const trimmed = raw.trim()
  if (trimmed === '') {
    error.value = ''
    emit('update:modelValue', undefined)
    return
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if ((props.mode ?? 'strict') === 'strict' && (typeof parsed !== 'object' || parsed === null)) {
      error.value = '需要 JSON 对象或数组'
      return
    }
    error.value = ''
    emit('update:modelValue', parsed)
  } catch {
    if ((props.mode ?? 'strict') === 'loose') {
      error.value = ''
      emit('update:modelValue', raw)
    } else {
      error.value = 'JSON 语法错误'
    }
  }
}
</script>

<template>
  <div class="json-prop-editor">
    <textarea
      class="json-textarea"
      :value="text"
      :placeholder="placeholder ?? '{ }'"
      spellcheck="false"
      rows="5"
      @input="handleInput(($event.target as HTMLTextAreaElement).value)"
    />
    <div v-if="error" class="json-error">{{ error }}</div>
  </div>
</template>

<style scoped>
.json-textarea {
  width: 100%;
  box-sizing: border-box;
  font-family: var(--sg-font-family-mono, Consolas, monospace);
  font-size: var(--sg-font-size-sm);
  padding: var(--sg-spacing-2) var(--sg-spacing-3);
  border: 1px solid var(--sg-border-color);
  border-radius: var(--sg-radius-md);
  background: var(--sg-bg-color);
  color: var(--sg-text-color);
  resize: vertical;
  min-height: 72px;
}
.json-textarea:focus {
  outline: none;
  border-color: var(--sg-color-primary);
}
.json-error {
  margin-top: var(--sg-spacing-1);
  font-size: var(--sg-font-size-sm);
  color: var(--sg-color-danger);
}
</style>
