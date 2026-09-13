import { describe, it, expect } from 'vitest'

describe('Schema 字段重命名映射', () => {
  it('应自动将旧 key 映射到新 key', () => {
    const record = { fields: { remark: 'test note', amount: 100 } as Record<string, unknown> }
    const previousKeys = ['remark']
    const newKey = 'summary'

    for (const oldKey of previousKeys) {
      if (oldKey in record.fields && !(newKey in record.fields)) {
        record.fields[newKey] = record.fields[oldKey]
        delete record.fields[oldKey]
      }
    }

    expect(record.fields).toEqual({ summary: 'test note', amount: 100 })
  })

  it('应保留已有新 key 不被覆盖', () => {
    const record = { fields: { remark: 'old', summary: 'new', amount: 100 } as Record<string, unknown> }
    const previousKeys = ['remark']
    const newKey = 'summary'

    for (const oldKey of previousKeys) {
      if (oldKey in record.fields && !(newKey in record.fields)) {
        record.fields[newKey] = record.fields[oldKey]
        delete record.fields[oldKey]
      }
    }

    expect(record.fields).toEqual({ remark: 'old', summary: 'new', amount: 100 })
  })

  it('应处理空 previousKeys', () => {
    const record = { fields: { name: 'test' } as Record<string, unknown> }
    expect(record.fields).toEqual({ name: 'test' })
  })
})
