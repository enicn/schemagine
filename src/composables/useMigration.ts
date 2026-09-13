import type { ModuleSchema } from '@/types'

export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function runSchemaMigrations(
  schema: ModuleSchema,
  storedVersion: string,
): void {
  if (!schema.migrations || schema.migrations.length === 0) return

  const applicable = schema.migrations
    .sort((a, b) => compareVersions(a.fromVersion, b.fromVersion))
    .filter(m => compareVersions(m.fromVersion, storedVersion) >= 0)

  if (applicable.length === 0) return

  console.log(
    `[SchemaMigration] ${schema.id}: 执行 ${applicable.length} 步迁移 ` +
    `(${storedVersion} → ${schema.version})`
  )

  for (const migration of applicable) {
    try {
      console.log(`[SchemaMigration]   ${migration.fromVersion} → ${migration.toVersion}`)
    } catch (err) {
      console.error(
        `[SchemaMigration] ${schema.id} 迁移 ${migration.fromVersion}→${migration.toVersion} 失败:`,
        err
      )
      throw err
    }
  }
}
