/**
 * 行内编辑（docs/19 批次 F 前置拆分）：从 VxeTableWrapper 抽出双击进入
 * 编辑态的全部状态机——编辑会话、各字段类型编辑器取值/校验、fk 下拉与
 * 快速新建、mediaImage 媒体选择/上传，以及编辑器滚动入视口/焦点管理。
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { Ref } from 'vue'
import type { Component } from 'vue'
import { mediaService } from '@/services/api/mediaService'
import { getFieldTypeDefinition } from '@/engine/registry/fieldTypeRegistry'
import { validateFieldValue, validateRecordRow } from '@/utils/fieldValidation'
import { t } from '@/locales'
import type { CandidateOption, RowValidationRule } from '@/types'
import type { WrapperColumn } from './wrapperTypes'
import type { useFkOptions } from './useFkOptions'

export interface InlineEditEmit {
  (e: 'edit-activated', payload: { row: Record<string, unknown>; column: WrapperColumn; rowIndex: number }): void
  (e: 'edit-closed', payload: { row: Record<string, unknown>; column: WrapperColumn; value: unknown }): void
  (e: 'inline-edit', payload: { row: Record<string, unknown>; field: string; value: unknown; oldValue: unknown }): void
}

export interface InlineEditDeps {
  rowKey: () => string
  visibleColumns: () => WrapperColumn[]
  wrapperRef: Ref<HTMLDivElement | null>
  fk: ReturnType<typeof useFkOptions>
  /** 行级校验规则（docs/19 H1）：确认前以整行为上下文求值 */
  rowValidationRules: () => RowValidationRule[] | undefined
}

export function useInlineEdit(
  emit: InlineEditEmit,
  deps: InlineEditDeps,
) {
  const editingRowId = ref<string | null>(null)
  const editingField = ref<string | null>(null)
  const editValue = ref<unknown>('')
  /** 当前编辑会话上下文（B5：edit-closed 事件需要 row/column，Esc 取消路径无入参，从这里取） */
  const activeEditRow = ref<Record<string, unknown> | null>(null)
  const activeEditCol = ref<WrapperColumn | null>(null)
  const fkOptions = ref<CandidateOption[]>([])
  const fkLoading = ref(false)
  const fkSearchText = ref('')
  const fkDropdownOpen = ref(false)
  let fkTargetModule = ''

  // fk 快速新建（col.quickCreate）：弹窗创建成功后把新记录置顶候选并自动选中，待用户确认落库
  const fkQuickCreateVisible = ref(false)
  const editingCol = computed(() => deps.visibleColumns().find(c => c.field === editingField.value))

  function openFkQuickCreate(): void {
    fkQuickCreateVisible.value = true
  }

  function handleFkQuickCreated(payload: { id: string; label: string; value: string }): void {
    fkQuickCreateVisible.value = false
    const opt: CandidateOption = { value: payload.value, label: payload.label }
    fkOptions.value = [opt, ...fkOptions.value.filter(o => o.value !== payload.value)]
    if (fkTargetModule) {
      deps.fk.prependCacheOptions(fkTargetModule, fkOptions.value)
    }
    editValue.value = payload.value
  }

  const fkFilteredOptions = computed(() => {
    const search = fkSearchText.value.toLowerCase().trim()
    if (!search) return fkOptions.value
    return fkOptions.value.filter(o => o.label.toLowerCase().includes(search))
  })

  function isEditing(rowId: unknown, field: string): boolean {
    return editingRowId.value === rowId && editingField.value === field
  }

  const EDIT_SCROLL_PADDING = 8

  function ensureInlineEditorInView(): void {
    const root = deps.wrapperRef.value
    if (!root) return

    const debugEnabled = typeof window !== 'undefined' && (
      (window as unknown as { __SCHEMAGINE_VXE_DEBUG__?: boolean }).__SCHEMAGINE_VXE_DEBUG__ === true
      || window.localStorage?.getItem('SCHEMAGINE_VXE_DEBUG') === '1'
    )

    const editingCell = root.querySelector('.vxe-body--column.is-editing-cell') as HTMLElement | null
    if (!editingCell) return

    const bodyWrapper = (editingCell.closest('.vxe-table--body-wrapper') as HTMLElement | null)
      || (root.querySelector('.vxe-table--body-wrapper') as HTMLElement | null)
    if (!bodyWrapper) return

    const editor = editingCell.querySelector('.edit-inline') as HTMLElement | null
    if (!editor) return

    const dropdown = editingCell.querySelector('.fk-edit-dropdown') as HTMLElement | null
    const target = dropdown || editor

    const bodyRect = bodyWrapper.getBoundingClientRect()
    const horizontalScrollbarHeight = Math.max(0, bodyWrapper.offsetHeight - bodyWrapper.clientHeight)
    const targetRect = target.getBoundingClientRect()
    const topLimit = bodyRect.top + EDIT_SCROLL_PADDING
    const bottomLimit = bodyRect.bottom - EDIT_SCROLL_PADDING - horizontalScrollbarHeight

    if (targetRect.bottom > bottomLimit) {
      const delta = targetRect.bottom - bottomLimit
      const prevScrollTop = bodyWrapper.scrollTop
      bodyWrapper.scrollTop += delta
      const canScroll = bodyWrapper.scrollHeight > bodyWrapper.clientHeight + 1
      const didScroll = bodyWrapper.scrollTop !== prevScrollTop
      const flipY = !canScroll || !didScroll
      editingCell.classList.toggle('vxe-inline-flip-y', flipY)
      if (debugEnabled) {
        console.log('[VxeTableWrapper] ensureInlineEditorInView: scroll down', {
          delta,
          prevScrollTop,
          scrollTop: bodyWrapper.scrollTop,
          clientHeight: bodyWrapper.clientHeight,
          offsetHeight: bodyWrapper.offsetHeight,
          scrollHeight: bodyWrapper.scrollHeight,
          horizontalScrollbarHeight,
          canScroll,
          didScroll,
          flipY,
          bodyRect: { top: bodyRect.top, bottom: bodyRect.bottom, height: bodyRect.height },
          targetRect: { top: targetRect.top, bottom: targetRect.bottom, height: targetRect.height },
          topLimit,
          bottomLimit,
        })
      }
    }
    if (targetRect.top < topLimit) {
      const delta = topLimit - targetRect.top
      const prevScrollTop = bodyWrapper.scrollTop
      bodyWrapper.scrollTop -= delta
      editingCell.classList.remove('vxe-inline-flip-y')
      if (debugEnabled) {
        console.log('[VxeTableWrapper] ensureInlineEditorInView: scroll up', {
          delta,
          prevScrollTop,
          scrollTop: bodyWrapper.scrollTop,
          clientHeight: bodyWrapper.clientHeight,
          offsetHeight: bodyWrapper.offsetHeight,
          scrollHeight: bodyWrapper.scrollHeight,
          horizontalScrollbarHeight,
          bodyRect: { top: bodyRect.top, bottom: bodyRect.bottom, height: bodyRect.height },
          targetRect: { top: targetRect.top, bottom: targetRect.bottom, height: targetRect.height },
          topLimit,
          bottomLimit,
        })
      }
    }

    if (debugEnabled) {
      const cellRect = editingCell.getBoundingClientRect()
      console.log('[VxeTableWrapper] ensureInlineEditorInView: layout snapshot', {
        isDropdown: !!dropdown,
        bodyWrapperClass: bodyWrapper.className,
        bodyWrapperTag: bodyWrapper.tagName,
        bodyWrapperScrollTop: bodyWrapper.scrollTop,
        bodyWrapperClientHeight: bodyWrapper.clientHeight,
        bodyWrapperScrollHeight: bodyWrapper.scrollHeight,
        horizontalScrollbarHeight,
        cellRect: { top: cellRect.top, bottom: cellRect.bottom, height: cellRect.height },
        bodyRect: { top: bodyRect.top, bottom: bodyRect.bottom, height: bodyRect.height },
        targetRect: { top: targetRect.top, bottom: targetRect.bottom, height: targetRect.height },
        topLimit,
        bottomLimit,
      })
    }
  }

  function focusInlineEditor(): void {
    const root = deps.wrapperRef.value
    if (!root) return

    const editingCell = root.querySelector('.vxe-body--column.is-editing-cell') as HTMLElement | null
    if (!editingCell) return

    const editor = editingCell.querySelector('.edit-inline') as HTMLElement | null
    if (!editor) return

    const preferred = editor.querySelector('.edit-inline__textarea, .edit-inline__input, .edit-inline__select, .fk-edit-trigger, .toggle-switch') as HTMLElement | null
    const fallback = editor.querySelector('input, textarea, select, button, [tabindex]:not([tabindex="-1"])') as HTMLElement | null
    const target = preferred || fallback
    target?.focus?.()
  }

  function getPercentageDisplayValue(raw: unknown): number {
    const num = Number(raw)
    return isNaN(num) ? 0 : num * 100
  }

  function getDecimalPlaces(value: number): number {
    if (!isFinite(value)) return 0
    const str = String(value)
    const dotIndex = str.indexOf('.')
    if (dotIndex === -1) return 0
    const places = str.length - dotIndex - 1
    return places
  }

  function validateDecimal(value: unknown, col: WrapperColumn): string | null {
    if (value == null || value === '') return null
    if (col.fieldType !== 'number' && col.fieldType !== 'currency' && col.fieldType !== 'money' && col.fieldType !== 'percent') return null
    if (col.decimal == null) return null
    const num = Number(value)
    if (isNaN(num)) return null
    const actualPlaces = getDecimalPlaces(num)
    const mode = col.decimalMode ?? 'fixed'
    const maxDec = mode === 'range' ? (col.maxDecimal ?? col.decimal) : col.decimal
    if (actualPlaces <= maxDec) return null
    return t('table.edit.decimalMax', { max: maxDec, actual: actualPlaces })
  }

  /** 自定义字段类型（docs/19 B1）：返回注册的编辑器组件，未注册返回 undefined */
  function customEditorDef(col: WrapperColumn): Component | undefined {
    if (!col.fieldType) return undefined
    return getFieldTypeDefinition(col.fieldType)?.editor
  }

  async function startEdit(row: Record<string, unknown>, col: WrapperColumn, rowIndex?: number): Promise<void> {
    // 双保险：绝对只读/有限编辑字段不进编辑态（正常路径已在 handleCellDblclick 拦截）
    if (col.readonly || col.editMode === 'limited') return
    const rowId = row[deps.rowKey()] as string
    editingRowId.value = rowId
    editingField.value = col.field
    activeEditRow.value = row
    activeEditCol.value = col
    if (col.fieldType === 'percent') {
      editValue.value = getPercentageDisplayValue(row[col.field])
    } else if (col.fieldType && col.fieldSchema) {
      // 自定义字段类型（docs/19 B1）：经 toEditorValue 适配回显，缺省原样透传
      const def = getFieldTypeDefinition(col.fieldType)
      editValue.value = def?.toEditorValue ? def.toEditorValue(row[col.field], col.fieldSchema) : row[col.field]
    } else {
      editValue.value = row[col.field]
    }
    fkDropdownOpen.value = false
    fkSearchText.value = ''
    emit('edit-activated', { row, column: col, rowIndex: rowIndex ?? -1 })

    const debugEnabled = typeof window !== 'undefined' && (
      (window as unknown as { __SCHEMAGINE_VXE_DEBUG__?: boolean }).__SCHEMAGINE_VXE_DEBUG__ === true
      || window.localStorage?.getItem('SCHEMAGINE_VXE_DEBUG') === '1'
    )
    if (debugEnabled) {
      console.log('[VxeTableWrapper] startEdit', {
        rowId,
        field: col.field,
        fieldType: col.fieldType,
        width: col.width,
      })
    }

    void nextTick().then(() => {
      ensureInlineEditorInView()
      focusInlineEditor()
    })

    if (col.fieldType === 'fk' && col.targetModule) {
      fkTargetModule = col.targetModule
      const cached = deps.fk.fkOptionsCache.value.get(col.targetModule)
      if (cached) {
        fkOptions.value = cached
      } else {
        fkLoading.value = true
        try {
          const options = await deps.fk.fetchModuleOptions(col.targetModule)
          if (options) {
            fkOptions.value = options
          }
        } finally {
          fkLoading.value = false
        }
      }
    }
  }

  function confirmEdit(row: Record<string, unknown>, col: WrapperColumn): void {
    let val = editValue.value
    if (col.fieldType === 'percent') {
      val = Number(val) / 100
    } else if (col.fieldType && col.fieldSchema) {
      // 自定义字段类型（docs/19 B1）：经 toRecordValue 适配保存值，缺省原样透传
      const def = getFieldTypeDefinition(col.fieldType)
      if (def?.toRecordValue) val = def.toRecordValue(val, col.fieldSchema)
    }
    const error = validateDecimal(val, col)
    if (error) {
      cancelEdit()
      import('element-plus').then(({ ElMessage }) => {
        ElMessage.warning(`${col.title}: ${error}`)
      })
      return
    }
    // docs/19 批次 D3:共享校验器(与创建保存/快速创建同口径);error 拦截,warning 放行仅提示
    if (col.fieldSchema) {
      const validation = validateFieldValue(col.fieldSchema, val)
      if (!validation.valid) {
        cancelEdit()
        import('element-plus').then(({ ElMessage }) => {
          ElMessage.warning(`${col.title}: ${validation.errors[0]}`)
        })
        return
      }
      if (validation.warnings.length > 0) {
        import('element-plus').then(({ ElMessage }) => {
          ElMessage.info(`${col.title}: ${validation.warnings[0]}`)
        })
      }
    }
    // docs/19 批次 H1:行级校验(跨字段规则),以编辑后的整行为上下文,口径与创建保存/快速创建一致
    const rowValidation = validateRecordRow(deps.rowValidationRules(), { ...row, [col.field]: val })
    if (!rowValidation.valid) {
      cancelEdit()
      import('element-plus').then(({ ElMessage }) => {
        ElMessage.warning(rowValidation.errors[0])
      })
      return
    }
    if (rowValidation.warnings.length > 0) {
      import('element-plus').then(({ ElMessage }) => {
        ElMessage.info(rowValidation.warnings[0])
      })
    }
    const field = col.field
    const oldValue = row[field]
    if (val !== oldValue && !(val === '' && oldValue == null)) {
      emit('inline-edit', { row, field, value: val, oldValue })
      row[field] = val
    }
    emit('edit-closed', { row, column: col, value: val })
    editingRowId.value = null
    editingField.value = null
    activeEditRow.value = null
    activeEditCol.value = null
  }

  function cancelEdit(): void {
    if (activeEditRow.value && activeEditCol.value) {
      emit('edit-closed', { row: activeEditRow.value, column: activeEditCol.value, value: editValue.value })
    }
    editingRowId.value = null
    editingField.value = null
    activeEditRow.value = null
    activeEditCol.value = null
    fkSearchText.value = ''
    fkDropdownOpen.value = false
  }

  function toggleEditValue(): void {
    editValue.value = !editValue.value
  }

  function getFkLabel(value: unknown): string {
    if (value == null || value === '') return ''
    const idStr = String(value)
    const opt = fkOptions.value.find(o => String(o.value) === idStr)
    return opt?.label || String(value)
  }

  function toggleFkDropdown(): void {
    fkDropdownOpen.value = !fkDropdownOpen.value
    if (fkDropdownOpen.value) {
      fkSearchText.value = ''
      nextTick(() => {
        ensureInlineEditorInView()
        const input = document.querySelector('.fk-edit-search-input') as HTMLInputElement | null
        input?.focus()
      })
    }
  }

  function closeFkDropdown(): void {
    fkDropdownOpen.value = false
    fkSearchText.value = ''
  }

  function selectFkOption(opt: CandidateOption): void {
    editValue.value = opt.value
    fkDropdownOpen.value = false
    fkSearchText.value = ''
  }

  function clearFkSelection(): void {
    editValue.value = ''
  }

  // ---- mediaImage 行内编辑：媒体库选择 / 上传新资源 / 清除 ----
  const mediaPickerVisible = ref(false)
  const mediaUploading = ref(false)
  const mediaFileInput = ref<HTMLInputElement | null>(null)

  function openMediaPicker(): void {
    mediaPickerVisible.value = true
  }

  function onMediaPicked(asset: { id: string }): void {
    editValue.value = asset.id
  }

  function triggerMediaUpload(e?: Event): void {
    // VxeTable 把单元格 slot 挂到内部单元格实例，template ref 解析不到父组件 setup 作用域；
    // 且列表有多行 media-edit，必须就近定位「被点按钮所在行」的 input，避免点到别的行。
    // 用真实事件 target（永不为 null）沿 .media-edit 向上找本行 input，比 ref/currentTarget 都稳。
    let input: HTMLInputElement | null = null
    const el = (e?.target ?? e?.currentTarget) as HTMLElement | null
    const container = el?.closest('.media-edit') as HTMLElement | null
    if (container) {
      input = container.querySelector('input[type="file"]') as HTMLInputElement | null
    }
    if (!input) input = mediaFileInput.value
    input?.click()
  }

  function onMediaFileChange(e: Event): void {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    mediaUploading.value = true
    mediaService
      .upload(file)
      .then((res) => {
        if (res.success) {
          editValue.value = res.data.id
        } else {
          import('element-plus').then(({ ElMessage }) => ElMessage.error(res.message || '上传失败'))
        }
      })
      .finally(() => {
        mediaUploading.value = false
      })
  }

  function clearMediaSelection(): void {
    editValue.value = ''
  }

  // ---- fk 下拉点外关闭：document 捕获阶段统一接管 ----
  let fkClickOutsideHandler: ((e: MouseEvent) => void) | null = null

  function bindFkClickOutside(): void {
    if (fkClickOutsideHandler) return
    fkClickOutsideHandler = (e: MouseEvent) => {
      if (fkDropdownOpen.value) {
        const target = e.target as HTMLElement | null
        if (target && !target.closest('.fk-edit-dropdown') && !target.closest('.fk-edit-trigger')) {
          closeFkDropdown()
        }
      }
    }
    document.addEventListener('click', fkClickOutsideHandler, true)
  }

  function unbindFkClickOutside(): void {
    if (fkClickOutsideHandler) {
      document.removeEventListener('click', fkClickOutsideHandler, true)
      fkClickOutsideHandler = null
    }
  }

  onMounted(() => {
    bindFkClickOutside()
  })

  onUnmounted(() => {
    unbindFkClickOutside()
  })

  return {
    editingRowId,
    editingField,
    editValue,
    editingCol,
    fkQuickCreateVisible,
    fkFilteredOptions,
    fkLoading,
    fkSearchText,
    fkDropdownOpen,
    openFkQuickCreate,
    handleFkQuickCreated,
    isEditing,
    customEditorDef,
    startEdit,
    confirmEdit,
    cancelEdit,
    toggleEditValue,
    getFkLabel,
    toggleFkDropdown,
    closeFkDropdown,
    selectFkOption,
    clearFkSelection,
    mediaPickerVisible,
    mediaUploading,
    openMediaPicker,
    onMediaPicked,
    triggerMediaUpload,
    onMediaFileChange,
    clearMediaSelection,
  }
}
