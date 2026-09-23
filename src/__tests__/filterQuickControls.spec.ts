import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FilterConditionControls from '@/components/filter/FilterConditionControls.vue'
import type { FieldSchema, FilterClause } from '@/types'

/** 快捷筛选摊开模式（§FK 弹窗快捷筛选）：quickFilterKeys/expanded 行显隐 + 草稿跨收合保留 */
function field(key: string, label: string, type: FieldSchema['type']): FieldSchema {
  return { id: `f-${key}`, name: label, key, type, label, required: false, readonly: false, order: 1, visible: true, sortable: false, filterable: true }
}

function mountControls(props: Record<string, unknown>) {
  return mount(FilterConditionControls, {
    props: { fields: [field('name', '名称', 'text'), field('status', '状态', 'select'), field('memo', '备注', 'text')], modelValue: [], matchType: 'all', ...props },
  })
}

/** jsdom 无布局：v-show 断言走 display 内联样式 */
function displayedLabels(wrapper: ReturnType<typeof mountControls>): string[] {
  return wrapper.findAll('.filter-popover-item')
    .filter(r => (r.element as HTMLElement).style.display !== 'none')
    .map(r => r.find('label').text())
}

describe('FilterConditionControls 快捷筛选显隐', () => {
  it('未声明 quickFilterKeys：全部字段行可见（弹层/移动端原形态不受影响）', () => {
    const wrapper = mountControls({})
    expect(displayedLabels(wrapper)).toEqual(['名称', '状态', '备注'])
    wrapper.unmount()
  })

  it('声明 quickFilterKeys 且收起：仅快捷字段行渲染可见', async () => {
    const wrapper = mountControls({ quickFilterKeys: ['name'], expanded: false })
    await nextTick()
    expect(displayedLabels(wrapper)).toEqual(['名称'])
    wrapper.unmount()
  })

  it('expanded=true：「显示更多」展开其余字段行', async () => {
    const wrapper = mountControls({ quickFilterKeys: ['name'], expanded: true })
    await nextTick()
    expect(displayedLabels(wrapper)).toEqual(['名称', '状态', '备注'])
    wrapper.unmount()
  })

  it('草稿跨收合保留：展开态填写的非快捷字段条件，收起后 apply() 仍上抛', async () => {
    const wrapper = mountControls({ quickFilterKeys: ['name'], expanded: true })
    await nextTick()
    const memoRow = wrapper.findAll('.filter-popover-item').find(r => r.find('label').text() === '备注')!
    await memoRow.find('input').setValue('重要')
    await wrapper.setProps({ expanded: false })
    await nextTick()
    expect(displayedLabels(wrapper)).toEqual(['名称'])
    const conditions = (wrapper.vm as unknown as { apply(): FilterClause[] }).apply()
    const memo = conditions.find((c): c is FilterClause & { field: string } => 'field' in c && c.field === 'memo')
    expect(memo?.operator).toBe('like')
    expect(memo?.value).toBe('重要')
    wrapper.unmount()
  })

  it('栅格形态（layout=grid）：根节点挂 is-grid，行内联 gridColumn 跨度按 quickFilterSpan/默认 4', () => {
    const fields = [
      field('name', '名称', 'text'),
      { ...field('memo', '备注', 'text'), quickFilterSpan: 8 },
      { ...field('tags', '标签', 'select'), quickFilterSpan: 99 },
    ]
    const wrapper = mount(FilterConditionControls, {
      props: { fields, modelValue: [], matchType: 'all', layout: 'grid' as const },
    })
    expect(wrapper.find('.filter-condition-controls').classes()).toContain('is-grid')
    const items = wrapper.findAll('.filter-popover-item')
    expect(items[0].element.style.gridColumn).toBe('span 4')
    expect(items[1].element.style.gridColumn).toBe('span 8')
    expect(items[2].element.style.gridColumn).toBe('span 16')
    wrapper.unmount()
  })

  it('栅格跨度钳制：低于 1 取 1；list 布局不产生内联 gridColumn', () => {
    const fields = [{ ...field('memo', '备注', 'text'), quickFilterSpan: 0 }]
    const grid = mount(FilterConditionControls, { props: { fields, modelValue: [], matchType: 'all' as const, layout: 'grid' as const } })
    expect(grid.find('.filter-popover-item').element.style.gridColumn).toBe('span 1')
    grid.unmount()
    const list = mount(FilterConditionControls, { props: { fields, modelValue: [], matchType: 'all' as const } })
    expect(list.find('.filter-popover-item').element.style.gridColumn).toBe('')
    list.unmount()
  })
})
