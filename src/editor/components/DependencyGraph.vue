<script setup lang="ts">
import { computed } from 'vue'
import { ElTag, ElTooltip, ElEmpty } from 'element-plus'
import type { ModuleSchema, FormulaFieldConfig } from '@/types'

const props = defineProps<{
  schema: ModuleSchema
}>()

const emit = defineEmits<{
  navigateToField: [payload: string]
}>()

const formulaConfigs = computed<FormulaFieldConfig[]>(() => {
  return props.schema.formulaConfig?.fields ?? []
})

const hasFormula = computed(() => formulaConfigs.value.length > 0)

const allInvolvedFields = computed(() => {
  const fieldKeys = new Set<string>()
  for (const cfg of formulaConfigs.value) {
    fieldKeys.add(cfg.fieldKey)
    for (const dep of cfg.dependencies) {
      fieldKeys.add(dep)
    }
  }
  return props.schema.fields.filter(f => fieldKeys.has(f.key))
})

const edgeList = computed(() => {
  const edges: { from: string; to: string }[] = []
  for (const cfg of formulaConfigs.value) {
    for (const dep of cfg.dependencies) {
      edges.push({ from: dep, to: cfg.fieldKey })
    }
  }
  return edges
})

const sortedNodes = computed(() => {
  return topologicalSort(formulaConfigs.value, props.schema.fields)
})

interface GraphNode {
  key: string
  label: string
  type: 'input' | 'formula' | 'both'
  level: number
}

const graphNodes = computed<GraphNode[]>(() => {
  const formulaKeys = new Set(formulaConfigs.value.map(c => c.fieldKey))
  const inputKeys = new Set<string>()
  for (const cfg of formulaConfigs.value) {
    for (const dep of cfg.dependencies) {
      inputKeys.add(dep)
    }
  }

  const nodes: GraphNode[] = []
  for (const field of allInvolvedFields.value) {
    const isFormula = formulaKeys.has(field.key)
    const isInput = inputKeys.has(field.key)
    nodes.push({
      key: field.key,
      label: field.label,
      type: isFormula && isInput ? 'both' : isFormula ? 'formula' : 'input',
      level: 0,
    })
  }

  const levelMap = new Map<string, number>()
  const configMap = new Map(formulaConfigs.value.map(c => [c.fieldKey, c]))
  function assignLevel(key: string, depth = 0): number {
    if (levelMap.has(key)) return levelMap.get(key)!
    const cfg = configMap.get(key)
    if (!cfg) {
      levelMap.set(key, 0)
      return 0
    }
    let maxDep = 0
    for (const dep of cfg.dependencies) {
      if (configMap.has(dep)) {
        maxDep = Math.max(maxDep, assignLevel(dep, depth + 1) + 1)
      }
    }
    levelMap.set(key, maxDep)
    return maxDep
  }
  for (const cfg of formulaConfigs.value) {
    assignLevel(cfg.fieldKey)
  }
  for (const node of nodes) {
    node.level = levelMap.get(node.key) ?? 0
  }

  return nodes
})

const maxLevel = computed(() => {
  return Math.max(0, ...graphNodes.value.map(n => n.level))
})

function getNodeColor(node: GraphNode): string {
  switch (node.type) {
    case 'input':
      return 'var(--sg-color-success)'
    case 'formula':
      return 'var(--sg-color-primary)'
    case 'both':
      return 'var(--sg-color-warning)'
    default:
      return 'var(--sg-color-info)'
  }
}

function handleNodeClick(fieldKey: string): void {
  emit('navigateToField', fieldKey)
}

function topologicalSort(configs: FormulaFieldConfig[], allFields: { key: string }[]): string[] {
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const result: string[] = []
  const configMap = new Map(configs.map(c => [c.fieldKey, c]))

  function visit(key: string): void {
    if (visited.has(key)) return
    if (inStack.has(key)) return
    inStack.add(key)
    const cfg = configMap.get(key)
    if (cfg) {
      for (const dep of cfg.dependencies) {
        if (configMap.has(dep)) {
          visit(dep)
        }
      }
    }
    inStack.delete(key)
    visited.add(key)
    result.push(key)
  }

  for (const cfg of configs) {
    visit(cfg.fieldKey)
  }

  const allKeys = allFields.filter(f => configMap.has(f.key)).map(f => f.key)
  for (const k of allKeys) {
    if (!visited.has(k)) {
      result.push(k)
    }
  }

  return result
}
</script>

<template>
  <div class="dependency-graph">
    <div v-if="!hasFormula" class="empty-graph">
      <ElEmpty description="当前 Schema 没有公式字段，无法展示依赖图" />
    </div>

    <template v-else>
      <div class="graph-toolbar">
        <h4>公式依赖图</h4>
        <div class="graph-legend">
          <span class="legend-item"><span class="legend-dot" style="background: var(--sg-color-success)" /> 输入字段</span>
          <span class="legend-item"><span class="legend-dot" style="background: var(--sg-color-primary)" /> 公式字段</span>
          <span class="legend-item"><span class="legend-dot" style="background: var(--sg-color-warning)" /> 输入+公式</span>
        </div>
        <span class="edge-count">共 {{ edgeList.length }} 条依赖</span>
      </div>

      <div class="graph-canvas">
        <div class="level-columns">
          <div v-for="level in maxLevel + 1" :key="level" class="level-column">
            <div class="level-label">层级 {{ level }}</div>
            <div
              v-for="node in graphNodes.filter(n => n.level === maxLevel - level)"
              :key="node.key"
              class="graph-node"
              :style="{ borderColor: getNodeColor(node) }"
              @click="handleNodeClick(node.key)"
            >
              <div class="node-label">{{ node.label }}</div>
              <div class="node-key">{{ node.key }}</div>
              <ElTag :color="getNodeColor(node)" size="small" effect="dark" class="node-type-tag">
                {{ node.type === 'input' ? '输入' : node.type === 'formula' ? '公式' : '混合' }}
              </ElTag>
            </div>
          </div>
        </div>
      </div>

      <div class="edge-list-section">
        <h4>依赖明细</h4>
        <div v-if="edgeList.length === 0" class="empty-hint">无依赖关系</div>
        <div v-for="(edge, i) in edgeList" :key="i" class="edge-item">
          <ElTooltip :content="`${props.schema.fields.find(f => f.key === edge.from)?.label || edge.from} → ${props.schema.fields.find(f => f.key === edge.to)?.label || edge.to}`" placement="top">
            <span>
              <span class="edge-from" @click="handleNodeClick(edge.from)">{{ edge.from }}</span>
              <span class="edge-arrow"> &rarr; </span>
              <span class="edge-to" @click="handleNodeClick(edge.to)">{{ edge.to }}</span>
            </span>
          </ElTooltip>
        </div>
      </div>

      <div class="order-section">
        <h4>公式计算顺序（拓扑排序）</h4>
        <div class="order-list">
          <ElTag
            v-for="(key, i) in sortedNodes"
            :key="key"
            size="default"
            type="info"
            effect="plain"
          >
            {{ i + 1 }}. {{ props.schema.fields.find(f => f.key === key)?.label || key }}
          </ElTag>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dependency-graph {
  max-width: 900px;
}
.empty-graph {
  padding: var(--sg-spacing-20) 0;
}
.graph-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sg-spacing-6);
  padding-bottom: var(--sg-spacing-6);
  border-bottom: 1px solid var(--sg-border-color-light);
  margin-bottom: var(--sg-spacing-8);
}
.graph-toolbar h4 {
  margin: 0;
  font-size: var(--sg-font-size-lg);
}
.graph-legend {
  display: flex;
  gap: var(--sg-spacing-6);
  font-size: var(--sg-font-size-base);
}
.legend-item {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-2);
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--sg-radius-circle);
  display: inline-block;
}
.edge-count {
  color: var(--sg-text-color-secondary);
  font-size: var(--sg-font-size-base);
}
.graph-canvas {
  padding: var(--sg-spacing-8) 0;
  overflow-x: auto;
}
.level-columns {
  display: flex;
  gap: var(--sg-spacing-12);
  min-height: 200px;
}
.level-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-4);
  align-items: center;
}
.level-label {
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: var(--sg-spacing-4);
}
.graph-node {
  width: 140px;
  padding: var(--sg-spacing-4) var(--sg-spacing-6);
  border: 2px solid;
  border-radius: var(--sg-radius-xl);
  cursor: pointer;
  background: var(--sg-bg-color);
  text-align: center;
  transition: box-shadow var(--sg-duration-normal);
}
.graph-node:hover {
  box-shadow: var(--sg-shadow-lg);
}
.node-label {
  font-size: var(--sg-font-size-md);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-key {
  font-size: var(--sg-font-size-sm);
  color: var(--sg-text-color-secondary);
  margin: var(--sg-spacing-1) 0 var(--sg-spacing-2);
}
.node-type-tag {
  font-size: var(--sg-font-size-xs);
}
.edge-list-section {
  margin-top: var(--sg-spacing-8);
  padding-top: var(--sg-spacing-6);
  border-top: 1px solid var(--sg-border-color-light);
}
.edge-list-section h4 {
  margin: 0 0 var(--sg-spacing-4) 0;
  font-size: var(--sg-font-size-lg);
}
.edge-item {
  padding: var(--sg-spacing-2) 0;
  font-size: var(--sg-font-size-md);
}
.edge-from {
  color: var(--sg-color-primary);
  cursor: pointer;
  font-weight: 500;
}
.edge-from:hover {
  text-decoration: underline;
}
.edge-arrow {
  color: var(--sg-text-color-secondary);
}
.edge-to {
  color: var(--sg-color-warning);
  cursor: pointer;
  font-weight: 500;
}
.edge-to:hover {
  text-decoration: underline;
}
.order-section {
  margin-top: var(--sg-spacing-8);
  padding-top: var(--sg-spacing-6);
  border-top: 1px solid var(--sg-border-color-light);
}
.order-section h4 {
  margin: 0 0 var(--sg-spacing-6) 0;
  font-size: var(--sg-font-size-lg);
}
.order-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sg-spacing-3);
}
.empty-hint {
  color: var(--sg-text-color-secondary);
  font-size: var(--sg-font-size-md);
}
</style>
