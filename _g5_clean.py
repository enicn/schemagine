# -*- coding: utf-8 -*-
import io

# 1. WrapperCellContent:移除 textarea 死分支
p = 'src/components/table/WrapperCellContent.vue'
s = io.open(p, encoding='utf-8').read()
old = """        <!-- textarea -->
        <textarea
          v-else-if="col.fieldType === 'textarea'"
          v-model="ctx.editValue"
          class="edit-inline__input edit-inline__textarea"
          @keydown.enter.prevent="ctx.onTextareaEnter($event, row, col)"
          @keydown.escape="ctx.cancelEdit"
        />
"""
assert old in s, 'textarea branch'
s = s.replace(old, '')
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('branch removed')

# 2. cellCtx:移除 onTextareaEnter
p = 'src/components/table/cellCtx.ts'
s = io.open(p, encoding='utf-8').read()
old = """  cancelEdit: () => void
  onTextareaEnter: (e: KeyboardEvent, row: Record<string, unknown>, col: WrapperColumn) => void
  toggleEditValue: () => void"""
assert old in s, 'ctx entry'
s = s.replace(old, """  cancelEdit: () => void
  toggleEditValue: () => void""")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ctx cleaned')

# 3. wrapper:移除 ctx 传入与解构
p = 'src/components/table/VxeTableWrapper.vue'
s = io.open(p, encoding='utf-8').read()
old = """  confirmEdit,
  cancelEdit,
  onTextareaEnter,
  toggleEditValue,"""
assert old in s, 'wrapper destructure'
s = s.replace(old, """  confirmEdit,
  cancelEdit,
  toggleEditValue,""")
old2 = """  cancelEdit,
  onTextareaEnter,
  toggleEditValue,"""
assert old2 in s, 'wrapper ctx call'
s = s.replace(old2, """  cancelEdit,
  toggleEditValue,""")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('wrapper cleaned')

# 4. useInlineEdit:移除函数与导出
p = 'src/components/table/useInlineEdit.ts'
s = io.open(p, encoding='utf-8').read()
old = """  function onTextareaEnter(e: KeyboardEvent, row: Record<string, unknown>, col: WrapperColumn): void {
    if (e.ctrlKey || e.metaKey) {
      return
    }
    e.preventDefault()
    confirmEdit(row, col)
  }

"""
assert old in s, 'fn'
s = s.replace(old, '')
old2 = """  onTextareaEnter,
  cancelEdit,"""
assert old2 in s, 'export'
s = s.replace(old2, """  cancelEdit,""")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('inline edit cleaned')
