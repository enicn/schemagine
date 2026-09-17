import { describe, it, expect } from 'vitest'
import { createSchemaMetaState, createRecordState } from '@/composables/instanceState'
import { useFormula } from '@/composables/useFormula'
import type { ModuleSchema } from '@/types'

/**
 * 公式重算性能基准(docs/19 §七「性能基准套件」:公式重算量化)。
 * 5 个公式的依赖链 × 1000 条记录,输出总耗时/单条均耗时;断言只设宽裕上限
 * (共享 CI runner 不抖动),绝对值作回归参考。随 `pnpm test:unit` 常规运行,
 * 成本控制在数秒内。
 */

const RECORDS = 1000

function makeFormulaSchema(): ModuleSchema {
  return {
    id: 'module-formula-bench',
    name: '公式基准',
    version: '1.0.0',
    moduleType: 'list',
    fields: [],
    formulaConfig: {
      enabled: true,
      maxDepth: 5,
      circularDependencyCheck: true,
      fields: [
        { fieldKey: 'f1', expression: 'a + b', dependencies: ['a', 'b'], resultType: 'number' },
        { fieldKey: 'f2', expression: 'f1 * c', dependencies: ['f1', 'c'], resultType: 'number' },
        { fieldKey: 'f3', expression: 'f2 + d', dependencies: ['f2', 'd'], resultType: 'number' },
        { fieldKey: 'f4', expression: 'f3 - e', dependencies: ['f3', 'e'], resultType: 'number' },
        { fieldKey: 'f5', expression: 'f4 * f1', dependencies: ['f4', 'f1'], resultType: 'number' },
      ],
    },
    permissions: { view: true, create: true, edit: true, delete: true, export: true, configure: true },
    defaultViewMode: 'list',
    status: 'active',
  } as unknown as ModuleSchema
}

describe('公式重算性能基准(docs/19 §七)', () => {
  it('5 公式依赖链 × 1000 条记录,结果正确且耗时受控', () => {
    const schemaMeta = createSchemaMetaState()
    schemaMeta.setSchema(makeFormulaSchema())
    const formula = useFormula(createRecordState(), schemaMeta)

    // 正确性抽查(拓扑序:f1→f5 逐级依赖)
    const probe = formula.evaluateAllFormulas({ a: 2, b: 3, c: 4, d: 5, e: 6 })
    expect(probe.get('f1')?.value).toBe(5)
    expect(probe.get('f2')?.value).toBe(20)
    expect(probe.get('f3')?.value).toBe(25)
    expect(probe.get('f4')?.value).toBe(19)
    expect(probe.get('f5')?.value).toBe(95)

    const records = Array.from({ length: RECORDS }, (_, i) => ({ a: i, b: i * 2, c: 3, d: 4, e: 5 }))

    const start = performance.now()
    for (const fields of records) {
      formula.evaluateAllFormulas(fields)
    }
    const totalMs = performance.now() - start

    // 宽裕预算:mathjs 求值偏慢,5000 次求值在 CI 共享 runner 上也应有数秒级余量
    expect(totalMs).toBeLessThan(30_000)
    const line = `[formula-perf] ${JSON.stringify({
      records: RECORDS,
      formulaFields: 5,
      totalMs: Math.round(totalMs),
      avgMsPerRecord: Math.round((totalMs / RECORDS) * 100) / 100,
    })}`
    console.log(line)
  })
})
