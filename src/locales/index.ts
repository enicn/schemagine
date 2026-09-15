/**
 * 引擎 i18n（docs/19 批次 G1）：极轻量文案层——注册制语言包 + 点路径 t()。
 *
 * 设计约束：
 *  - 零依赖、无按需加载：内置 zh-CN（基准包），宿主经 registerLocale 注入其他语言；
 *  - 响应式：t 读取内部 locale ref，模板/computed 中使用时切换语言即重渲染；
 *  - 插值：`{name}` 占位符，t('key', { name: 'x' })；
 *  - 容错：key 缺失回退基准包，仍缺失返回 key 本身（开发期可见、不炸）；
 *  - 切换：setLocale 未注册的语言回退 zh-CN 并告警（引擎层不做异步加载）。
 */
import { ref } from 'vue'
import zhCN from './zh-CN'

export type MessageSchema = Record<string, unknown>

const BASE_LOCALE = 'zh-CN'

const locales: Record<string, MessageSchema> = {
  [BASE_LOCALE]: zhCN as MessageSchema,
}

/** 当前语言（响应式：模板/computed 中经 t() 建立依赖） */
export const i18nLocale = ref<string>(BASE_LOCALE)

/** 注册语言包（同结构 key 覆盖基准包；重复注册整体替换） */
export function registerLocale(name: string, messages: MessageSchema): void {
  locales[name] = messages
}

/** 切换当前语言；未注册的语言回退基准包 */
export function setLocale(name: string): void {
  if (!locales[name]) {
    console.warn(`[schemagine] locale "${name}" 未注册，回退 ${BASE_LOCALE}（先经 registerLocale 注入语言包）`)
    return
  }
  i18nLocale.value = name
}

export function getLocale(): string {
  return i18nLocale.value
}

/** 点路径取值：'a.b.c' → pack.a?.b?.c */
function resolve(pack: MessageSchema | undefined, key: string): string | undefined {
  if (!pack) return undefined
  let node: unknown = pack
  for (const seg of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined
    node = (node as MessageSchema)[seg]
  }
  return typeof node === 'string' ? node : undefined
}

/**
 * 取文案：点路径 key + `{name}` 插值。
 * 当前包缺失回退基准包，仍缺失返回 key 本身。
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const raw = resolve(locales[i18nLocale.value], key) ?? resolve(locales[BASE_LOCALE], key) ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => (params[name] != null ? String(params[name]) : match))
}
