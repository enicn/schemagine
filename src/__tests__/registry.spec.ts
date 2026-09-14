import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, shallowMount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import {
  registerFieldType,
  unregisterFieldType,
  getFieldTypeDefinition,
  isRegisteredFieldType,
  isBuiltinFieldType,
} from '@/engine/registry/fieldTypeRegistry'
import {
  registerDialog,
  unregisterDialog,
  getDialogComponent,
} from '@/engine/registry/dialogRegistry'
import { builtinEditorForType } from '@/components/field/editorMap'
import FieldEditorFactory from '@/components/field/FieldEditorFactory.vue'
import TextEditor from '@/components/field/editors/TextEditor.vue'
import ValueRenderer from '@/components/field/editors/ValueRenderer.vue'
import { createUiState } from '@/composables/instanceState'
import type { FieldSchema } from '@/types'

function makeField(type: string): FieldSchema {
  return {
    id: type,
    name: type,
    key: `${type}_key`,
    type: type as FieldSchema['type'],
    label: '测试字段',
    required: false,
    readonly: false,
    order: 0,
    visible: true,
    sortable: false,
    filterable: false,
  }
}

const CustomEditor = defineComponent({
  props: { value: {}, fieldSchema: {} },
  emits: ['update:modelValue'],
  template: '<input class="custom-editor" />',
})

beforeEach(() => {
  unregisterFieldType('rating')
  unregisterDialog('my-biz-dialog')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fieldTypeRegistry(docs/19 B1)', () => {
  it('注册后可查询,注销后不可查询', () => {
    registerFieldType('rating', { renderToHtml: () => '<b>★</b>' })
    expect(isRegisteredFieldType('rating')).toBe(true)
    expect(getFieldTypeDefinition('rating')?.renderToHtml?.({ value: 5, field: makeField('rating') })).toBe('<b>★</b>')

    unregisterFieldType('rating')
    expect(isRegisteredFieldType('rating')).toBe(false)
    expect(getFieldTypeDefinition('rating')).toBeUndefined()
  })

  it('不允许覆盖内置字段类型,不允许空类型名', () => {
    expect(() => registerFieldType('text', {})).toThrow(/内置字段类型/)
    expect(() => registerFieldType('', {})).toThrow(/不能为空/)
    expect(isBuiltinFieldType('percent')).toBe(true)
  })

  it('重复注册覆盖并告警;注销内置类型是无操作', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerFieldType('rating', { renderToHtml: () => 'a' })
    registerFieldType('rating', { renderToHtml: () => 'b' })
    expect(warn).toHaveBeenCalled()
    expect(getFieldTypeDefinition('rating')?.renderToHtml?.({ value: 1, field: makeField('rating') })).toBe('b')

    unregisterFieldType('text')
    expect(isBuiltinFieldType('text')).toBe(true)
  })

  it('编辑器值适配:toEditorValue / toRecordValue 双向可用', () => {
    registerFieldType('rating', {
      toEditorValue: (v) => Number(v) + 1,
      toRecordValue: (v) => Number(v) - 1,
    })
    const def = getFieldTypeDefinition('rating')
    const field = makeField('rating')
    expect(def?.toEditorValue?.(4, field)).toBe(5)
    expect(def?.toRecordValue?.(5, field)).toBe(4)
  })
})

describe('builtinEditorForType(docs/19 B1)', () => {
  it('内置类型映射到编辑器组件;未知类型返回 undefined', () => {
    expect(builtinEditorForType('text')).toBeDefined()
    expect(builtinEditorForType('percent')).toBeDefined()
    expect(builtinEditorForType('fk')).toBeDefined()
    expect(builtinEditorForType('formula')).toBeUndefined()
    expect(builtinEditorForType('rating')).toBeUndefined()
  })
})

describe('FieldEditorFactory 注册表接入(docs/19 B1)', () => {
  it('注册自定义类型后,编辑模式按注册的编辑器组件渲染', () => {
    registerFieldType('rating', { editor: CustomEditor })
    const wrapper = shallowMount(FieldEditorFactory, {
      props: { fieldSchema: makeField('rating'), modelValue: 4 },
    })
    expect(wrapper.findComponent(CustomEditor).exists()).toBe(true)
    wrapper.unmount()
  })

  it('未注册的自定义类型回退只读渲染(text 兜底)', () => {
    const wrapper = shallowMount(FieldEditorFactory, {
      props: { fieldSchema: makeField('not-registered-type'), modelValue: 'x' },
    })
    expect(wrapper.findComponent(ValueRenderer).exists()).toBe(true)
    wrapper.unmount()
  })

  it('内置类型行为不变:text 仍映射到 TextEditor', () => {
    const wrapper = shallowMount(FieldEditorFactory, {
      props: { fieldSchema: makeField('text'), modelValue: 'x' },
    })
    expect(wrapper.findComponent(TextEditor).exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('FieldEditorFactory 真实挂载(docs/19 B1)', () => {
  it('自定义编辑器组件真实渲染', () => {
    registerFieldType('rating', { editor: CustomEditor })
    const wrapper = mount(FieldEditorFactory, {
      props: { fieldSchema: makeField('rating'), modelValue: 4 },
    })
    expect(wrapper.find('.custom-editor').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('dialogRegistry(docs/19 B4)', () => {
  it('注册后可查询,注销后不可查询', () => {
    const Comp = defineComponent({ template: '<div />' })
    registerDialog('my-biz-dialog', Comp)
    expect(getDialogComponent('my-biz-dialog')).toBe(Comp)

    unregisterDialog('my-biz-dialog')
    expect(getDialogComponent('my-biz-dialog')).toBeUndefined()
  })

  it('不允许覆盖内置弹窗类型,不允许空类型名', () => {
    expect(() => registerDialog('quick-create', defineComponent({ template: '<div />' }))).toThrow(/内置弹窗类型/)
    expect(() => registerDialog('', defineComponent({ template: '<div />' }))).toThrow(/不能为空/)
  })
})

describe('uiState.openDialog 接受自定义弹窗类型(docs/19 B4)', () => {
  it('openDialog 存储自定义类型并由 dialogType 读出', () => {
    const ui = createUiState()
    ui.openDialog('my-biz-dialog', { foo: 1 })
    expect(ui.dialogType).toBe('my-biz-dialog')
    expect(ui.dialogState.payload).toEqual({ foo: 1 })
    ui.closeDialog()
    expect(ui.dialogVisible).toBe(false)
  })
})
