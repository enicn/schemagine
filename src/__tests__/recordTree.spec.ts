import { describe, expect, it } from 'vitest'
import { buildRecordTree } from '@/utils/recordTree'

describe('buildRecordTree（docs/19 F2）', () => {
  // 每例新造行对象：组树会向父行写入 children 数组，共享对象会跨用例污染
  const makeRows = () => [
    { _recordId: '1', name: '总公司', parentId: null },
    { _recordId: '2', name: '技术部', parentId: '1' },
    { _recordId: '3', name: '市场部', parentId: '1' },
    { _recordId: '4', name: '前端组', parentId: '2' },
    { _recordId: '5', name: '后端组', parentId: '2' },
  ]

  it('按 parentField 组树：根在前、子按输入顺序挂载', () => {
    const tree = buildRecordTree(makeRows(), { parentField: 'parentId' })
    expect(tree).toHaveLength(1)
    const root = tree[0] as Record<string, unknown>
    expect(root.name).toBe('总公司')
    const rootChildren = root.children as Array<Record<string, unknown>>
    expect(rootChildren).toHaveLength(2)
    expect(rootChildren.map((c) => c.name)).toEqual(['技术部', '市场部'])
    expect((rootChildren[0]!.children as Array<Record<string, unknown>>).map((c) => c.name)).toEqual(['前端组', '后端组'])
  })

  it('子行先于父行输入同样能组树（两遍式）', () => {
    const reversed = makeRows().reverse()
    const tree = buildRecordTree(reversed, { parentField: 'parentId' })
    expect(tree).toHaveLength(1)
    expect((tree[0] as Record<string, unknown>).children).toHaveLength(2)
  })

  it('孤儿行（父 id 不存在）挂根不丢数据', () => {
    const withOrphan = [...makeRows(), { _recordId: '6', name: '幽灵组', parentId: '999' }]
    const tree = buildRecordTree(withOrphan, { parentField: 'parentId' }) as Array<Record<string, unknown>>
    expect(tree).toHaveLength(2)
    expect(tree.some(n => n.name === '幽灵组')).toBe(true)
  })

  it('无父引用与空字符串父引用都视为根', () => {
    const flat = [
      { _recordId: 'a', parentId: '' },
      { _recordId: 'b' },
      { _recordId: 'c', parentId: 'a' },
    ]
    const tree = buildRecordTree(flat, { parentField: 'parentId' })
    expect(tree).toHaveLength(2)
  })

  it('自定义 idKey / childrenField', () => {
    const tree = buildRecordTree(
      [
        { id: 'p', parentId: null },
        { id: 'c', parentId: 'p' },
      ] as Array<Record<string, unknown>>,
      { idKey: 'id', parentField: 'parentId', childrenField: 'kids' },
    ) as Array<Record<string, unknown>>
    expect((tree[0]!.kids as Array<Record<string, unknown>>).map((k) => k.id)).toEqual(['c'])
  })

  it('自引用环视为根，不死循环不丢行', () => {
    const tree = buildRecordTree(
      [{ _recordId: 'x', name: '自引用', parentId: 'x' }],
      { parentField: 'parentId' },
    ) as Array<Record<string, unknown>>
    expect(tree).toHaveLength(1)
    expect(tree[0]!.name).toBe('自引用')
  })

  it('不改动行既有字段（仅向父行写入 children 数组）', () => {
    const source = makeRows()
    const tree = buildRecordTree(source, { parentField: 'parentId' })
    // 组树不修改行的既有字段
    expect(source[0]!.name).toBe('总公司')
    expect(source[0]!.parentId).toBeNull()
    // 树节点即输入行本身（引用相同），children 已挂载
    expect((tree[0] as Record<string, unknown>).children).toHaveLength(2)
  })
})
