#!/usr/bin/env node
// ============================================================
// 宿主解耦守卫：引擎源码不得出现任何宿主命名空间
// ------------------------------------------------------------
// Schemagine 是通用引擎，样式与业务都必须与宿主（如惠报后台）彻底解耦：
//   · 样式边界  = --sg-* token（docs/15），引擎内部类名不是公共 API；
//   · 业务边界  = 六服务注入 + 注册表 + 事件上抛（docs/17 §1.7）；
//   · 引擎源码  = 禁止引用宿主类名/CSS 变量/业务模块码（含注释）。
// 违规即退出码 1，接入 pnpm lint / lint:check（CI lint job 生效）。
// ============================================================
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

// 禁词表：宿主样式命名空间（hb- 覆盖 .hb-*/--hb-*/$hb-* 一切形态）。
// 新宿主接入时若引入新的命名空间，在此登记即可全局拦截。
// 开源中立红线（rules 包）：宿主标记/表前缀/公司名一律禁止出现在引擎源码中。
const BANNED_PATTERNS = [
  { pattern: /hb-/g, reason: '宿主样式命名空间（hb-* / --hb-* / $hb-*）' },
  { pattern: /\bxr-|xrerp|jy_/gi, reason: '宿主标记/表前缀（开源中立红线）' },
  { pattern: /心睿|xinrui/i, reason: '宿主公司名（开源中立红线）' },
]

const EXTENSIONS = new Set(['.vue', '.ts', '.tsx', '.scss', '.css', '.mjs'])
const SKIP_DIRS = new Set(['__tests__fixtures', 'node_modules'])

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* walk(full)
    } else if (EXTENSIONS.has(name.slice(name.lastIndexOf('.')))) {
      yield full
    }
  }
}

const violations = []
for (const file of walk(SRC)) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    for (const { pattern, reason } of BANNED_PATTERNS) {
      pattern.lastIndex = 0
      if (pattern.test(line)) {
        violations.push(
          `${relative(process.cwd(), file)}:${i + 1}  命中${reason}\n    ${line.trim()}`,
        )
      }
    }
  })
}

if (violations.length > 0) {
  console.error(`✗ 引擎源码发现宿主耦合（${violations.length} 处）——引擎与宿主必须彻底解耦：\n`)
  console.error(violations.join('\n'))
  console.error('\n修复指引：样式一律走 --sg-* token；宿主定制只能覆盖 --sg-* 或经组件 props/事件注入；')
  console.error('注释/文档亦不得引用具体宿主类名，用「宿主滚动容器」等通用契约表述（docs/17 §1.7）。')
  process.exit(1)
}

console.log('✓ 解耦守卫通过：引擎源码无宿主命名空间入侵')
