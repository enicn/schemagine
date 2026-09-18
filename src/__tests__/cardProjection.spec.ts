import { describe, it, expect } from 'vitest'
import { deriveCardProjection, resolveSearchFields } from '@/utils/cardProjection'
import { resolveListActionMobilePolicy, resolveRowActionMobilePolicy } from '@/utils/mobileActions'
import type { ModuleSchema, FieldSchema, ListAction, RowActionConfig } from '@/types'

function makeField(key: string, overrides: Partial<FieldSchema> = {}): FieldSchema {
  return {
    id: key,
    name: key,
    key,
    type: 'text',
    label: key,
    required: false,
    readonly: false,
    order: 0,
    visible: true,
    sortable: false,
    filterable: false,
    ...overrides,
  } as FieldSchema
}

function makeSchema(fields: FieldSchema[], overrides: Partial<ModuleSchema> = {}): ModuleSchema {
  return {
    id: 'module-test',
    name: '测试模块',
    version: '1.0.0',
    moduleType: 'both',
    fields,
    permissions: { view: true, create: true, edit: true, delete: true, export: true, configure: true },
    defaultViewMode: 'list',
    status: 'active',
    ...overrides,
  } as ModuleSchema
}

describe('deriveCardProjection（移动卡片投影推导 §3.4）', () => {
  it('零配置：标题取第一个 text 字段，状态取名为 status 的枚举，缩略图取第一个 mediaImage', () => {
    const schema = makeSchema([
      makeField('code', { type: 'text' }),
      makeField('name', { type: 'text' }),
      makeField('status', { type: 'select', options: [{ label: '启用', value: 'on' }] }),
      makeField('cover', { type: 'mediaImage' }),
      makeField('price', { type: 'money' }),
    ])
    const p = deriveCardProjection(schema)
    expect(p.titleField).toBe('code')
    expect(p.statusField).toBe('status')
    expect(p.thumbField).toBe('cover')
    // 元字段 = 其余字段前 4（排除已用与媒体/关联类）
    expect(p.fields).toEqual(['name', 'price'])
  })

  it('无 status 字段时兜底第一个带 options 的 select/status；无枚举返回 null', () => {
    const withEnum = deriveCardProjection(makeSchema([
      makeField('name', { type: 'text' }),
      makeField('state', { type: 'status', statusMap: { a: 'success' } }),
    ]))
    expect(withEnum.statusField).toBe('state')

    const noEnum = deriveCardProjection(makeSchema([makeField('name', { type: 'text' })]))
    expect(noEnum.statusField).toBeNull()
  })

  it('无 text 字段时标题回退空串（渲染层以 record.id 兜底）', () => {
    const p = deriveCardProjection(makeSchema([
      makeField('num', { type: 'number' }),
      makeField('ok', { type: 'boolean' }),
    ]))
    expect(p.titleField).toBe('')
    expect(p.fields).toEqual(['num', 'ok'])
  })

  it('cardView 声明项逐项覆盖推导默认值；隐藏与动作字段不参与推导', () => {
    const schema = makeSchema([
      makeField('name', { type: 'text' }),
      makeField('secret', { visible: false, type: 'text' }),
      makeField('op', { type: 'action', rowAction: { type: 'custom', label: '动作' } }),
      makeField('price', { type: 'money' }),
      makeField('img', { type: 'image' }),
    ], {
      cardView: { titleField: 'price', fields: ['name'], thumbField: 'img' },
    })
    const p = deriveCardProjection(schema)
    expect(p.titleField).toBe('price')
    expect(p.fields).toEqual(['name'])
    expect(p.thumbField).toBe('img')
  })

  it('元字段排除媒体/关联/JSON 类；默认最多 4 个', () => {
    const schema = makeSchema([
      makeField('t', { type: 'text' }),
      makeField('a', { type: 'money' }),
      makeField('b', { type: 'number' }),
      makeField('c', { type: 'boolean' }),
      makeField('d', { type: 'date' }),
      makeField('e', { type: 'many-to-many' }),
      makeField('f', { type: 'json' }),
    ])
    const p = deriveCardProjection(schema)
    expect(p.fields).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('resolveSearchFields（移动搜索通道 §3.6）', () => {
  it('schema.searchFields 声明优先且裁掉未知/不可见字段', () => {
    const schema = makeSchema([
      makeField('name', { type: 'text' }),
      makeField('origin', { type: 'text', visible: false }),
      makeField('note', { type: 'text' }),
    ], { searchFields: ['name', 'origin', 'ghost'] })
    expect(resolveSearchFields(schema)).toEqual(['name'])
  })

  it('未声明时取第一个可见 text 字段；无 text 返回空数组', () => {
    expect(resolveSearchFields(makeSchema([
      makeField('num', { type: 'number' }),
      makeField('note', { type: 'text' }),
    ]))).toEqual(['note'])
    expect(resolveSearchFields(makeSchema([makeField('num', { type: 'number' })]))).toEqual([])
  })
})

describe('动作移动端策略（§3.3 矩阵内建规则）', () => {
  it('工具栏：custom/delete/sort 缺省 hidden，popup-schema/form-submit 缺省 allow', () => {
    const make = (overrides: Partial<ListAction>): ListAction =>
      ({ id: 'a', type: 'custom', label: '动作', ...overrides })
    expect(resolveListActionMobilePolicy(make({ type: 'custom' }))).toBe('hidden')
    expect(resolveListActionMobilePolicy(make({ type: 'delete' }))).toBe('hidden')
    expect(resolveListActionMobilePolicy(make({ type: 'sort' }))).toBe('hidden')
    expect(resolveListActionMobilePolicy(make({ type: 'popup-schema' }))).toBe('allow')
    expect(resolveListActionMobilePolicy(make({ type: 'form-submit' }))).toBe('allow')
  })

  it('工具栏：schema 显式 mobile 标注覆盖内建规则', () => {
    const action: ListAction = { id: 'a', type: 'custom', label: 'x', mobile: 'allow' }
    expect(resolveListActionMobilePolicy(action)).toBe('allow')
  })

  it('行级：缺省 block（export/custom/popup 等），delete 缺省 allow', () => {
    const make = (overrides: Partial<RowActionConfig>): RowActionConfig =>
      ({ type: 'custom', label: '动作', ...overrides })
    expect(resolveRowActionMobilePolicy(make({ type: 'custom' }))).toBe('block')
    expect(resolveRowActionMobilePolicy(make({ type: 'export' }))).toBe('block')
    expect(resolveRowActionMobilePolicy(make({ type: 'popup-schema' }))).toBe('block')
    expect(resolveRowActionMobilePolicy(make({ type: 'delete' }))).toBe('allow')
  })

  it('行级：mobile:allow 显式放行（如 mark_read/st_approve 名单）', () => {
    const action: RowActionConfig = { type: 'custom', label: '标记已读', mobile: 'allow' }
    expect(resolveRowActionMobilePolicy(action)).toBe('allow')
    const hidden: RowActionConfig = { type: 'custom', label: '出包', mobile: 'hidden' }
    expect(resolveRowActionMobilePolicy(hidden)).toBe('hidden')
  })

  it('非法 mobile 值回落内建规则', () => {
    const bad = { type: 'custom', label: 'x', mobile: 'yes' } as unknown as RowActionConfig
    expect(resolveRowActionMobilePolicy(bad)).toBe('block')
  })
})
