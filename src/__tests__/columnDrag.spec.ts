import { describe, expect, it } from 'vitest'
import { reorderColumnsByDrag } from '@/utils/columnDrag'

describe('columnDrag 列拖拽新列序重建(docs/19 批次 E4)', () => {
  const order = ['a', 'b', 'c', 'd']

  it('左落点:插入到目标列之前', () => {
    expect(reorderColumnsByDrag(order, 'd', 'b', 'left')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('右落点:插入到目标列之后', () => {
    expect(reorderColumnsByDrag(order, 'a', 'c', 'right')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('相邻拖拽:左右落点结果均正确', () => {
    expect(reorderColumnsByDrag(order, 'b', 'c', 'left')).toEqual(['a', 'b', 'c', 'd'])
    expect(reorderColumnsByDrag(order, 'c', 'b', 'right')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('拖到原位(dragField === targetField):返回原序', () => {
    expect(reorderColumnsByDrag(order, 'b', 'b', 'left')).toEqual(order)
  })

  it('参数缺失或目标不存在:安全返回原序', () => {
    expect(reorderColumnsByDrag(order, undefined, 'b', 'left')).toEqual(order)
    expect(reorderColumnsByDrag(order, 'a', undefined, 'left')).toEqual(order)
    expect(reorderColumnsByDrag(order, 'a', 'not-exist', 'left')).toEqual(order)
  })
})
