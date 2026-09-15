import { describe, expect, it } from 'vitest'
import { buildSameValueSpanMethod } from '@/utils/mergeCells'

describe('buildSameValueSpanMethod（docs/19 F5）', () => {
  const rows = [
    { _recordId: '1', city: '杭州', status: 'active' },
    { _recordId: '2', city: '杭州', status: 'active' },
    { _recordId: '3', city: '杭州', status: 'disabled' },
    { _recordId: '4', city: '宁波', status: 'disabled' },
  ]

  it('相邻同值行合并：首行 rowspan=段长，后续行 rowspan=0', () => {
    const span = buildSameValueSpanMethod(['city'], rows)
    expect(span({ row: rows[0]!, rowIndex: 0, column: { field: 'city' } })).toEqual({ rowspan: 3, colspan: 1 })
    expect(span({ row: rows[1]!, rowIndex: 1, column: { field: 'city' } })).toEqual({ rowspan: 0, colspan: 1 })
    expect(span({ row: rows[2]!, rowIndex: 2, column: { field: 'city' } })).toEqual({ rowspan: 0, colspan: 1 })
    expect(span({ row: rows[3]!, rowIndex: 3, column: { field: 'city' } })).toEqual({ rowspan: 1, colspan: 1 })
  })

  it('未声明合并的列返回 undefined（走 vxe 默认 1×1）', () => {
    const span = buildSameValueSpanMethod(['city'], rows)
    expect(span({ row: rows[0]!, rowIndex: 0, column: { field: 'status' } })).toBeUndefined()
    expect(span({ row: rows[0]!, rowIndex: 0, column: { field: '_recordId' } })).toBeUndefined()
  })

  it('多列合并互不影响（相同行序各自归段）', () => {
    const span = buildSameValueSpanMethod(['city', 'status'], rows)
    expect(span({ row: rows[0]!, rowIndex: 0, column: { field: 'status' } })).toEqual({ rowspan: 2, colspan: 1 })
    expect(span({ row: rows[2]!, rowIndex: 2, column: { field: 'status' } })).toEqual({ rowspan: 2, colspan: 1 })
  })

  it('null 与空字符串按字面值归并，不与 undefined 混淆', () => {
    const withEmpties = [
      { v: null },
      { v: null },
      { v: '' },
      { v: undefined },
    ] as Array<Record<string, unknown>>
    const span = buildSameValueSpanMethod(['v'], withEmpties)
    expect(span({ row: withEmpties[0]!, rowIndex: 0, column: { field: 'v' } })).toEqual({ rowspan: 2, colspan: 1 })
    expect(span({ row: withEmpties[2]!, rowIndex: 2, column: { field: 'v' } })).toEqual({ rowspan: 1, colspan: 1 })
    expect(span({ row: withEmpties[3]!, rowIndex: 3, column: { field: 'v' } })).toEqual({ rowspan: 1, colspan: 1 })
  })

  it('空数据 / 空声明列不炸', () => {
    const span = buildSameValueSpanMethod([], [])
    expect(span({ row: {}, rowIndex: 0, column: { field: 'x' } })).toBeUndefined()
  })
})
