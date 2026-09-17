import { describe, expect, it } from 'vitest'
import {
  convertCellValue,
  guessHeaderMapping,
  isHeaderFullyMatched,
  isImportableField,
  parseTsvGrid,
  parseCsvGrid,
  parseXlsxGrid,
  precheckImportRows,
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

describe('parseCsvGrid CSV 解析（docs/19 H5）', () => {
  it('基础逗号分隔与 BOM 去除', () => {
    expect(parseCsvGrid('凭证日期,金额\n2026-09-01,100')).toEqual([
      ['凭证日期', '金额'],
      ['2026-09-01', '100'],
    ])
    expect(parseCsvGrid('\uFEFFa,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('引号单元格内含逗号、换行与转义引号', () => {
    expect(parseCsvGrid('a,b\n"x,1","line1\nline2"\n"c","x""y"')).toEqual([
      ['a', 'b'],
      ['x,1', 'line1\nline2'],
      ['c', 'x"y'],
    ])
  })

  it('分隔符嗅探:分号与制表符 CSV 兼容', () => {
    expect(parseCsvGrid('a;b;c\n1;2;3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
    expect(parseCsvGrid('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('CRLF 与末尾空行过滤', () => {
    expect(parseCsvGrid('a,b\r\n1,2\r\n\r\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('parseXlsxGrid xlsx 解析（docs/19 H5,可选 peer）', () => {
  it('解析 xlsx 二进制首表为字符串网格', async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['名称', '金额'], ['甲', '100'], ['乙', '200']]), 'Sheet1')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const result = await parseXlsxGrid(buf)
    expect('grid' in result && result.grid).toEqual([
      ['名称', '金额'],
      ['甲', '100'],
      ['乙', '200'],
    ])
  })

  it('非法二进制返回 parse-failed 或空网格,均不抛出', async () => {
    // 空缓冲:xlsx 库宽松处理为单空单元格网格
    const empty = await parseXlsxGrid(new ArrayBuffer(0))
    expect('grid' in empty && empty.grid).toEqual([['']])
    // 损坏的 zip 签名:进入 parse-failed 分支
    const corrupt = await parseXlsxGrid(new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x01, 0x02, 0x03]).buffer)
    expect('error' in corrupt && corrupt.error).toBe('parse-failed')
  })
})

describe('precheckImportRows 行级预检（docs/19 H5）', () => {
  const amount = makeField({ key: 'amount', type: 'currency', label: '金额', required: true })
  const status = makeField({
    key: 'status', type: 'select', label: '状态',
    options: [{ label: '待审核', value: 'pending_audit' }, { label: '已审核', value: 'approved' }],
  })

  it('必填缺失报错且带行号字段定位', () => {
    const issues = precheckImportRows([['', 'approved']], [amount, status])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ rowIndex: 1, fieldKey: 'amount', fieldLabel: '金额' })
  })

  it('类型转换失败(金额列填文本)带原文与行号', () => {
    const issues = precheckImportRows([['100', 'approved'], ['abc', 'approved']], [amount, status])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ rowIndex: 2, fieldKey: 'amount' })
    expect(issues[0]!.message).toContain('abc')
  })

  it('布尔/枚举无法解析时报错;枚举 label 自动转 value', () => {
    const boolField = makeField({ key: 'ok', type: 'boolean', label: '是否' })
    const issues = precheckImportRows([['100', '已审核', 'maybe']], [amount, status, boolField])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ rowIndex: 1, fieldKey: 'ok', fieldLabel: '是否' })
  })

  it('校验规则错误(金额为负)行级报出', () => {
    const withMin = makeField({
      key: 'amount', type: 'currency', label: '金额', required: true,
      validationRules: [{ type: 'min', value: 0, message: '金额必须大于等于0', level: 'error' }],
    })
    const issues = precheckImportRows([['-5', 'approved']], [withMin, status])
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toContain('金额必须大于等于0')
  })

  it('映射列全空的行跳过不报错;合法行零问题', () => {
    const issues = precheckImportRows([['', ''], ['', ''], ['100', 'approved']], [amount, status])
    expect(issues).toHaveLength(0)
  })

  it('未映射列(字段为 null)不参与预检', () => {
    const issues = precheckImportRows([['任意文本']], [null])
    expect(issues).toHaveLength(0)
  })
})
