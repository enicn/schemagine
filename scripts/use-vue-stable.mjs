#!/usr/bin/env node
// docs/23 M2:stable Vue 双基线工具。
// 开发基线把 vue/@vue/* 全家 overrides 钉在 'beta'(pnpm-workspace.yaml),而交付 peer 是 ^3.5.0——
// 本脚本移除 overrides 段,让依赖按 devDependencies 的 ^3.5.x 解析(与宿主安装形态一致),
// 供 CI stable-vue job 与本地复验使用。仓库默认态仍是 beta;还原:git checkout pnpm-workspace.yaml && pnpm install。
import { readFileSync, writeFileSync } from 'node:fs'

const file = new URL('../pnpm-workspace.yaml', import.meta.url)
let text = readFileSync(file, 'utf8')

if (!/^overrides:/m.test(text)) {
  console.log('[use-vue-stable] overrides 段不存在,无需处理')
  process.exit(0)
}

// 删除 overrides: 块(到下一个顶层键为止)
text = text.replace(/^overrides:\n(?:[ \t]+.*\n)+/m, '')
writeFileSync(file, text)
console.log('[use-vue-stable] 已移除 pnpm-workspace.yaml overrides(vue beta→^3.5),请重新 pnpm install --no-frozen-lockfile')
