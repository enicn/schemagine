import { describe, expect, it } from 'vitest'
import {
  TABLE_DENSITY_HEIGHTS,
  normalizeDensity,
  resolveDensityHeights,
} from '@/components/table/tableDensity'

describe('tableDensity（docs/19 F1）', () => {
  it('三档默认值与 tokens.css §7.1 登记值一致（两处须同步改动）', () => {
    expect(TABLE_DENSITY_HEIGHTS.compact).toEqual({ row: 36, header: 41 })
    expect(TABLE_DENSITY_HEIGHTS.default).toEqual({ row: 44, header: 49 })
    expect(TABLE_DENSITY_HEIGHTS.large).toEqual({ row: 52, header: 57 })
  })

  it('normalizeDensity：合法档位原样返回，其余回退 default', () => {
    expect(normalizeDensity('compact')).toBe('compact')
    expect(normalizeDensity('default')).toBe('default')
    expect(normalizeDensity('large')).toBe('large')
    expect(normalizeDensity('huge')).toBe('default')
    expect(normalizeDensity(undefined)).toBe('default')
    expect(normalizeDensity(null)).toBe('default')
  })

  it('resolveDensityHeights：非法值取 default 档高度', () => {
    expect(resolveDensityHeights('compact')).toEqual({ row: 36, header: 41 })
    expect(resolveDensityHeights('unknown')).toEqual({ row: 44, header: 49 })
  })
})
