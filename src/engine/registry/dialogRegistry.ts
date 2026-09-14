import type { Component } from 'vue'

/**
 * 弹窗类型注册表(docs/19 批次 B4)。
 *
 * 引擎内置 7 种弹窗(quick-create / column-settings / formula-detail /
 * dynamic-max-confirm / version-conflict / confirm / alert);宿主可经
 * registerDialog 注册自定义弹窗类型,经 uiState.openDialog(type) 打开,
 * GlobalDialogHost 优先查注册表、未命中回退内置渲染。
 */

export const BUILTIN_DIALOG_TYPES = [
  'quick-create',
  'column-settings',
  'formula-detail',
  'dynamic-max-confirm',
  'version-conflict',
  'confirm',
  'alert',
] as const

export type BuiltinDialogType = (typeof BUILTIN_DIALOG_TYPES)[number]

/** 内置类型保持自动补全;自定义类型以 string 传入 */
export type ExtendedDialogType = BuiltinDialogType | (string & {})

const registry = new Map<string, Component>()

/** 注册自定义弹窗组件;type 为空或与内置类型冲突时抛错,重复注册覆盖并告警 */
export function registerDialog(type: string, component: Component): void {
  if (!type || type.trim() === '') {
    throw new Error('[schemagine] registerDialog: 弹窗类型名不能为空')
  }
  if ((BUILTIN_DIALOG_TYPES as readonly string[]).includes(type)) {
    throw new Error(`[schemagine] registerDialog: 不允许覆盖内置弹窗类型 "${type}"`)
  }
  if (registry.has(type)) {
    console.warn(`[schemagine] 弹窗类型 "${type}" 已注册,本次注册将覆盖先前定义`)
  }
  registry.set(type, component)
}

export function unregisterDialog(type: string): void {
  if ((BUILTIN_DIALOG_TYPES as readonly string[]).includes(type)) return
  registry.delete(type)
}

export function getDialogComponent(type: string): Component | undefined {
  return registry.get(type)
}
