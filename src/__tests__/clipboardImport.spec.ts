import { describe, expect, it } from 'vitest'
import {
  convertCellValue,
  guessHeaderMapping,
  isHeaderFullyMatched,
  isImportableField,
  parseTsvGrid,
} from '../utils/clipboardImport'
import type { FieldSchema } from '../types'

function makeField(partial: Partial<FieldSchema> & Pick<FieldSchema, 'key' | 'type'>): FieldSchema {
  return {
    id: partial.key,
    name: partial.key,
    label: partial.key,
    required: false,
    readonly: false,
    order: 0,
    visible: true,
    sortable: false,
    filterable: false,
    ...partial,
  }
}

describe('parseTsvGrid TSV 解析', () => {
  it('基础制表符/换行解析', () => {
    expect(parseTsvGrid('a\tb\tc\n1\t2\t3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('兼容 CRLF 与末尾换行', () => {
    expect(parseTsvGrid('a\tb\r\n1\t2\r\n')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseTsvGrid('a\n1\n\n')).toEqual([['a'], ['1']])
  })

  it('双引号单元格内含换行、Tab 与转义引号', () => {
    expect(parseTsvGrid('a\t"line1\nline2"\n"c\t1"\t"x""y"')).toEqual([
      ['a', 'line1\nline2'],
      ['c\t1', 'x"y'],
    ])
  })

  it('过滤整行为空的行', () => {
    expect(parseTsvGrid('a\tb\n\t\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('guessHeaderMapping 表头猜测', () => {
  const fields = [
    makeField({ key: 'orderNo', label: '订单编号', type: 'text' }),
    makeField({ key: 'amount', label: '金额', type: 'number' }),
    makeField({ key: 'customer_name', label: '客户名称', type: 'text' }),
  ]

  it('label/key 精确匹配，且每字段只占用一次', () => {
    const mapping = guessHeaderMapping(['订单编号', 'orderNo', '金额'], fields)
    expect(mapping[0]?.key).toBe('orderNo')
    expect(mapping[1]).toBeNull()
    expect(mapping[2]?.key).toBe('amount')
  })

  it('归一化匹配：空白/下划线/大小写/括号差异', () => {
    const mapping = guessHeaderMapping(['客户 名称', 'CustomerName', '金额'], fields)
    expect(mapping[0]?.key).toBe('customer_name')
    expect(mapping[1]).toBeNull()
    expect(mapping[2]?.key).toBe('amount')
  })

  it('第一行为纯数据时返回全 null', () => {
    expect(guessHeaderMapping(['100', '200'], fields)).toEqual([null, null])
  })

  it('isHeaderFullyMatched 忽略空表头单元格', () => {
    expect(isHeaderFullyMatched(['订单编号', ''], guessHeaderMapping(['订单编号', ''], fields))).toBe(true)
    expect(isHeaderFullyMatched(['订单编号', '其他'], guessHeaderMapping(['订单编号', '其他'], fields))).toBe(false)
  })
})

describe('isImportableField 可导入过滤', () => {
  it('公式/操作/关联/媒体/只读字段不可导入', () => {
    expect(isImportableField(makeField({ key: 'f', type: 'formula' }))).toBe(false)
    expect(isImportableField(makeField({ key: 'a', type: 'action' }))).toBe(false)
    expect(isImportableField(makeField({ key: 'r', type: 'one-to-many' }))).toBe(false)
    expect(isImportableField(makeField({ key: 'img', type: 'mediaImage' }))).toBe(false)
    expect(isImportableField(makeField({ key: 'ro', type: 'text', readonly: true }))).toBe(false)
    expect(isImportableField(makeField({ key: 't', type: 'text' }))).toBe(true)
  })
})

describe('convertCellValue 按类型转换', () => {
  it('number/currency：货币符号、千分位、括号负数', () => {
    const field = makeField({ key: 'n', type: 'number' })
    expect(convertCellValue('1,234.56', field)).toBe(1234.56)
    expect(convertCellValue('¥ 1,234.00', field)).toBe(1234)
    expect(convertCellValue('(1,234)', field)).toBe(-1234)
    expect(convertCellValue('abc', field)).toBeUndefined()
    expect(convertCellValue('', field)).toBeUndefined()
  })

  it('percent：带 % 除以 100，不带按原值', () => {
    const field = makeField({ key: 'p', type: 'percent' })
    expect(convertCellValue('12.5%', field)).toBe(0.125)
    expect(convertCellValue('0.125', field)).toBe(0.125)
  })

  it('date/datetime：多格式归一化', () => {
    const date = makeField({ key: 'd', type: 'date' })
    const datetime = makeField({ key: 'dt', type: 'datetime' })
    expect(convertCellValue('2026/9/13', date)).toBe('2026-09-13')
    expect(convertCellValue('2026-9-3', date)).toBe('2026-09-03')
    expect(convertCellValue('2026年9月13日', date)).toBe('2026-09-13')
    expect(convertCellValue('9/13/2026', date)).toBe('2026-09-13')
    expect(convertCellValue('2026/9/13 8:05', datetime)).toBe('2026-09-13 08:05:00')
    expect(convertCellValue('2026.9.13 23:59:01', datetime)).toBe('2026-09-13 23:59:01')
    expect(convertCellValue('2026/2/30', date)).toBe('2026/2/30')
  })

  it('boolean：trueLabel/falseLabel 与常见写法', () => {
    const field = makeField({ key: 'b', type: 'boolean', trueLabel: '已付', falseLabel: '未付' })
    expect(convertCellValue('已付', field)).toBe(true)
    expect(convertCellValue('未付', field)).toBe(false)
    expect(convertCellValue('TRUE', field)).toBe(true)
    expect(convertCellValue('0', field)).toBe(false)
    expect(convertCellValue('maybe', field)).toBeUndefined()
  })

  it('select/status：option label 映射为 value，未命中保留原文', () => {
    const field = makeField({
      key: 's',
      type: 'select',
      options: [
        { label: '待审核', value: 'pending' },
        { label: '已通过', value: 2 },
      ],
    })
    expect(convertCellValue('待审核', field)).toBe('pending')
    expect(convertCellValue('已通过', field)).toBe(2)
    expect(convertCellValue('pending', field)).toBe('pending')
    expect(convertCellValue('未知', field)).toBe('未知')
  })

  it('multi-select：分隔符拆分并逐项映射', () => {
    const field = makeField({
      key: 'ms',
      type: 'multi-select',
      options: [
        { label: '红', value: 'red' },
        { label: '蓝', value: 'blue' },
      ],
    })
    expect(convertCellValue('红、蓝', field)).toEqual(['red', 'blue'])
    expect(convertCellValue('红，绿', field)).toEqual(['red', '绿'])
  })

  it('text/fk：保留原文', () => {
    expect(convertCellValue(' 张三 ', makeField({ key: 't', type: 'text' }))).toBe('张三')
    expect(convertCellValue('供应商A', makeField({ key: 'fk', type: 'fk' }))).toBe('供应商A')
  })
})
