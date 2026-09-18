import { ref, onMounted, onUnmounted, type Ref } from 'vue'

/**
 * 移动端视口判定（管理后台移动端适配，docs/设计 §3.2）：
 * matchMedia max-width:767.98px 封装，返回响应式 isMobile。由引擎导出、宿主复用，
 * 断点单一真相源；CSS 层面的样式适配一律媒体查询，本断点只用于形态切换类逻辑分支。
 *
 * jsdom/SSR 等无 matchMedia 环境安全降级为 false（桌面形态），不抛错。
 */
export const MOBILE_MEDIA_QUERY = '(max-width: 767.98px)'

export function useViewportMode(): { isMobile: Ref<boolean> } {
  const isMobile = ref(
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(MOBILE_MEDIA_QUERY).matches
      : false,
  )

  let mql: MediaQueryList | null = null
  const handleChange = (e: MediaQueryListEvent): void => {
    isMobile.value = e.matches
  }

  onMounted(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    mql = window.matchMedia(MOBILE_MEDIA_QUERY)
    isMobile.value = mql.matches
    mql.addEventListener('change', handleChange)
  })

  onUnmounted(() => {
    mql?.removeEventListener('change', handleChange)
    mql = null
  })

  return { isMobile }
}
