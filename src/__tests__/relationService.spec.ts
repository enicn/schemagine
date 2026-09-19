import { describe, it, expect, beforeEach } from 'vitest'
import type { RelationEntry, ModuleSchema } from '@/types'
import { MockRelationService } from '@/services/mock/mockAdapter'
import { MockRecordService } from '@/services/mock/mockAdapter'
import { setRelationService } from '@/services/api/relationService'
import { setRecordService } from '@/services/api/recordService'
import {
  invoiceSchema,
  receivableSchema,
  userSchema,
  salesOrderSchema,
} from '@/services/mock/sampleSchemas'

describe('RelationService — 一对多关联 (one-to-many)', () => {
  let relationService: MockRelationService

  beforeEach(() => {
    const mockRecordService = new MockRecordService()
    setRecordService(mockRecordService)
    relationService = new MockRelationService()
    setRelationService(relationService)

    // 种子关系数据：发票-001 关联 应收-001、应收-002，各自分配金额
    relationService.seedRelations([
      {
        id: 'rel-001',
        sourceModuleId: 'module-invoice',
        sourceRecordId: 'rec-inv-001',
        targetModuleId: 'module-receivable',
        targetRecordId: 'rec-rec-001',
        fieldKey: 'receivables',
        extraFields: { allocatedAmount: 5000 },
        createdAt: '2026-05-01T10:00:00Z',
        updatedAt: '2026-05-01T10:00:00Z',
      },
      {
        id: 'rel-002',
        sourceModuleId: 'module-invoice',
        sourceRecordId: 'rec-inv-001',
        targetModuleId: 'module-receivable',
        targetRecordId: 'rec-rec-002',
        fieldKey: 'receivables',
        extraFields: { allocatedAmount: 7500 },
        createdAt: '2026-05-01T10:05:00Z',
        updatedAt: '2026-05-01T10:05:00Z',
      },
    ])
  })

  it('能够获取一条发票关联的所有应收账单', async () => {
    const { data: relations } = await relationService.getRelations(
      'module-invoice',
      'rec-inv-001',
      'receivables',
    )

    expect(relations).toHaveLength(2)
    expect(relations[0]!.targetRecordId).toBe('rec-rec-001')
    expect(relations[1]!.targetRecordId).toBe('rec-rec-002')
  })

  it('关系表包含连带信息 — 每笔应收的分配金额', async () => {
    const { data: relations } = await relationService.getRelations(
      'module-invoice',
      'rec-inv-001',
      'receivables',
    )

    expect(relations[0]!.extraFields.allocatedAmount).toBe(5000)
    expect(relations[1]!.extraFields.allocatedAmount).toBe(7500)
  })

  it('新增一条关联并携带连带字段', async () => {
    const newEntry: Omit<RelationEntry, 'id' | 'createdAt' | 'updatedAt'> = {
      sourceModuleId: 'module-invoice',
      sourceRecordId: 'rec-inv-001',
      targetModuleId: 'module-receivable',
      targetRecordId: 'rec-rec-003',
      fieldKey: 'receivables',
      extraFields: { allocatedAmount: 3000 },
    }

    const res = await relationService.addRelation(newEntry)
    expect(res.success).toBe(true)
    expect(res.data.id).toBeDefined()
    expect(res.data.extraFields.allocatedAmount).toBe(3000)

    const { data: allRelations } = await relationService.getRelations(
      'module-invoice',
      'rec-inv-001',
      'receivables',
    )
    expect(allRelations).toHaveLength(3)
  })

  it('更新关联的连带字段', async () => {
    const res = await relationService.updateRelation('rel-001', {
      allocatedAmount: 6000,
    })

    expect(res.success).toBe(true)
    expect(res.data.extraFields.allocatedAmount).toBe(6000)

    const { data: relations } = await relationService.getRelations(
      'module-invoice',
      'rec-inv-001',
      'receivables',
    )
    const rel = relations.find(r => r.id === 'rel-001')
    expect(rel!.extraFields.allocatedAmount).toBe(6000)
  })

  it('删除一条关联', async () => {
    await relationService.removeRelation('rel-001')

    const { data: relations } = await relationService.getRelations(
      'module-invoice',
      'rec-inv-001',
      'receivables',
    )
    expect(relations).toHaveLength(1)
    expect(relations[0]!.id).toBe('rel-002')
  })

  it('反向查询可用 — 根据应收账单反查关联的发票 (M2M场景)', async () => {
    const { data: sourceRecords } = await relationService.getSourceRecords(
      'module-receivable',
      'rec-rec-001',
      'receivables',
    )

    expect(sourceRecords).toHaveLength(1)
    expect(sourceRecords[0]!.id).toBe('rec-inv-001')
  })
})

describe('RelationService — 多对多关联 (many-to-many)', () => {
  let relationService: MockRelationService

  beforeEach(() => {
    const mockRecordService = new MockRecordService()
    setRecordService(mockRecordService)
    relationService = new MockRelationService()
    setRelationService(relationService)

    // 模拟用户-车间多对多关系：用户A关联车间1(主任)、车间2(统计员)
    // 用户B也关联车间1(统计员)
    relationService.seedRelations([
      {
        id: 'rel-ws-001',
        sourceModuleId: 'module-user',
        sourceRecordId: 'rec-user-001',
        targetModuleId: 'module-workshop',
        targetRecordId: 'rec-ws-001',
        fieldKey: 'workshops',
        extraFields: { role: '主任' },
        createdAt: '2026-05-01T08:00:00Z',
        updatedAt: '2026-05-01T08:00:00Z',
      },
      {
        id: 'rel-ws-002',
        sourceModuleId: 'module-user',
        sourceRecordId: 'rec-user-001',
        targetModuleId: 'module-workshop',
        targetRecordId: 'rec-ws-002',
        fieldKey: 'workshops',
        extraFields: { role: '统计员' },
        createdAt: '2026-05-01T09:00:00Z',
        updatedAt: '2026-05-01T09:00:00Z',
      },
      {
        id: 'rel-ws-003',
        sourceModuleId: 'module-user',
        sourceRecordId: 'rec-user-002',
        targetModuleId: 'module-workshop',
        targetRecordId: 'rec-ws-001',
        fieldKey: 'workshops',
        extraFields: { role: '统计员' },
        createdAt: '2026-05-02T08:00:00Z',
        updatedAt: '2026-05-02T08:00:00Z',
      },
    ])
  })

  it('用户A关联了2个车间，且角色不同', async () => {
    const { data: relations } = await relationService.getRelations(
      'module-user',
      'rec-user-001',
      'workshops',
    )

    expect(relations).toHaveLength(2)
    const roles = relations.map(r => r.extraFields.role)
    expect(roles).toContain('主任')
    expect(roles).toContain('统计员')
  })

  it('车间1关联了2个用户 (反向查询)', async () => {
    const { data: sourceRecords } = await relationService.getSourceRecords(
      'module-workshop',
      'rec-ws-001',
      'workshops',
    )

    expect(sourceRecords).toHaveLength(2)
    const ids = sourceRecords.map(r => r.id)
    expect(ids).toContain('rec-user-001')
    expect(ids).toContain('rec-user-002')
  })

  it('获取车间1的所有关联，连带信息正确', async () => {
    const { data: relations } = await relationService.getTargetRelations(
      'module-workshop',
      'rec-ws-001',
      'workshops',
    )

    expect(relations).toHaveLength(2)
    const user1Relation = relations.find(r => r.sourceRecordId === 'rec-user-001')
    expect(user1Relation!.extraFields.role).toBe('主任')
    const user2Relation = relations.find(r => r.sourceRecordId === 'rec-user-002')
    expect(user2Relation!.extraFields.role).toBe('统计员')
  })
})

describe('RelationService — 销售单-应收 一对多关联', () => {
  let relationService: MockRelationService

  beforeEach(() => {
    const mockRecordService = new MockRecordService()
    setRecordService(mockRecordService)
    relationService = new MockRelationService()
    setRelationService(relationService)

    // 销售单 SO-001 关联 3 笔应收，各分配金额、核销状态
    relationService.seedRelations([
      {
        id: 'rel-so-001',
        sourceModuleId: 'module-sales-order',
        sourceRecordId: 'rec-so-001',
        targetModuleId: 'module-receivable',
        targetRecordId: 'rec-rec-001',
        fieldKey: 'receivables',
        extraFields: { allocatedAmount: 5000, writeOffStatus: '已核销' },
        createdAt: '2026-05-01T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      },
      {
        id: 'rel-so-002',
        sourceModuleId: 'module-sales-order',
        sourceRecordId: 'rec-so-001',
        targetModuleId: 'module-receivable',
        targetRecordId: 'rec-rec-002',
        fieldKey: 'receivables',
        extraFields: { allocatedAmount: 7500, writeOffStatus: '部分核销' },
        createdAt: '2026-05-01T10:05:00Z',
        updatedAt: '2026-05-08T10:00:00Z',
      },
      {
        id: 'rel-so-003',
        sourceModuleId: 'module-sales-order',
        sourceRecordId: 'rec-so-001',
        targetModuleId: 'module-receivable',
        targetRecordId: 'rec-rec-003',
        fieldKey: 'receivables',
        extraFields: { allocatedAmount: 3000, writeOffStatus: '未核销' },
        createdAt: '2026-05-01T10:10:00Z',
        updatedAt: '2026-05-01T10:10:00Z',
      },
    ])
  })

  it('销售单 SO-001 关联了 3 笔应收账单', async () => {
    const { data: relations } = await relationService.getRelations(
      'module-sales-order',
      'rec-so-001',
      'receivables',
    )

    expect(relations).toHaveLength(3)
    const targetIds = relations.map(r => r.targetRecordId)
    expect(targetIds).toContain('rec-rec-001')
    expect(targetIds).toContain('rec-rec-002')
    expect(targetIds).toContain('rec-rec-003')
  })

  it('每笔关联包含分配金额和核销状态', async () => {
    const { data: relations } = await relationService.getRelations(
      'module-sales-order',
      'rec-so-001',
      'receivables',
    )

    const rel1 = relations.find(r => r.targetRecordId === 'rec-rec-001')!
    expect(rel1.extraFields.allocatedAmount).toBe(5000)
    expect(rel1.extraFields.writeOffStatus).toBe('已核销')

    const rel2 = relations.find(r => r.targetRecordId === 'rec-rec-002')!
    expect(rel2.extraFields.allocatedAmount).toBe(7500)
    expect(rel2.extraFields.writeOffStatus).toBe('部分核销')

    const rel3 = relations.find(r => r.targetRecordId === 'rec-rec-003')!
    expect(rel3.extraFields.allocatedAmount).toBe(3000)
    expect(rel3.extraFields.writeOffStatus).toBe('未核销')
  })

  it('分配金额总和不超过销售总额 (由应用层校验，此处验证数据完整性)', async () => {
    const { data: relations } = await relationService.getRelations(
      'module-sales-order',
      'rec-so-001',
      'receivables',
    )

    const totalAllocated = relations.reduce(
      (sum, r) => sum + (r.extraFields.allocatedAmount as number),
      0,
    )
    expect(totalAllocated).toBe(15500)
  })

  it('修改某笔关联的核销状态', async () => {
    const res = await relationService.updateRelation('rel-so-003', {
      writeOffStatus: '已核销',
    })

    expect(res.success).toBe(true)
    expect(res.data.extraFields.writeOffStatus).toBe('已核销')
    expect(res.data.extraFields.allocatedAmount).toBe(3000)

    const { data: relations } = await relationService.getRelations(
      'module-sales-order',
      'rec-so-001',
      'receivables',
    )
    const rel = relations.find(r => r.id === 'rel-so-003')!
    expect(rel.extraFields.writeOffStatus).toBe('已核销')
  })

  it('新增一笔关联时携带连带字段', async () => {
    const res = await relationService.addRelation({
      sourceModuleId: 'module-sales-order',
      sourceRecordId: 'rec-so-001',
      targetModuleId: 'module-receivable',
      targetRecordId: 'rec-rec-004',
      fieldKey: 'receivables',
      extraFields: { allocatedAmount: 2000, writeOffStatus: '未核销' },
    })

    expect(res.success).toBe(true)
    expect(res.data.extraFields.allocatedAmount).toBe(2000)
    expect(res.data.extraFields.writeOffStatus).toBe('未核销')

    const { data: relations } = await relationService.getRelations(
      'module-sales-order',
      'rec-so-001',
      'receivables',
    )
    expect(relations).toHaveLength(4)
  })

  it('删除关联后数量减少', async () => {
    await relationService.removeRelation('rel-so-002')

    const { data: relations } = await relationService.getRelations(
      'module-sales-order',
      'rec-so-001',
      'receivables',
    )
    expect(relations).toHaveLength(2)
  })

  it('反向查询 — 根据应收查关联的销售单', async () => {
    const { data: sourceRecords } = await relationService.getSourceRecords(
      'module-receivable',
      'rec-rec-001',
      'receivables',
    )

    expect(sourceRecords).toHaveLength(1)
    expect(sourceRecords[0]!.id).toBe('rec-so-001')
  })
})

describe('RelationService — Schema 类型定义验证', () => {
  it('one-to-many 字段包含 relationConfig 配置', async () => {
    const schema: ModuleSchema = invoiceSchema
    const field = schema.fields.find(f => f.key === 'receivables')
    expect(field).toBeDefined()
    expect(field!.type).toBe('one-to-many')
    expect(field!.relationConfig).toBeDefined()
    expect(field!.relationConfig!.targetModule).toBe('module-receivable')
    expect(field!.relationConfig!.displayField).toBe('name')
    expect(field!.relationConfig!.extraFields).toHaveLength(1)
    expect(field!.relationConfig!.extraFields![0]!.key).toBe('allocatedAmount')
  })

  it('many-to-many 字段包含 relationConfig 配置', async () => {
    const schema: ModuleSchema = userSchema
    const field = schema.fields.find(f => f.key === 'workshops')
    expect(field).toBeDefined()
    expect(field!.type).toBe('many-to-many')
    expect(field!.relationConfig).toBeDefined()
    expect(field!.relationConfig!.targetModule).toBe('module-workshop')
    expect(field!.relationConfig!.extraFields![0]!.key).toBe('role')
  })

  it('销售单 one-to-many 字段包含多个连带字段', async () => {
    const schema: ModuleSchema = salesOrderSchema
    const field = schema.fields.find(f => f.key === 'receivables')
    expect(field).toBeDefined()
    expect(field!.type).toBe('one-to-many')
    expect(field!.relationConfig).toBeDefined()
    expect(field!.relationConfig!.targetModule).toBe('module-receivable')
    expect(field!.relationConfig!.extraFields).toHaveLength(2)
    const keys = field!.relationConfig!.extraFields!.map(e => e.key)
    expect(keys).toContain('allocatedAmount')
    expect(keys).toContain('writeOffStatus')
  })
})

describe('应收账单 — 反向引用 (reverse-ref) 双向展示', () => {
  let relationService: MockRelationService

  beforeEach(() => {
    const mockRecordService = new MockRecordService()
    setRecordService(mockRecordService)
    relationService = new MockRelationService()
    setRelationService(relationService)

    // 应收 rec-rec-001 被发票 inv-001 和销售单 so-001 同时引用
    relationService.seedRelations([
      {
        id: 'rel-inv-rec-001',
        sourceModuleId: 'module-invoice',
        sourceRecordId: 'rec-inv-001',
        targetModuleId: 'module-receivable',
        targetRecordId: 'rec-rec-001',
        fieldKey: 'receivables',
        extraFields: { allocatedAmount: 5000 },
        createdAt: '2026-05-01T10:00:00Z',
        updatedAt: '2026-05-01T10:00:00Z',
      },
      {
        id: 'rel-so-rec-001',
        sourceModuleId: 'module-sales-order',
        sourceRecordId: 'rec-so-001',
        targetModuleId: 'module-receivable',
        targetRecordId: 'rec-rec-001',
        fieldKey: 'receivables',
        extraFields: { allocatedAmount: 5000, writeOffStatus: '已核销' },
        createdAt: '2026-05-01T10:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      },
    ])
  })

  it('收回应收账单被 2 条源记录引用（发票 + 销售单）', async () => {
    const { data: sourceRecords } = await relationService.getSourceRecords(
      'module-receivable',
      'rec-rec-001',
      'receivables',
    )

    expect(sourceRecords).toHaveLength(2)
    const ids = sourceRecords.map(r => r.id)
    expect(ids).toContain('rec-inv-001')
    expect(ids).toContain('rec-so-001')
  })

  it('应收账单 reverse-ref 字段存在于 Schema 中', async () => {
    const schema: ModuleSchema = receivableSchema
    const field = schema.fields.find(f => f.key === 'sourceDocs')
    expect(field).toBeDefined()
    expect(field!.type).toBe('reverse-ref')
    expect(field!.reverseRefConfig).toBeDefined()
    expect(field!.reverseRefConfig!.sourceModules).toHaveLength(2)
    const modules = field!.reverseRefConfig!.sourceModules
    expect(modules).toContain('module-invoice')
    expect(modules).toContain('module-sales-order')
  })

  it('通过 getTargetRelations 获取应收关联的所有源关系详情', async () => {
    const { data: relations } = await relationService.getTargetRelations(
      'module-receivable',
      'rec-rec-001',
      'receivables',
    )

    expect(relations).toHaveLength(2)
    const sourceModuleIds = relations.map(r => r.sourceModuleId)
    expect(sourceModuleIds).toContain('module-invoice')
    expect(sourceModuleIds).toContain('module-sales-order')
  })
})

describe('RelationService — 关联编辑器的核心操作（模拟 UI 层交互）', () => {
  let relationService: MockRelationService

  beforeEach(() => {
    const mockRecordService = new MockRecordService()
    setRecordService(mockRecordService)
    relationService = new MockRelationService()
    setRelationService(relationService)

    relationService.seedRelations([
      {
        id: 'rel-edit-001',
        sourceModuleId: 'module-sales-order',
        sourceRecordId: 'rec-so-001',
        targetModuleId: 'module-receivable',
        targetRecordId: 'rec-rec-001',
        fieldKey: 'receivables',
        extraFields: { allocatedAmount: 5000, writeOffStatus: '未核销' },
        createdAt: '2026-05-01T10:00:00Z',
        updatedAt: '2026-05-01T10:00:00Z',
      },
    ])
  })

  it('添加关联时 targetRecordId 和 extraFields 能正确保存', async () => {
    const res = await relationService.addRelation({
      sourceModuleId: 'module-sales-order',
      sourceRecordId: 'rec-so-001',
      targetModuleId: 'module-receivable',
      targetRecordId: 'rec-rec-002',
      fieldKey: 'receivables',
      extraFields: { allocatedAmount: 7500, writeOffStatus: '部分核销' },
    })

    expect(res.success).toBe(true)
    expect(res.data.targetRecordId).toBe('rec-rec-002')
    expect(res.data.extraFields.allocatedAmount).toBe(7500)
    expect(res.data.extraFields.writeOffStatus).toBe('部分核销')

    const { data: relations } = await relationService.getRelations(
      'module-sales-order',
      'rec-so-001',
      'receivables',
    )
    expect(relations).toHaveLength(2)
  })

  it('批量更新一条关联的多个连带字段', async () => {
    const res = await relationService.updateRelation('rel-edit-001', {
      allocatedAmount: 6000,
      writeOffStatus: '已核销',
    })

    expect(res.success).toBe(true)
    expect(res.data.extraFields.allocatedAmount).toBe(6000)
    expect(res.data.extraFields.writeOffStatus).toBe('已核销')
  })

  it('删除后 getRelations 不再返回该条', async () => {
    await relationService.removeRelation('rel-edit-001')

    const { data: relations } = await relationService.getRelations(
      'module-sales-order',
      'rec-so-001',
      'receivables',
    )
    expect(relations).toHaveLength(0)
  })
})
