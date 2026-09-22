/**
 * Built-in functions: generic math/time/collection only. Business functions
 * (sys/perm/qty/flag/...) are host-registered through the function dictionary —
 * the library only ever sees signatures, never semantics.
 */

export type BuiltinFunction = (...args: never[]) => unknown

function toNumberList(args: unknown[]): number[] {
  const list: number[] = []
  for (const arg of args) {
    if (Array.isArray(arg)) {
      for (const item of arg) {
        const n = Number(item)
        if (!Number.isNaN(n)) list.push(n)
      }
    } else {
      const n = Number(arg)
      if (!Number.isNaN(n)) list.push(n)
    }
  }
  return list
}

export const BUILT_IN_FUNCTIONS: Record<string, unknown> = {
  /** Current timestamp in milliseconds. */
  now: (): number => Date.now(),
  /** Sum of numbers; accepts arrays and/or bare numbers. */
  sum: (...args: unknown[]): number => toNumberList(args).reduce((a, b) => a + b, 0),
  /** Count of items; accepts an array or varargs. */
  count: (...args: unknown[]): number => {
    if (args.length === 1 && Array.isArray(args[0])) return (args[0] as unknown[]).length
    return args.length
  },
  min: (...args: unknown[]): number => {
    const list = toNumberList(args)
    return list.length === 0 ? NaN : Math.min(...list)
  },
  max: (...args: unknown[]): number => {
    const list = toNumberList(args)
    return list.length === 0 ? NaN : Math.max(...list)
  },
  abs: (x: unknown): number => Math.abs(Number(x)),
  /** Ceil to `d` decimals: `ceilTo(10 / 3, 2)` -> 3.34. */
  ceilTo: (x: unknown, d: unknown = 0): number => {
    const f = Math.pow(10, Number(d) || 0)
    return Math.ceil(Number(x) * f) / f
  },
  /** Round to `d` decimals: `roundTo(10 / 3, 2)` -> 3.33. */
  roundTo: (x: unknown, d: unknown = 0): number => {
    const f = Math.pow(10, Number(d) || 0)
    return Math.round(Number(x) * f) / f
  },
}

export function mergeFunctions(hostFunctions?: Record<string, unknown>): Record<string, unknown> {
  // Host entries override same-named built-ins; spreading undefined is a no-op.
  return { ...BUILT_IN_FUNCTIONS, ...hostFunctions }
}
