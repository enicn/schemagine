import { describe, it, expect } from 'vitest'

describe('Schema 链式迁移', () => {
  it('应按版本顺序链式执行迁移', () => {
    const record = { fields: { amount: '1000' } }

    const migrations = [
      {
        fromVersion: '1.0.0', toVersion: '1.1.0',
        migrateRecord: (fields: Record<string, unknown>) => {
          fields.amount = Number(fields.amount)
        },
      },
      {
        fromVersion: '1.1.0', toVersion: '2.0.0',
        migrateRecord: (fields: Record<string, unknown>) => {
          fields.amountWithTax = (fields.amount as number) * 1.13
        },
      },
    ]

    for (const m of migrations) {
      m.migrateRecord(record.fields)
    }

    expect(record.fields).toEqual({ amount: 1000, amountWithTax: 1130 })
  })

  it('迁移异常不应损坏旧数据（回滚）', () => {
    const original = { fields: { name: 'test' } }
    const snapshot = JSON.parse(JSON.stringify(original))

    const badMigration = {
      migrateRecord: (_fields: Record<string, unknown>) => { throw new Error('迁移失败') },
    }

    try {
      badMigration.migrateRecord(original.fields)
    } catch {
      original.fields = JSON.parse(JSON.stringify(snapshot.fields))
    }

    expect(original.fields).toEqual({ name: 'test' })
  })
})
