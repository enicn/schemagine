import { describe, expect, it } from 'vitest'
import { createLocalRecordService } from '@/services/local/localRecordService'

function makeRows(): Array<Record<string, unknown>> {
  return [
    { name: 'A 公司', amount: 100, status: 'active', tags: ['vip'] },
    { name: 'B 公司', amount: 250, status: 'active' },
    { name: 'C 公司', amount: 50, status: 'disabled' },
    { name: 'D 公司', amount: 250, status: 'pending', tags: ['vip', 'new'] },
  ]
}

function makeService() {
  return createLocalRecordService(makeRows(), { moduleId: 'module-demo' })
}

describe('createLocalRecordService list(docs/19 C1)', () => {
  it('分页:page/pageSize/total/hasMore 正确', async () => {
    const svc = makeService()
    const page1 = await svc.list({ moduleId: 'module-demo', page: 1, pageSize: 3 })
    expect(page1.success).toBe(true)
    expect(page1.data.total).toBe(4)
    expect(page1.data.records).toHaveLength(3)
    expect(page1.data.hasMore).toBe(true)

    const page2 = await svc.list({ moduleId: 'module-demo', page: 2, pageSize: 3 })
    expect(page2.data.records).toHaveLength(1)
    expect(page2.data.hasMore).toBe(false)
  })

  it('排序:asc/desc,空值恒排在最后', async () => {
    const svc = makeService()
    const asc = await svc.list({ moduleId: 'module-demo', page: 1, pageSize: 10, sort: { field: 'amount', order: 'asc' } })
    expect(asc.data.records.map(r => r.fields.amount)).toEqual([50, 100, 250, 250])

    const desc = await svc.list({ moduleId: 'module-demo', page: 1, pageSize: 10, sort: { field: 'amount', order: 'desc' } })
    expect(desc.data.records.slice(0, 2).map(r => r.fields.amount)).toEqual([250, 250])
    // 无 amount 的记录排在末尾——本数据集全有值,补一条验证
    svc.create({ moduleId: 'module-demo', fields: { name: 'E 公司' } })
    const desc2 = await svc.list({ moduleId: 'module-demo', page: 1, pageSize: 10, sort: { field: 'amount', order: 'desc' } })
    expect(desc2.data.records[desc2.data.records.length - 1]?.fields.name).toBe('E 公司')
  })

  it('过滤:like 包含匹配(数值转字符串)', async () => {
    const svc = makeService()
    const r = await svc.list({
      moduleId: 'module-demo',
      page: 1,
      pageSize: 10,
      filters: [{ field: 'amount', operator: 'like', value: '25' }],
    })
    expect(r.data.total).toBe(2)
  })

  it('过滤:in 命中;isNull/isNotNull 空值语义', async () => {
    const svc = makeService()
    const inResult = await svc.list({
      moduleId: 'module-demo',
      page: 1,
      pageSize: 10,
      filters: [{ field: 'status', operator: 'in', values: ['active', 'pending'] }],
    })
    expect(inResult.data.total).toBe(3)

    // B/C 无 tags → isNull 命中;A/D 有 tags → isNotNull 命中
    const isNullResult = await svc.list({
      moduleId: 'module-demo',
      page: 1,
      pageSize: 10,
      filters: [{ field: 'tags', operator: 'isNull', value: '' }],
    })
    expect(isNullResult.data.total).toBe(2)

    const isNotNullResult = await svc.list({
      moduleId: 'module-demo',
      page: 1,
      pageSize: 10,
      filters: [{ field: 'tags', operator: 'isNotNull', value: '' }],
    })
    expect(isNotNullResult.data.total).toBe(2)
  })

  it('模块绑定:其他 moduleId 返回空池', async () => {
    const svc = makeService()
    const r = await svc.list({ moduleId: 'module-other', page: 1, pageSize: 10 })
    expect(r.data.total).toBe(0)
    expect(r.data.records).toHaveLength(0)
  })

  it('未绑定模块:同一池服务所有 moduleId', async () => {
    const svc = createLocalRecordService(makeRows())
    const r = await svc.list({ moduleId: 'whatever', page: 1, pageSize: 10 })
    expect(r.data.total).toBe(4)
  })
})

describe('createLocalRecordService CRUD(docs/19 C1)', () => {
  it('getDetail 命中与 NOT_FOUND', async () => {
    const svc = makeService()
    const list = await svc.list({ moduleId: 'module-demo', page: 1, pageSize: 10 })
    const id = list.data.records[0]!.id

    const found = await svc.getDetail('module-demo', id)
    expect(found.success).toBe(true)
    expect(found.data.id).toBe(id)

    const missing = await svc.getDetail('module-demo', 'rec-none')
    expect(missing.success).toBe(false)
  })

  it('patchField:乐观锁冲突、force 覆盖、版本自增', async () => {
    const svc = makeService()
    const list = await svc.list({ moduleId: 'module-demo', page: 1, pageSize: 10 })
    // list 返回的是池内活引用,先取值再操作,避免断言被 patch 副作用影响
    const record = list.data.records[0]!
    const versionBefore = record.version
    const recordId = record.id

    const conflict = await svc.patchField({
      moduleId: 'module-demo', recordId, field: 'amount', value: 999, expectedVersion: 99,
    })
    expect(conflict.success).toBe(false)

    const ok = await svc.patchField({
      moduleId: 'module-demo', recordId, field: 'amount', value: 999, expectedVersion: versionBefore,
    })
    expect(ok.success).toBe(true)
    expect(ok.data.fields.amount).toBe(999)
    expect(ok.data.version).toBe(versionBefore + 1)

    const forced = await svc.patchField({
      moduleId: 'module-demo', recordId, field: 'amount', value: 1000, expectedVersion: 1, force: true,
    })
    expect(forced.success).toBe(true)
  })

  it('create/batchCreate:生成 id、version=1,追加到池', async () => {
    const svc = makeService()
    const created = await svc.create({ moduleId: 'module-demo', fields: { name: '新公司' } })
    expect(created.data.version).toBe(1)
    expect(created.data.id).toMatch(/^rec-local/)

    await svc.batchCreate([
      { moduleId: 'module-demo', fields: { name: '批量1' } },
      { moduleId: 'module-demo', fields: { name: '批量2' } },
    ])
    const list = await svc.list({ moduleId: 'module-demo', page: 1, pageSize: 10 })
    expect(list.data.total).toBe(7)
    expect(svc.getRecords()).toHaveLength(7)
  })

  it('setRecords 整体重换', async () => {
    const svc = makeService()
    svc.setRecords([{ name: '全新' }])
    const list = await svc.list({ moduleId: 'module-demo', page: 1, pageSize: 10 })
    expect(list.data.total).toBe(1)
  })
})

describe('createLocalRecordService listFieldValueCandidates(docs/19 C1)', () => {
  it('去重计数、count 降序、keyword 过滤、hasMore', async () => {
    const svc = makeService()
    const all = await svc.listFieldValueCandidates({ moduleId: 'module-demo', field: 'status', page: 1, pageSize: 10 })
    expect(all.data.total).toBe(3)
    expect(all.data.options[0]).toMatchObject({ value: 'active', count: 2 })
    expect(all.data.hasMore).toBe(false)

    const keyword = await svc.listFieldValueCandidates({ moduleId: 'module-demo', field: 'status', keyword: 'act', page: 1, pageSize: 10 })
    expect(keyword.data.total).toBe(1)
    expect(keyword.data.options[0]?.label).toBe('active')

    // 分页 hasMore
    const paged = await svc.listFieldValueCandidates({ moduleId: 'module-demo', field: 'status', page: 1, pageSize: 2 })
    expect(paged.data.options).toHaveLength(2)
    expect(paged.data.hasMore).toBe(true)
  })

  it('数组字段展开计数、布尔标签渲染为 是/否', async () => {
    const svc = makeService()
    const tags = await svc.listFieldValueCandidates({ moduleId: 'module-demo', field: 'tags', page: 1, pageSize: 10 })
    const vip = tags.data.options.find(o => o.value === 'vip')
    expect(vip?.count).toBe(2)

    const boolSvc = createLocalRecordService([{ ok: true }, { ok: false }], { moduleId: 'm' })
    const bools = await boolSvc.listFieldValueCandidates({ moduleId: 'm', field: 'ok', page: 1, pageSize: 10 })
    // 同计数按 zh-CN locale 排序,平局顺序随实现;只断言布尔标签渲染为 是/否
    expect(bools.data.options.map(o => o.label).sort()).toEqual(['是', '否'].sort())
  })

  it('filters 参与候选值统计(与 mock 同口径)', async () => {
    const svc = makeService()
    const r = await svc.listFieldValueCandidates({
      moduleId: 'module-demo',
      field: 'tags',
      page: 1,
      pageSize: 10,
      filters: [{ field: 'status', operator: 'eq', value: 'active' }],
    })
    const newTag = r.data.options.find(o => o.value === 'new')
    expect(newTag).toBeUndefined()
    expect(r.data.options.find(o => o.value === 'vip')?.count).toBe(1)
  })
})
