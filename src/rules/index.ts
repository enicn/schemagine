/**
 * Schemagine Rules — public surface.
 *
 * Framework-free, dependency-free. The host injects the expression evaluator
 * (`evaluate`, e.g. mathjs), an optional syntax checker (`parse`), its function
 * implementations (`functions`), named flows and the action dictionary.
 * The library plans; the host executes (see Effect descriptors).
 */
export { Effect } from './types'
export { FlowError, FLOW_KIND_WHITELIST, MAX_FLOW_DEPTH, createRuntime } from './runtime'
export type { FlowExecutor, RulesRuntime } from './runtime'
export { compileModule } from './compile'
export { evalCondition, compareValues, getPathValue } from './condition'
export { interpolate, interpolateDeep, resolveLookupKeys } from './interpolate'
export { BUILT_IN_FUNCTIONS, mergeFunctions } from './functions'
export { validateDictionary, validateFlow, validateRuleList, validateRules } from './validate'

export type {
  ActionAct,
  ActionContract,
  ActionKind,
  ActionRule,
  AggregateRule,
  AnyCondition,
  AtomicCondition,
  CompiledModule,
  CompileWarning,
  Condition,
  ConditionOperator,
  ConditionRule,
  ConditionValueRef,
  Dictionary,
  EffectType,
  EvalContext,
  FlowDef,
  FlowStep,
  FunctionSignature,
  GroupCondition,
  LookupRule,
  MapRule,
  Rule,
  RuleEffect,
  RuleType,
  RulesModuleSchema,
  RuntimeOptions,
  StyleRule,
  TripletCondition,
  ValidateRule,
  ValidationIssue,
  ValidationResult,
} from './types'
