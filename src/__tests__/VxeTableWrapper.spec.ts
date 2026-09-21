import { describe, expect, it, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import VxeTableWrapper from '@/components/table/VxeTableWrapper.vue'
import type { WrapperColumn } from '@/components/table/wrapperTypes'

/** vxe 表数据装载是内部异步链（mounted + 多级 nextTick），测试里迭代冲刷 */
async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

// jsdom 缺 ResizeObserver（wrapper 高度自适应依赖），桩掉即可
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() { /* noop */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
  } as unknown as typeof ResizeObserver
})

const rows = [
  { _recordId: 'r1', name: '甲', amount: 100 },
  { _recordId: 'r2', name: '乙', amount: 200 },
]

function baseColumns(): WrapperColumn[] {
  return [
    { field: 'name', title: '名称', visible: true },
    { field: 'amount', title: '金额', visible: true },
  ]
}

describe('VxeTableWrapper 组件挂载（docs/19 G6）', () => {
  it('列构建：仅渲染 visible 列，隐藏列不出现在表头', async () => {
    const columns = [
      ...baseColumns(),
      { field: 'secret', title: '隐藏列', visible: false },
    ]
    const wrapper = mount(VxeTableWrapper, {
      props: { moduleId: 'm1', data: rows, columns },
    })
    await flush()
    const headerText = wrapper.find('.vxe-table').text()
    expect(headerText).toContain('名称')
    expect(headerText).toContain('金额')
    expect(headerText).not.toContain('隐藏列')
    wrapper.unmount()
  })

  it('多级表头（F3）：相邻同 headerGroup 列合并为分组表头', async () => {
    const columns: WrapperColumn[] = [
      { field: 'name', title: '名称', visible: true },
      { field: 'amount', title: '金额', visible: true, headerGroup: '金额信息' },
      { field: 'amount2', title: '税额', visible: true, headerGroup: '金额信息' },
    ]
    const data = rows.map(r => ({ ...r, amount2: 1 }))
    const wrapper = mount(VxeTableWrapper, {
      props: { moduleId: 'm1', data, columns },
    })
    await flush()
    const text = wrapper.find('.vxe-table').text()
    expect(text).toContain('金额信息')
    expect(text).toContain('税额')
    wrapper.unmount()
  })

  it('事件转发：单元格点击上抛 row-click / cell-click，并携带行列上下文', async () => {
    const wrapper = mount(VxeTableWrapper, {
      props: { moduleId: 'm1', data: rows, columns: baseColumns() },
    })
    await flush()
    // 主表体（非固定列克隆）第一数据行第一格
    const cell = wrapper.find('.vxe-table--main-wrapper .vxe-body--row .vxe-body--column')
    await cell.trigger('click')
    interface RowClickPayload { row: Record<string, unknown>; rowIndex: number }
    interface CellClickPayload { row: Record<string, unknown>; column: WrapperColumn }
    const rowClicks = wrapper.emitted('row-click') as unknown as Array<[RowClickPayload]> | undefined
    const cellClicks = wrapper.emitted('cell-click') as unknown as Array<[CellClickPayload]> | undefined
    expect(rowClicks).toHaveLength(1)
    expect(rowClicks![0]![0].row._recordId).toBe('r1')
    expect(cellClicks).toHaveLength(1)
    expect(cellClicks![0]![0].column.field).toBe('name')
    wrapper.unmount()
  })

  it('操作列：isAction 列聚合为右侧操作列，点击上抛 row-action', async () => {
    const columns: WrapperColumn[] = [
      ...baseColumns(),
      { field: 'delete', title: '删除', visible: true, isAction: true, actionDanger: true },
    ]
    const wrapper = mount(VxeTableWrapper, {
      props: { moduleId: 'm1', data: rows, columns },
    })
    await flush()
    const opBtn = wrapper.find('.op-link')
    expect(opBtn.exists()).toBe(true)
    expect(opBtn.text()).toBe('删除')
    await opBtn.trigger('click')
    const actions = wrapper.emitted('row-action') as unknown as Array<[{ row: Record<string, unknown>; actionId: string }]> | undefined
    expect(actions).toHaveLength(1)
    // 标准删除操作以 'delete' 作为 actionId（与字段 key 解耦）
    expect(actions![0]![0].actionId).toBe('delete')
    wrapper.unmount()
  })

  it('行内编辑：editable + 双击进入编辑态，确认后上抛 inline-edit 并改值', async () => {
    const wrapper = mount(VxeTableWrapper, {
      props: { moduleId: 'm1', data: rows.map(r => ({ ...r })), columns: baseColumns(), editable: true },
    })
    await flush()
    const cell = wrapper.find('.vxe-table--main-wrapper .vxe-body--row .vxe-body--column')
    await cell.trigger('dblclick')
    const input = wrapper.find('.edit-inline__input')
    expect(input.exists()).toBe(true)
    await input.setValue('甲2')
    await input.trigger('keydown.enter')
    const edits = wrapper.emitted('inline-edit') as unknown as Array<[{ row: Record<string, unknown>; field: string; value: unknown }]> | undefined
    expect(edits).toHaveLength(1)
    expect(edits![0]![0].value).toBe('甲2')
    expect(edits![0]![0].row.name).toBe('甲2')
    wrapper.unmount()
  })

  it('行内编辑布局档位（docs/20）：默认 float 不挂根类，fit-row 挂 is-fit-row-edit', async () => {
    const floatWrapper = mount(VxeTableWrapper, {
      props: { moduleId: 'm1', data: rows, columns: baseColumns() },
    })
    await flush()
    expect(floatWrapper.find('.vxe-table-wrapper').classes()).not.toContain('is-fit-row-edit')
    floatWrapper.unmount()

    const fitWrapper = mount(VxeTableWrapper, {
      props: {
        moduleId: 'm1',
        data: rows,
        columns: baseColumns(),
        appearance: { inlineEditLayout: 'fit-row' },
      },
    })
    await flush()
    expect(fitWrapper.find('.vxe-table-wrapper').classes()).toContain('is-fit-row-edit')
    fitWrapper.unmount()
  })
})
