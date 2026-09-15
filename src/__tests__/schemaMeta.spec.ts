import { describe, expect, it } from 'vitest'
import type { FieldType } from '@/types'
import {
  FIELD_META,
  FIELD_SCHEMA_KEYS,
  FIELD_TYPE_VALUES,
  META_GROUP_LABELS,
  META_GROUP_ORDER,
  META_KIND_LABELS,
  META_SURFACE_LABELS,
  MODULE_META,
  MODULE_SCHEMA_KEYS,
  findMeta,
  getFieldProperties,
  getModuleProperties,
  groupProperties,
  searchMeta,
} from '@/schemaMeta'

/** FieldSchema 的全部字段名(与穷举键表比对,双重防漏) */
const FIELD_KEY_SNAPSHOT = Object.keys(FIELD_SCHEMA_KEYS).sort()
const MODULE_KEY_SNAPSHOT = Object.keys(MODULE_SCHEMA_KEYS).sort()

describe('schemaMeta 防漏机制', () => {
  it('FIELD_META 覆盖 FieldSchema 全部字段且无重复、无多余', () => {
    const metaKeys = FIELD_META.map(m => m.key)
    expect(new Set(metaKeys).size).toBe(metaKeys.length)
    expect([...metaKeys].sort()).toEqual(FIELD_KEY_SNAPSHOT)
  })

  it('MODULE_META 覆盖 ModuleSchema 全部字段且无重复、无多余', () => {
    const metaKeys = MODULE_META.map(m => m.key)
    expect(new Set(metaKeys).size).toBe(metaKeys.length)
    expect([...metaKeys].sort()).toEqual(MODULE_KEY_SNAPSHOT)
  })

  it('穷举键表数量与元数据数量一致(FieldSchema 52 项 / ModuleSchema 15 项)', () => {
    expect(Object.keys(FIELD_SCHEMA_KEYS)).toHaveLength(FIELD_META.length)
    expect(Object.keys(MODULE_SCHEMA_KEYS)).toHaveLength(MODULE_META.length)
  })
})

describe('schemaMeta 元数据完整性', () => {
  it.each([...FIELD_META, ...MODULE_META])('$key: 文案与结构完整', (meta) => {
    expect(meta.label.length).toBeGreaterThan(0)
    expect(meta.description.length).toBeGreaterThan(0)
    expect(Array.isArray(meta.surfaces)).toBe(true)
    expect(META_GROUP_ORDER).toContain(meta.group)
    expect(META_GROUP_LABELS[meta.group]).toBeTruthy()
    expect(META_KIND_LABELS[meta.kind]).toBeTruthy()
  })

  it('enum 类型的元数据必须提供非空取值表,取值表项有中文标签', () => {
    const all = [...FIELD_META, ...MODULE_META]
    const missingEnum = all
      .filter(m => m.kind === 'enum' && !(m.enumValues && m.enumValues.length > 0))
      .map(m => m.key)
    expect(missingEnum).toEqual([])
    const unnamed = all.flatMap(m => m.enumValues ?? [])
      .filter(ev => ev.label.length === 0)
      .map(ev => ev.value)
    expect(unnamed).toEqual([])
  })

  it('字段属性 appliesTo 引用的类型必须是合法 FieldType', () => {
    const validTypes = new Set(FIELD_TYPE_VALUES.map(v => v.value))
    const invalid = FIELD_META.flatMap((meta) => {
      if (meta.appliesTo === 'all') return []
      return meta.appliesTo
        .filter(t => !validTypes.has(t))
        .map(t => `${meta.key}:${t}`)
    })
    expect(invalid).toEqual([])
  })

  it('生效面标签表覆盖所有出现过的 surface', () => {
    const unlabeled = [...FIELD_META, ...MODULE_META]
      .flatMap(meta => meta.surfaces.map(s => ({ key: meta.key, s })))
      .filter(({ s }) => !META_SURFACE_LABELS[s])
      .map(({ key, s }) => `${key}:${s}`)
    expect(unlabeled).toEqual([])
  })
})

describe('schemaMeta 查询 API', () => {
  it('getFieldProperties 按 appliesTo 过滤', () => {
    const textProps = getFieldProperties('text')
    const keys = textProps.map(m => m.key)
    expect(keys).toContain('label')
    expect(keys).not.toContain('decimal')
    expect(keys).not.toContain('switchMode')

    const numberProps = getFieldProperties('number').map(m => m.key)
    expect(numberProps).toContain('decimal')
    expect(numberProps).toContain('decimalMode')
    expect(numberProps).not.toContain('switchMode')

    const boolProps = getFieldProperties('boolean').map(m => m.key)
    expect(boolProps).toContain('switchMode')
    expect(boolProps).not.toContain('decimal')

    const actionProps = getFieldProperties('action').map(m => m.key)
    expect(actionProps).toContain('rowAction')
  })

  it('getFieldProperties 对全部类型都包含 appliesTo=all 的属性', () => {
    const universal = FIELD_META.filter(m => m.appliesTo === 'all').map(m => m.key)
    const missing: string[] = []
    for (const t of FIELD_TYPE_VALUES.map(v => v.value as FieldType)) {
      const keys = new Set(getFieldProperties(t).map(m => m.key))
      for (const k of universal) {
        if (!keys.has(k)) missing.push(`${t}:${k}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('searchMeta 按 key/label/description 搜索', () => {
    expect(searchMeta('decimal').map(m => m.key)).toContain('decimal')
    expect(searchMeta('小数').map(m => m.key)).toContain('decimal')
    expect(searchMeta('列标题').map(m => m.key)).toContain('label')
    expect(searchMeta('目标模块').map(m => m.key)).toContain('targetModule')
  })

  it('searchMeta 空关键词返回全量(字段 + 模块)', () => {
    expect(searchMeta('')).toHaveLength(FIELD_META.length + MODULE_META.length)
  })

  it('findMeta 按 target 精确查找', () => {
    expect(findMeta('decimal', 'field')?.label).toBe('小数位数')
    expect(findMeta('listEditMode', 'module')?.kind).toBe('enum')
    expect(findMeta('decimal', 'module')).toBeUndefined()
  })

  it('getModuleProperties 返回模块元数据;groupProperties 按组聚合且不丢项', () => {
    expect(getModuleProperties()).toHaveLength(MODULE_META.length)
    const grouped = groupProperties(FIELD_META)
    const total = grouped.reduce((sum, g) => sum + g.items.length, 0)
    expect(total).toBe(FIELD_META.length)
    const groupSeq = grouped.map(g => g.group)
    expect(groupSeq).toEqual([...groupSeq].sort((a, b) =>
      META_GROUP_ORDER.indexOf(a) - META_GROUP_ORDER.indexOf(b),
    ))
  })
})
