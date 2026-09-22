import { computed, inject, provide, type ComputedRef, type InjectionKey } from 'vue'
import { createRuntime, type CompiledModule, type RuleEffect, type RulesRuntime } from '@/rules'
// mathjs/number 是引擎公式（useFormula）的同源求值器：规则表达式与公式字段共用一套数值语义
import { evaluate, parse } from 'mathjs/number'
import { useSchemaMeta, type SchemaMetaState } from './instanceState'
import type { FieldSchema } from '@/types'

/**
 * 声明式规则状态（rules 包）：从 schema 的模块级/字段级 rules 位编译规则模块，
 * 提供行内编辑 compute 写回、validate 校验、rowAction 动作规划、labelWhen 文案
 * 解析与 aggregate 统计求值。Effect 一律交宿主执行器（SchemaEngine.rulesExecutor）。
 */
export interface RulesState {
  runtime: RulesRuntime
  /** null = 当前 schema 未声明任何规则（零开销直通） */
  compiled: ComputedRef<CompiledModule | null>
  hasRules: ComputedRef<boolean>
  /** watch 触发的 compute 链写回：effects 携带 oldValue，已同步写入 row */
  applyComputes: (row: Record<string, unknown>, changedKey?: string) => RuleEffect[]
  validateCell: (
    row: Record<string, unknown>,
    key: string,
    $new: unknown,
    $old: unknown,
  ) => { ok: boolean; message?: string; force?: unknown }
  planRowAction: (field: FieldSchema, row: Record<string, unknown>) => RuleEffect[]
  /** labelWhen 声明序首个命中文案；未配置或不命中返回 null（调用方回落默认 label） */
  resolveRowActionLabel: (field: FieldSchema, row: Record<string, unknown>) => string | null
  /** aggregate 规则求值：列值数组入作用域（sum/count/min/max 等内置直接消费） */
  runAggregates: (records: ReadonlyArray<unknown>) => Array<{ key: string; value: unknown }>
  takeWarnings: () => Array<{ path: string; code: string; message: string }>
}

export const RULES_STATE_KEY = Symbol('rulesState') as InjectionKey<RulesState>

export function createRulesState(schemaMetaParam?: SchemaMetaState): RulesState {
  const schemaMeta = schemaMetaParam ?? useSchemaMeta()
  const runtime = createRuntime({ evaluate, parse })

  const compiled = computed<CompiledModule | null>(() => {
    const schema = schemaMeta.schema
    if (!schema) return null
    const moduleRules = schema.rules ?? []
    const fieldRules = schema.fields
      .filter(f => f.rules !== undefined && f.rules.length > 0)
      .map(f => ({ key: f.key, rules: f.rules ?? [] }))
    if (moduleRules.length === 0 && fieldRules.length === 0) return null
    return runtime.compileModule({ rules: moduleRules, fields: fieldRules })
  })

  const hasRules = computed(() => compiled.value !== null)

  function applyComputes(row: Record<string, unknown>, changedKey?: string): RuleEffect[] {
    const c = compiled.value
    if (!c || c.computes.length === 0) return []
    const effects = runtime.runComputes(c, { record: row }, changedKey)
    for (const effect of effects) {
      if ((effect.type === 'set' || effect.type === 'force') && typeof effect.target === 'string') {
        effect.oldValue = row[effect.target]
        row[effect.target] = effect.value
      }
    }
    return effects
  }

  function validateCell(
    row: Record<string, unknown>,
    key: string,
    $new: unknown,
    $old: unknown,
  ): { ok: boolean; message?: string; force?: unknown } {
    const c = compiled.value
    if (!c || c.validates.length === 0) return { ok: true }
    return runtime.runValidates(c, { record: row }, key, $new, $old)
  }

  function planRowAction(field: FieldSchema, row: Record<string, unknown>): RuleEffect[] {
    const act = field.rowAction?.action
    if (!act) return []
    return runtime.planAction(
      { type: 'action', label: field.rowAction?.label ?? field.label, act },
      { record: row },
    )
  }

  function resolveRowActionLabel(field: FieldSchema, row: Record<string, unknown>): string | null {
    const labelWhen = field.rowAction?.labelWhen
    if (!labelWhen || labelWhen.length === 0) return null
    for (const item of labelWhen) {
      if (runtime.evalCondition(item.when, { record: row })) return item.label
    }
    return null
  }

  function runAggregates(records: ReadonlyArray<unknown>): Array<{ key: string; value: unknown }> {
    const c = compiled.value
    if (!c || c.aggregates.length === 0) return []
    // 列值数组入作用域：record 形态兼容 RecordEntity（.fields）与平铺行
    const scope: Record<string, unknown> = { $count: records.length }
    for (const record of records) {
      const fields = ((record as { fields?: Record<string, unknown> }).fields ?? record) as Record<string, unknown>
      for (const [key, value] of Object.entries(fields)) {
        if (key.startsWith('$')) continue
        const list = scope[key]
        if (Array.isArray(list)) list.push(value)
        else scope[key] = [value]
      }
    }
    const out: Array<{ key: string; value: unknown }> = []
    for (const rule of c.aggregates) {
      try {
        out.push({ key: rule.key, value: evaluate(rule.expr, scope) })
      } catch {
        out.push({ key: rule.key, value: null })
      }
    }
    return out
  }

  return {
    runtime,
    compiled,
    hasRules,
    applyComputes,
    validateCell,
    planRowAction,
    resolveRowActionLabel,
    runAggregates,
    takeWarnings: () => runtime.takeWarnings(),
  }
}

export function provideRules(state: RulesState): void {
  provide(RULES_STATE_KEY, state)
}

/** 宽松注入：引擎树外独立使用（单测/宿主裸挂组件）返回 null，规则功能静默关闭 */
export function useRules(): RulesState | null {
  return inject(RULES_STATE_KEY, null)
}
