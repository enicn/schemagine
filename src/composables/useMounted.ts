import { ref, onMounted, onUnmounted, type ComponentInternalInstance } from 'vue'

export function useMounted(): { isMounted: Readonly<ReturnType<typeof ref<boolean>>> } {
  const isMounted = ref(false)

  onMounted(() => {
    isMounted.value = true
  })

  onUnmounted(() => {
    isMounted.value = false
  })

  return { isMounted: isMounted as Readonly<typeof isMounted> }
}

export function checkMounted(instance: ComponentInternalInstance | null): boolean {
  return !!(instance && instance.isMounted)
}
