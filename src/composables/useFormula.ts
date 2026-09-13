import { computed } from 'vue'
import { useRecords, useSchemaMeta, type RecordState, type SchemaMetaState } from '@/composables/instanceState'
import type { FormulaFieldConfig } from '@/types'
// mathjs/number 是 mathjs 的纯数字 ESM 子集，仅保留公式求值所需能力，显著减小产物体积
import { evaluate } from 'mathjs/number'

export interface FormulaResult {
  value: unknown
  success: boolean
  errorType?: 'circular' | 'eval' | 'missing_dependency' | 'type_mismatch'
  errorMessage?: string
  dependencySnapshot: Record<string, unknown>
}

export interface FormulaEvaluationContext {
  fieldKey: string
  expression: string
  dependencies: string[]
  dependencyValues: Record<string, unknown>
  result: FormulaResult
}

function safeEval(expression: string, context: Record<string, unknown>): unknown {
  try {
    const result = evaluate(expression, context)
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : '公式执行异常'
    return { __formulaError: message }
  }
}

function detectCycle(
  fieldKey: string,
  configs: FormulaFieldConfig[],
  visited: Set<string> = new Set(),
  path: string[] = [],
): { hasCycle: boolean; cyclePath: string[] } {
  if (visited.has(fieldKey)) {
    return { hasCycle: true, cyclePath: [...path, fieldKey] }
  }
  visited.add(fieldKey)
  path.push(fieldKey)

  const config = configs.find(c => c.fieldKey === fieldKey)
  if (config) {
    for (const dep of config.dependencies) {
      const depConfig = configs.find(c => c.fieldKey === dep)
      if (depConfig) {
        const result = detectCycle(dep, configs, visited, path)
        if (result.hasCycle) {
          return result
        }
      }
    }
  }

  path.pop()
  visited.delete(fieldKey)
  return { hasCycle: false, cyclePath: [] }
}

function cleanPrecision(value: number): number {
  return Math.round(value * 1e10) / 1e10
}

function formatFormulaResult(raw: unknown, resultType: string): unknown {
  if (raw !== null && typeof raw === 'object' && '__formulaError' in (raw as object)) {
    return raw
  }
  switch (resultType) {
    case 'number':
      if (typeof raw === 'number') return cleanPrecision(raw)
      if (typeof raw === 'string') {
        const parsed = Number(raw)
        return Number.isNaN(parsed) ? raw : cleanPrecision(parsed)
      }
      return raw
    case 'boolean':
      return Boolean(raw)
    case 'text':
      return String(raw ?? '')
    case 'date':
      if (raw instanceof Date) return raw.toISOString().split('T')[0]
      return String(raw ?? '')
    default:
      return raw
  }
}

export function useFormula(recordStoreParam?: RecordState, schemaMetaParam?: SchemaMetaState) {
  const recordStore = recordStoreParam ?? useRecords()
  const schemaMeta = schemaMetaParam ?? useSchemaMeta()

  const formulaConfigs = computed<FormulaFieldConfig[]>(() => {
    const schema = schemaMeta.schema
    if (!schema?.formulaConfig?.enabled) return []
    return schema.formulaConfig.fields
  })

  const hasCycleError = computed(() => {
    const configs = formulaConfigs.value
    for (const cfg of configs) {
      const result = detectCycle(cfg.fieldKey, configs)
      if (result.hasCycle) return result
    }
    return { hasCycle: false, cyclePath: [] }
  })

  function checkCycle(fieldKey: string): { hasCycle: boolean; cyclePath: string[] } {
    return detectCycle(fieldKey, formulaConfigs.value)
  }

  function getFieldDependencies(fieldKey: string): string[] {
    const config = formulaConfigs.value.find(c => c.fieldKey === fieldKey)
    return config?.dependencies ?? []
  }

  function getDependentFields(fieldKey: string): string[] {
    return formulaConfigs.value
      .filter(c => c.dependencies.includes(fieldKey))
      .map(c => c.fieldKey)
  }

  function evaluateFormula(
    fieldKey: string,
    recordFields: Record<string, unknown>,
  ): FormulaResult {
    if (hasCycleError.value.hasCycle) {
      return {
        value: null,
        success: false,
        errorType: 'circular',
        errorMessage: `检测到公式循环依赖: ${hasCycleError.value.cyclePath.join(' → ')}`,
        dependencySnapshot: {},
      }
    }

    const config = formulaConfigs.value.find(c => c.fieldKey === fieldKey)
    if (!config) {
      return {
        value: null,
        success: false,
        errorType: 'missing_dependency',
        errorMessage: `字段 ${fieldKey} 未配置公式`,
        dependencySnapshot: {},
      }
    }

    const dependencySnapshot: Record<string, unknown> = {}
    for (const dep of config.dependencies) {
      dependencySnapshot[dep] = recordFields[dep]
    }

    const missingDeps = config.dependencies.filter(d => !(d in recordFields))
    if (missingDeps.length > 0) {
      return {
        value: null,
        success: false,
        errorType: 'missing_dependency',
        errorMessage: `公式依赖字段缺失: ${missingDeps.join(', ')}`,
        dependencySnapshot,
      }
    }

    const raw = safeEval(config.expression, dependencySnapshot)
    if (raw !== null && typeof raw === 'object' && '__formulaError' in (raw as object)) {
      return {
        value: null,
        success: false,
        errorType: 'eval',
        errorMessage: (raw as { __formulaError: string }).__formulaError,
        dependencySnapshot,
      }
    }

    const result = formatFormulaResult(raw, config.resultType)
    return {
      value: result,
      success: true,
      dependencySnapshot,
    }
  }

  function evaluateAllFormulas(recordFields: Record<string, unknown>): Map<string, FormulaResult> {
    const results = new Map<string, FormulaResult>()
    const configs = formulaConfigs.value

    if (hasCycleError.value.hasCycle) {
      for (const cfg of configs) {
        results.set(cfg.fieldKey, {
          value: null,
          success: false,
          errorType: 'circular',
          errorMessage: `检测到公式循环依赖: ${hasCycleError.value.cyclePath.join(' → ')}`,
          dependencySnapshot: {},
        })
      }
      return results
    }

    const sorted = topologicalSort(configs)
    for (const cfg of sorted) {
      const result = evaluateFormula(cfg.fieldKey, recordFields)
      results.set(cfg.fieldKey, result)
      if (result.success) {
        recordFields[cfg.fieldKey] = result.value
      }
    }
    return results
  }

  function getEvaluationContext(fieldKey: string, recordId?: string): FormulaEvaluationContext | null {
    const config = formulaConfigs.value.find(c => c.fieldKey === fieldKey)
    if (!config) return null

    let recordFields: Record<string, unknown> | undefined
    if (recordId) {
      const record = recordStore.getRecordById(recordId)
      recordFields = record?.fields
    }

    const result = recordFields
      ? evaluateFormula(fieldKey, recordFields)
      : {
          value: null,
          success: false,
          errorType: 'missing_dependency' as const,
          errorMessage: '未提供记录上下文',
          dependencySnapshot: {},
        }

    return {
      fieldKey,
      expression: config.expression,
      dependencies: config.dependencies,
      dependencyValues: result.dependencySnapshot,
      result,
    }
  }

  return {
    formulaConfigs,
    hasCycleError,
    checkCycle,
    getFieldDependencies,
    getDependentFields,
    evaluateFormula,
    evaluateAllFormulas,
    getEvaluationContext,
  }
}

function topologicalSort(configs: FormulaFieldConfig[]): FormulaFieldConfig[] {
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const result: FormulaFieldConfig[] = []
  const configMap = new Map(configs.map(c => [c.fieldKey, c]))

  function visit(fieldKey: string): void {
    if (visited.has(fieldKey)) return
    if (inStack.has(fieldKey)) return

    inStack.add(fieldKey)
    const config = configMap.get(fieldKey)
    if (config) {
      const depConfigs = config.dependencies
        .map(d => configMap.get(d))
        .filter((d): d is FormulaFieldConfig => d !== undefined)

      for (const dep of depConfigs) {
        visit(dep.fieldKey)
      }
    }
    inStack.delete(fieldKey)
    visited.add(fieldKey)
    if (config) {
      result.push(config)
    }
  }

  for (const cfg of configs) {
    visit(cfg.fieldKey)
  }

  return result
}
