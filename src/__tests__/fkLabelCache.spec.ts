import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildFilterSummaryItems } from '@/utils/filterSummary'
import { cacheFkLabel, cacheFkOptions, getCachedFkLabel, resolveFkLabelForSummary } from '@/composables/useFkLabelCache'
import type { FieldSchema, FilterClause } from '@/types'

const recordServiceMock = vi.hoisted(() => ({
  getDetail: vi.fn(async (_moduleId: string, recordId: string) => ({
    success: true,
    data: { id: recordId, fields: { name: `名称${recordId}` } },
  })),
}))

vi.mock('@/services/api/recordService', () => ({
  recordService: recordServiceMock,
}))

function fkField(key: string, targetModule: string): FieldSchema {
  return { key, label: key, type: 'fk', targetModule, filterable: true } as FieldSchema
}

function clause(field: string, operator: FilterClause['operator'], value?: unknown, values?: unknown[]): FilterClause {
  return { field, operator, value, values }
}

describe('filterSummary FK 标签解析(docs/19 批次 E 口径)', () => {
  const fields = [fkField('counterparty_id', 'counterparty')]

  it('resolveFkLabel 传入时 in 出人读标签', () => {
    const items = buildFilterSummaryItems(
      [clause('counterparty_id', 'in', undefined, ['1', '2'])],
      fields,
      (field, value) => (String(value) === '1' ? '上海科技集团有限公司' : String(value)),
    )
    expect(items[0]!.valueLabel).toBe('上海科技集团有限公司, 2')
  })

  it('未传 resolveFkLabel 时回退原始值(兼容外部摘要方)', () => {
    const items = buildFilterSummaryItems([clause('counterparty_id', 'in', undefined, ['1'])], fields)
    expect(items[0]!.valueLabel).toBe('1')
  })
})

describe('useFkLabelCache 全局共享缓存', () => {
  beforeEach(() => {
    recordServiceMock.getDetail.mockClear()
  })

  it('cacheFkOptions 后同步命中标签（含 number→string 归一）', () => {
    cacheFkOptions('counterparty', [{ value: '1', label: '上海科技集团有限公司' }])
    expect(getCachedFkLabel('counterparty', '1')).toBe('上海科技集团有限公司')
    expect(resolveFkLabelForSummary({ targetModule: 'counterparty' }, 1)).toBe('上海科技集团有限公司')
  })

  it('未命中返回原始值并后台 getDetail 回填，之后命中', async () => {
    expect(resolveFkLabelForSummary({ targetModule: 'vendor' }, '7')).toBe('7')
    expect(recordServiceMock.getDetail).toHaveBeenCalledWith('vendor', '7')
    await vi.waitFor(() => {
      expect(getCachedFkLabel('vendor', '7')).toBe('名称7')
    })
    expect(resolveFkLabelForSummary({ targetModule: 'vendor' }, '7')).toBe('名称7')
  })

  it('getDetail 失败落原始 id 兜底，不再重复请求', async () => {
    recordServiceMock.getDetail.mockRejectedValueOnce(new Error('network'))
    expect(resolveFkLabelForSummary({ targetModule: 'client' }, '9')).toBe('9')
    await vi.waitFor(() => {
      expect(getCachedFkLabel('client', '9')).toBe('9')
    })
    resolveFkLabelForSummary({ targetModule: 'client' }, '9')
    expect(recordServiceMock.getDetail).toHaveBeenCalledTimes(1)
  })

  it('cacheFkLabel 显式写入覆盖兜底值', () => {
    cacheFkLabel('partner', '3', '手动标签')
    expect(resolveFkLabelForSummary({ targetModule: 'partner' }, '3')).toBe('手动标签')
  })
})
