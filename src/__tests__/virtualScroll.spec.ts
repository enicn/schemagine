import { describe, expect, it } from 'vitest'
import { AUTO_VIRTUAL_SCROLL_THRESHOLD, VIRTUAL_SCROLL_GT, resolveScrollY } from '@/components/table/virtualScroll'

describe('resolveScrollY(docs/19 C2)', () => {
  it('小数据量且未显式开启 → 关闭', () => {
    expect(resolveScrollY(false, 0)).toEqual({ enabled: false, gt: VIRTUAL_SCROLL_GT })
    expect(resolveScrollY(false, AUTO_VIRTUAL_SCROLL_THRESHOLD)).toEqual({ enabled: false, gt: VIRTUAL_SCROLL_GT })
  })

  it('数据量超阈值 → 自动开启', () => {
    expect(resolveScrollY(false, AUTO_VIRTUAL_SCROLL_THRESHOLD + 1).enabled).toBe(true)
    expect(resolveScrollY(false, 10000).enabled).toBe(true)
  })

  it('显式开启 → 无视数据量强制启用', () => {
    expect(resolveScrollY(true, 0).enabled).toBe(true)
  })
})
