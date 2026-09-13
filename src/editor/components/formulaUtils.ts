import type { FormulaFieldConfig } from '@/types'

export function detectCycle(
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

export function topologicalSort(configs: FormulaFieldConfig[]): FormulaFieldConfig[] {
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
