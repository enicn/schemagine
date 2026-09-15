import { describe, expect, it } from 'vitest'
import { buildGroupedRows, GROUP_ROW_FLAG, isGroupRow } from '@/utils/recordGroup'

describe('buildGroupedRows（docs/19 F6）', () => {
  const rows = [
    { id: '1', status: 'paid', amount: 100 },
    { id: '2', status: 'unpaid', amount: 50.5 },
    { id: '3', status: 'paid', amount: 200 },
    { id: '4', status: 'overdue', amount: 30 },
    { id: '5', status: 'paid', amount: 'abc' },
  ]

  it('按字段分组并插组行：组值升序、组行携带条数与小计', () => {
    const out = buildGroupedRows(rows, { field: 'status', summaryFields: ['amount'] })
    // 组行 3 个 + 数据 5 行
    expect(out).toHaveLength(8)
    const groups = out.filter(r => isGroupRow(r)).map(r => r[GROUP_ROW_FLAG])
    expect(groups.map(g => g!.value)).toEqual(['overdue', 'paid', 'unpaid'])
    expect(groups[1]).toEqual({ value: 'paid', count: 3, summary: { amount: 300 } })
  })

  it('desc 方向反转组间顺序', () => {
    const out = buildGroupedRows(rows, { field: 'status', direction: 'desc' })
    const values = out.filter(r => isGroupRow(r)).map(r => r[GROUP_ROW_FLAG]!.value)
    expect(values).toEqual(['unpaid', 'paid', 'overdue'])
  })

  it('小计口径与聚合统计条一致：非数值跳过、两位小数舍入', () => {
    const out = buildGroupedRows(rows, { field: 'status', summaryFields: ['amount'] })
    const paidGroup = out.find(r => isGroupRow(r) && r[GROUP_ROW_FLAG]!.value === 'paid') as Record<string, unknown> | undefined
    // 'abc' 非数值不参与，100+200=300
    expect((paidGroup![GROUP_ROW_FLAG] as { summary: { amount: number } }).summary.amount).toBe(300)
    const dec = buildGroupedRows(
      [{ s: 'x', v: 1.005 }, { s: 'x', v: 2.005 }],
      { field: 's', summaryFields: ['v'] },
    )
    expect(dec[0]![GROUP_ROW_FLAG]!.summary.v).toBe(3.01)
  })

  it('组内保持输入顺序，数据行不被改动', () => {
    const out = buildGroupedRows(rows, { field: 'status' })
    const paidIdx = out.findIndex(r => isGroupRow(r) && r[GROUP_ROW_FLAG]!.value === 'paid')
    expect((out[paidIdx + 1] as any)?.id).toBe('1')
    expect((out[paidIdx + 2] as any)?.id).toBe('3')
    expect((out[paidIdx + 3] as any)?.id).toBe('5')
    expect((rows[0] as unknown as Record<string, unknown>)[GROUP_ROW_FLAG]).toBeUndefined()
  })

  it('无分组字段值（undefined）归入空字符串组，不丢行', () => {
    const out = buildGroupedRows([{ a: 1 }, { a: 2 }], { field: 'missing' })
    expect(out).toHaveLength(3)
    expect(out[0]![GROUP_ROW_FLAG]!.value).toBe('undefined')
  })
})
