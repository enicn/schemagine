import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import RulesEditorPanel from '@/editor/components/RulesEditorPanel.vue'
import type { ModuleSchema } from '@/types'

function makeSchema(moduleRules?: unknown[]): ModuleSchema {
  return {
    id: 'module-editor-test',
    name: 'editor-test',
    version: '1.0.0',
    moduleType: 'list',
    fields: [
      { id: 'f1', name: 'price', key: 'price', type: 'number', label: 'price', required: false, readonly: false, order: 1, visible: true, sortable: false, filterable: false },
      { id: 'f2', name: 'quantity', key: 'quantity', type: 'number', label: 'quantity', required: false, readonly: false, order: 2, visible: true, sortable: false, filterable: false },
    ],
    permissions: { view: true, create: true, edit: true, delete: true, export: true, configure: true },
    defaultViewMode: 'list',
    status: 'active',
    rules: moduleRules as never,
  } as ModuleSchema
}

function mountPanel(schema: ModuleSchema) {
  return mount(RulesEditorPanel, {
    props: { schema },
    global: { plugins: [ElementPlus] },
  })
}

describe('RulesEditorPanel（A-5 authoring）', () => {
  it('渲染模块级规则列表并支持删除回传', async () => {
    const schema = makeSchema([
      { type: 'compute', target: 'total', watch: ['price'], expr: 'price * 2' },
    ])
    const wrapper = mountPanel(schema)
    expect(wrapper.text()).toContain('compute: total = price * 2')
    const removeBtn = wrapper.findAll('button').find(b => b.text() === '删除')
    expect(removeBtn).toBeTruthy()
    await removeBtn!.trigger('click')
    const emitted = wrapper.emitted('update')
    expect(emitted).toHaveLength(1)
    const next = emitted![0]![0] as ModuleSchema
    expect(next.rules).toHaveLength(0)
  })

  it('非法规则显示结构校验诊断', () => {
    const wrapper = mountPanel(makeSchema([
      { type: 'compute', target: 'total', watch: [], expr: '' },
    ]))
    expect(wrapper.text()).toContain('COMPUTE_WATCH_REQUIRED')
  })

  it('表达式语法错误给出即时提示', async () => {
    const wrapper = mountPanel(makeSchema([]))
    const exprInput = wrapper
      .findAll('input')
      .find(i => (i.attributes('placeholder') ?? '').includes('expr'))
    expect(exprInput).toBeTruthy()
    await exprInput!.setValue('a +* 1')
    expect(wrapper.text()).toContain('表达式语法错误')
    await exprInput!.setValue('price * quantity')
    expect(wrapper.text()).toContain('示例求值')
  })
})
