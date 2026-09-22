/**
 * Schemagine Rules — shared types.
 *
 * The rules package is framework-free and dependency-free: it never imports
 * vue/mathjs/element-plus. Expression evaluation (`evaluate`) and expression
 * syntax checking (`parse`) are injected by the host (engine side typically
 * mathjs, spreadsheet hosts may inject a bignumber-based evaluator).
 */

// ---------------------------------------------------------------- condition

/** Operand reference: literal value, a path into the current record, or a path into globals. */
export type ConditionValueRef = { value: unknown } | { record: string } | { global: string }

export type ConditionOperator =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'notIn'
  | 'contains' | 'startsWith' | 'endsWith'
  | 'isEmpty' | 'notEmpty'
  | 'exists' | 'notExists'

/** Object-form atomic condition (engine `visibleWhen` dialect). */
export interface AtomicCondition {
  left: ConditionValueRef
  operator: ConditionOperator
  right?: ConditionValueRef
}

export interface GroupCondition {
  and?: Condition[]
  or?: Condition[]
  not?: Condition
}

export type Condition = AtomicCondition | GroupCondition

/**
 * Triplet form: `[fieldPath, operator, operand?]` — operand is a literal or a
 * ConditionValueRef; unary operators (isEmpty/notEmpty/exists/...) omit it.
 */
export type TripletCondition = [string, ConditionOperator, unknown?]

/** Union accepted by `evalCondition`: object form, triplet form, or an expression string. */
export type AnyCondition = Condition | TripletCondition | string

// ---------------------------------------------------------------- rules (8 kinds)

export interface ConditionRule {
  type: 'condition'
  id?: string
  when: AnyCondition
}

/**
 * Ordered compute chain. Rules run in declaration order; a rule may reference
 * targets declared before it. `scope: 'aggregate'` marks rules evaluated by the
 * engine aggregation pipeline instead of the record-level compute chain.
 */
export interface ComputeRule {
  type: 'compute'
  id?: string
  target: string
  watch: string[]
  expr: string
  /** Emit FORCE (write even into readonly/disabled fields) instead of SET. */
  force?: boolean
  scope?: 'record' | 'aggregate'
}

/** Field mapping, e.g. on pick: source record field -> target record field. */
export interface MapRule {
  type: 'map'
  id?: string
  /** Trigger scene; defaults to 'pick'. */
  on?: string
  /** sourceField -> targetField. */
  from: Record<string, string>
}

/** Historical/backfill lookup. Search supports `{{expr}}` interpolation. */
export interface LookupRule {
  type: 'lookup'
  id?: string
  /** Host-interpreted descriptor (api endpoint or local source id). */
  api?: unknown
  source?: unknown
  /** Search template, e.g. `{{name}}`. */
  search?: string
  /** Default field keys copied from the matched source record. */
  keys?: string[]
  /** Record path holding an overriding key list; falls back to `keys`. */
  keysFrom?: string
  limit?: number
  sort?: unknown
}

export interface ValidateRule {
  type: 'validate'
  id?: string
  when: AnyCondition
  message: string
  /** When present: coerce the field to this value instead of blocking. */
  force?: unknown
}

export interface ActionAct {
  /** Host-interpreted api descriptor (see host action dictionary). */
  invoke?: unknown
  /** Host-interpreted view reference (host renders its own popup/float). */
  open?: unknown
  /** Host-interpreted navigation target. */
  navigate?: unknown
  /** Request body / params passed to invoke/open. Strings support `{{expr}}`. */
  params?: unknown
  body?: unknown
  /** How the host applies a successful response (host semantics, passed through). */
  apply?: unknown
  /** Success toast template. */
  toast?: string
  /** Confirmation gate before execution; string or `{ message }`. */
  confirm?: string | { message: string }
}

export interface ActionRule {
  type: 'action'
  id?: string
  label?: string
  when?: AnyCondition
  act: ActionAct
}

export interface StyleRule {
  type: 'style'
  id?: string
  when: AnyCondition
  rowClass?: string
  cellClass?: string
  oddClass?: string
}

export interface AggregateRule {
  type: 'aggregate'
  id?: string
  key: string
  expr: string
}

export type Rule =
  | ConditionRule
  | ComputeRule
  | MapRule
  | LookupRule
  | ValidateRule
  | ActionRule
  | StyleRule
  | AggregateRule

export type RuleType = Rule['type']

// ---------------------------------------------------------------- flow

/**
 * Flow step four elements: `action` / `params` / `when` / `as`.
 * `action` is either a dictionary action name or `{ flow: name }` for a sub-flow
 * (recursion is guarded: depth <= 8, cycle detection, kind whitelist).
 */
export interface FlowStep {
  action: string | { flow: string }
  params?: unknown
  when?: AnyCondition
  /** Mount the step result into the flow scope under this name. */
  as?: string
}

export interface FlowDef {
  name: string
  steps: FlowStep[]
}

// ---------------------------------------------------------------- action dictionary contract

export type ActionKind = 'frontend' | 'api' | 'composite'

/** Named action contract stored in the host action dictionary. */
export interface ActionContract {
  name: string
  title?: string
  kind: ActionKind
  params?: unknown
  result?: unknown
  /** impl binding name (frontend/api) or flow name (composite). */
  impl?: string
  flow?: string
}

/** Host function dictionary signature entry: the library only sees the signature. */
export interface FunctionSignature {
  params?: string[]
  returns?: string
  description?: string
}

export interface Dictionary {
  functions?: Record<string, FunctionSignature>
  actions?: Record<string, ActionContract>
}

// ---------------------------------------------------------------- context & effects

/** Evaluation context supplied by the host. The library never fetches data itself. */
export interface EvalContext {
  record: Record<string, unknown>
  form?: Record<string, unknown>
  /** Aggregate scope / sibling row set, host-defined. */
  scope?: unknown
  $new?: unknown
  $old?: unknown
  scene?: string
  /** Resolve a function from the merged (built-in + host) function table. */
  getFn?: (name: string) => unknown
}

export const Effect = {
  SET: 'set',
  FORCE: 'force',
  ERROR: 'error',
  INVOKE: 'invoke',
  REFRESH: 'refresh',
  TOAST: 'toast',
  CONFIRM: 'confirm',
  CHOOSE: 'choose',
  OPEN: 'open',
  NAVIGATE: 'navigate',
  CUSTOM: 'custom',
} as const

export type EffectType = (typeof Effect)[keyof typeof Effect]

/** Effect descriptor: the library plans, the host interprets and executes. */
export interface RuleEffect {
  type: EffectType
  /** Target field key for SET/FORCE. */
  target?: string
  value?: unknown
  message?: string
  /** Host-interpreted payload (api descriptor / viewRef / params / apply semantics). */
  [key: string]: unknown
}

// ---------------------------------------------------------------- compiled module

export interface CompileWarning {
  path: string
  code: string
  message: string
}

export interface CompiledModule {
  /** Declaration order preserved within each group. */
  moduleRules: Rule[]
  fieldRules: Map<string, Rule[]>
  computes: ComputeRule[]
  validates: ValidateRule[]
  actions: ActionRule[]
  conditions: ConditionRule[]
  maps: MapRule[]
  lookups: LookupRule[]
  styles: StyleRule[]
  aggregates: AggregateRule[]
  warnings: CompileWarning[]
}

/** Schema shape consumed by `compileModule` (host builds map page_settings onto this). */
export interface RulesModuleSchema {
  rules?: Rule[]
  fields?: Array<{ key?: string; rules?: Rule[] }>
  flows?: FlowDef[]
}

// ---------------------------------------------------------------- runtime options & validators

export interface RuntimeOptions {
  /**
   * Expression evaluator, e.g. `mathjs/number`'s `evaluate`.
   * Required only for expression strings, compute/aggregate `expr`, and `{{}}`
   * interpolation beyond plain paths.
   */
  evaluate?: (expr: string, scope?: Record<string, unknown>) => unknown
  /** Expression syntax checker, e.g. `mathjs.parse`. Errors become compile warnings. */
  parse?: (expr: string) => unknown
  /** Host function implementations (qty/flag/set/allow/...). Built-ins are always present. */
  functions?: Record<string, unknown>
  /** Named flows available to step recursion. */
  flows?: Record<string, FlowDef>
  /** Action dictionary used for kind whitelist checks during flow execution. */
  actions?: Record<string, ActionContract>
}

export interface ValidationIssue {
  path: string
  code: string
  message: string
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

export interface FlowExecutorResult {
  /** Flow scope: `as`-mounted step results by name. */
  scope: Record<string, unknown>
}
