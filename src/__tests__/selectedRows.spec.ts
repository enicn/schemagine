import { describe, expect, it } from 'vitest'
import { collectSelectedRows, resolveRowLabel } from '@/utils/selectedRows'

describe('collectSelectedRows（FK 弹窗搜索选择）', () => {
  // 表格行口径：flattenRecordRow 拍平后的行（_recordId 行键 + fields 字段平铺）
  const rows = [
    { _recordId: 'r1', name: '招商银行', amount: 100 },
    { _recordId: 'r2', label: '采购订单 A', amount: 200 },
    { _recordId: 'r3', title: '月度结转', amount: 300 },
    { _recordId: 'r4', amount: 400 }, // 无 name/label/title，回落 id
  ]

  it('按行键取回选中行，label 走 name → label → title 口径', () => {
    const out = collectSelectedRows(rows, ['r1', 'r2', 'r3'], '_recordId')
    expect(out).toEqual([
      { id: 'r1', label: '招商银行' },
      { id: 'r2', label: '采购订单 A' },
      { id: 'r3', label: '月度结转' },
    ])
  })

  it('选中行不在当前页数据（跨页保留）时走候选缓存兜底，再回落原始 id', () => {
    const fallback = (id: string) => (id === 'r9' ? '缓存标签' : undefined)
    const out = collectSelectedRows(rows, ['r1', 'r9', 'r99'], '_recordId', fallback)
    expect(out).toEqual([
      { id: 'r1', label: '招商银行' },
      { id: 'r9', label: '缓存标签' },
      { id: 'r99', label: 'r99' },
    ])
  })

  it('去重并跳过空 id，保持传入顺序', () => {
    const out = collectSelectedRows(rows, ['r2', '', 'r2', 'r1'], '_recordId')
    expect(out.map(r => r.id)).toEqual(['r2', 'r1'])
  })

  it('resolveRowLabel：无展示字段时回落 _recordId', () => {
    expect(resolveRowLabel({ _recordId: 'r4', amount: 400 })).toBe('r4')
  })
})
