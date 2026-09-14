import type { Component } from 'vue'
import TextEditor from '@/components/field/editors/TextEditor.vue'
import NumberEditor from '@/components/field/editors/NumberEditor.vue'
import DateEditor from '@/components/field/editors/DateEditor.vue'
import BooleanEditor from '@/components/field/editors/BooleanEditor.vue'
import SelectEditor from '@/components/field/editors/SelectEditor.vue'
import FkSelector from '@/components/field/editors/FkSelector.vue'
import RelationEditor from '@/components/field/editors/RelationEditor.vue'
import MediaImageEditor from '@/components/field/editors/MediaImageEditor.vue'

/** 内置字段类型 → 表单编辑器组件映射(纯函数,便于单测与注册表组装) */
export function builtinEditorForType(type: string): Component | undefined {
  switch (type) {
    case 'text':
    case 'email':
    case 'url':
    case 'phone':
      return TextEditor
    case 'number':
    case 'currency':
    case 'money':
    case 'percent':
      return NumberEditor
    case 'date':
    case 'datetime':
      return DateEditor
    case 'boolean':
      return BooleanEditor
    case 'select':
    case 'multi-select':
    case 'status':
      return SelectEditor
    case 'fk':
      return FkSelector
    case 'mediaImage':
      return MediaImageEditor
    case 'one-to-many':
    case 'many-to-many':
    case 'reverse-ref':
      return RelationEditor
    default:
      return undefined
  }
}
