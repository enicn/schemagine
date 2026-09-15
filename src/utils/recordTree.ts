/**
 * 平铺记录组树（docs/19 批次 F2）：按 parentField 父引用把平铺行组装为
 * childrenField 嵌套树，供 vxe tree-config 渲染。
 *
 * 规则：
 *  - 根 = 无父引用（null/''/undefined）或父 id 不在集合内的行（孤儿挂根，避免丢数据）；
 *  - 输出顺序保持输入顺序（父先子后 / 子先父后均可，两遍式组装）；
 *  - 组树会向父行写入 childrenField 数组（vxe tree-config 按该字段渲染）；
 *    SchemaTable 的 tableData 为 computed 每次产出全新平铺行，写入无副作用。
 */
export interface RecordTreeOptions {
  /** 行主键字段名（默认 '_recordId'，即 VxeTableWrapper 的 rowKey 口径） */
  idKey?: string
  /** 行上存父记录主键的字段名（schema.treeConfig.parentField） */
  parentField: string
  /** 嵌套子记录挂载字段名（默认 'children'，与 schema.treeConfig.childrenField 同口径） */
  childrenField?: string
}

export function buildRecordTree<T extends Record<string, unknown>>(
  rows: T[],
  options: RecordTreeOptions,
): T[] {
  const idKey = options.idKey ?? '_recordId'
  const childrenField = options.childrenField ?? 'children'

  const idToNode = new Map<string, T & Record<string, unknown>>()
  for (const row of rows) {
    const id = row[idKey]
    if (id != null) idToNode.set(String(id), row as T & Record<string, unknown>)
  }

  const roots: (T & Record<string, unknown>)[] = []
  for (const row of rows) {
    const parentId = row[options.parentField]
    const parentNode = parentId != null && parentId !== '' ? idToNode.get(String(parentId)) : undefined
    // 自引用（parentId === 自身 id）视为根，防止环把行挂丢
    if (!parentNode || parentNode === row) {
      roots.push(row as T & Record<string, unknown>)
    } else {
      const holder = parentNode as Record<string, unknown>
      const children = (holder[childrenField] as (T & Record<string, unknown>)[] | undefined)
        ?? (holder[childrenField] = [])
      children.push(row as T & Record<string, unknown>)
    }
  }
  return roots
}
