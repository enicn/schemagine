import { describe, expect, it } from 'vitest'
import { parseCssColor, resolveEnumColor, resolveEnumTagStyle } from '../utils/enumTag'

describe('parseCssColor CSS 颜色解析', () => {
  it('hex 三位/六位/八位', () => {
    expect(parseCssColor('#fc0')).toEqual([255, 204, 0, 1])
    expect(parseCssColor('#67c23a')).toEqual([103, 194, 58, 1])
    expect(parseCssColor('#67c23a80')).toEqual([103, 194, 58, 128 / 255])
  })

  it('rgb()/rgba() 含空格、斜杠、百分号分隔', () => {
    expect(parseCssColor('rgb(103, 194, 58)')).toEqual([103, 194, 58, 1])
    expect(parseCssColor('rgba(103 194 58 / 0.5)')).toEqual([103, 194, 58, 0.5])
    expect(parseCssColor('rgba(103, 194, 58, 50%)')).toEqual([103, 194, 58, 0.5])
  })

  it('大小写与空白容错，非法写法返回 null', () => {
    expect(parseCssColor(' #67C23A ')).toEqual([103, 194, 58, 1])
    expect(parseCssColor('red')).toBeNull()
    expect(parseCssColor('#12345')).toBeNull()
    expect(parseCssColor('rgb(1, 2)')).toBeNull()
  })
})

describe('resolveEnumTagStyle 取色三件套', () => {
  it('语义色调走 --sg-* token 预设盘（浅底 light-9 / 原色 / 描边 light-8）', () => {
    expect(resolveEnumTagStyle('success')).toEqual({
      background: 'var(--sg-color-success-light-9)',
      color: 'var(--sg-color-success)',
      borderColor: 'var(--sg-color-success-light-8)',
    })
    expect(resolveEnumTagStyle('danger')).toEqual({
      background: 'var(--sg-color-danger-light-9)',
      color: 'var(--sg-color-danger)',
      borderColor: 'var(--sg-color-danger-light-8)',
    })
  })

  it('default 中性色调渲染同 info 灰（存量 statusMap 兼容）', () => {
    expect(resolveEnumTagStyle('default')).toEqual(resolveEnumTagStyle('info'))
  })

  it('CSS 颜色自动衍生浅底（10%）与描边（28%），文字取原色', () => {
    expect(resolveEnumTagStyle('#67c23a')).toEqual({
      background: 'rgba(103, 194, 58, 0.1)',
      borderColor: 'rgba(103, 194, 58, 0.28)',
      color: 'rgba(103, 194, 58, 1)',
    })
  })

  it('空值与无法识别的写法返回 null（回落默认样式）', () => {
    expect(resolveEnumTagStyle(undefined)).toBeNull()
    expect(resolveEnumTagStyle('')).toBeNull()
    expect(resolveEnumTagStyle('not-a-color')).toBeNull()
  })
})

describe('resolveEnumColor 枚举取色（options 优先，statusMap 兜底）', () => {
  const options = [
    { label: '微信支付', value: 'wechat_pay', color: 'success' },
    { label: '现金', value: 'cash' },
  ]

  it('命中 options[].color', () => {
    expect(resolveEnumColor('wechat_pay', options, undefined)).toBe('success')
  })

  it('options 未声明颜色时回落 statusMap，宽松字符串比较命中数值枚举', () => {
    expect(resolveEnumColor('cash', options, { cash: '#909399' })).toBe('#909399')
    expect(resolveEnumColor(1, [{ label: '开', value: 1 }], { '1': 'warning' })).toBe('warning')
  })

  it('无声明/空值返回 undefined', () => {
    expect(resolveEnumColor('cash', options, undefined)).toBeUndefined()
    expect(resolveEnumColor('unknown', options, { cash: 'info' })).toBeUndefined()
    expect(resolveEnumColor('', options, { cash: 'info' })).toBeUndefined()
    expect(resolveEnumColor(null, options, { cash: 'info' })).toBeUndefined()
  })
})
