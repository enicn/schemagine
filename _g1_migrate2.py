# -*- coding: utf-8 -*-
import io

# ---- useHeaderFilter:RANGE_PRESETS 文案改由模板经 key 取(t 响应式) ----
p = 'src/components/table/useHeaderFilter.ts'
s = io.open(p, encoding='utf-8').read()
old = """  /** 时间段快捷预设：一键填充并应用（订单管理等按天/周/月看数据的最高频动作） */
  const RANGE_PRESETS = [
    { key: 'today', label: '本日' },
    { key: 'yesterday', label: '昨日' },
    { key: 'last7', label: '近7天' },
    { key: 'week', label: '本周' },
    { key: 'lastweek', label: '上周' },
    { key: 'month', label: '本月' },
    { key: 'lastmonth', label: '上月' },
  ] as const"""
new = """  /** 时间段快捷预设：一键填充并应用（订单管理等按天/周/月看数据的最高频动作）；文案经 t('table.preset.<key>') 取 */
  const RANGE_PRESETS = [
    { key: 'today' },
    { key: 'yesterday' },
    { key: 'last7' },
    { key: 'week' },
    { key: 'lastweek' },
    { key: 'month' },
    { key: 'lastmonth' },
  ] as const"""
assert old in s
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('useHeaderFilter ok')

# ---- WrapperHeaderCell:预设按钮文案 ----
p = 'src/components/table/WrapperHeaderCell.vue'
s = io.open(p, encoding='utf-8').read()
old = ">[[p.label]]</ElButton>".replace('[[', '{').replace(']]', '}')
assert old in s, 'preset label miss'
s = s.replace(old, """{{ t('table.preset.' + p.key) }}</ElButton>""")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('preset template ok')

# ---- useInlineEdit:decimalMax 校验文案 ----
p = 'src/components/table/useInlineEdit.ts'
s = io.open(p, encoding='utf-8').read()
old = "return `最多允许${maxDec}位小数，当前${actualPlaces}位`"
assert old in s
s = s.replace(old, "return t('table.edit.decimalMax', { max: maxDec, actual: actualPlaces })")
s = s.replace("""import { validateFieldValue } from '@/utils/fieldValidation'""",
              """import { validateFieldValue } from '@/utils/fieldValidation'
import { t } from '@/locales'""")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('useInlineEdit ok')

# ---- useCellDetail:复制反馈文案 ----
p = 'src/components/table/useCellDetail.ts'
s = io.open(p, encoding='utf-8').read()
s = s.replace("ElMessage.success('已复制')", "ElMessage.success(t('table.detail.copied'))")
s = s.replace("ElMessage.error('复制失败，请手动选择复制')", "ElMessage.error(t('table.detail.copyFailed'))")
s = s.replace("""import type { VxeTableInstance } from 'vxe-table'""",
              """import type { VxeTableInstance } from 'vxe-table'
import { t } from '@/locales'""")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('useCellDetail ok')

# ---- VxeTableWrapper:操作列标题 ----
p = 'src/components/table/VxeTableWrapper.vue'
s = io.open(p, encoding='utf-8').read()
old = '''        field="__operations__"
        title="操作"'''
assert old in s
s = s.replace(old, '''        field="__operations__"
        :title="t('table.operationsTitle')"''')
s = s.replace("""import { createCellCtx } from './cellCtx'""",
              """import { createCellCtx } from './cellCtx'
import { t } from '@/locales'""")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('wrapper ok')

# ---- useCellRendering:'查看' ----
p = 'src/components/table/useCellRendering.ts'
s = io.open(p, encoding='utf-8').read()
old = "return col.formatter ? col.formatter({ cellValue: undefined, row: {}, column: col }) : '查看'"
assert old in s
s = s.replace(old, "return col.formatter ? col.formatter({ cellValue: undefined, row: {}, column: col }) : t('table.view')")
s = s.replace("""import { getFieldTypeDefinition } from '@/engine/registry/fieldTypeRegistry'""",
              """import { getFieldTypeDefinition } from '@/engine/registry/fieldTypeRegistry'
import { t } from '@/locales'""")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('rendering ok')

# ---- SchemaTable:footer '合计' ----
p = 'src/components/table/SchemaTable.vue'
s = io.open(p, encoding='utf-8').read()
old = "        return '合计'"
assert old in s
s = s.replace(old, "        return t('table.summary.total')")
s = s.replace("""import { buildGroupedRows } from '@/utils/recordGroup'""",
              """import { buildGroupedRows } from '@/utils/recordGroup'
import { t } from '@/locales'""")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('schema table ok')
