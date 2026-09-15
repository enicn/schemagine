import { describe, expect, it, vi, afterEach } from 'vitest'
import { getLocale, registerLocale, setLocale, t } from '@/locales'
import zhCN from '@/locales/zh-CN'

afterEach(() => {
  setLocale('zh-CN')
})

describe('locales i18n（docs/19 G1）', () => {
  it('默认 zh-CN，基准包 key 可取值', () => {
    expect(getLocale()).toBe('zh-CN')
    expect(t('table.filter.asc')).toBe('升序')
    expect(t('table.operationsTitle')).toBe('操作')
  })

  it('插值：{name} 占位符按 params 替换', () => {
    expect(t('table.edit.decimalMax', { max: 2, actual: 3 })).toBe('最多允许2位小数，当前3位')
    expect(t('table.edit.quickCreate', { title: '供应商' })).toBe('+ 新建供应商')
  })

  it('key 缺失回退 key 本身；params 缺失保留占位符', () => {
    expect(t('no.such.key')).toBe('no.such.key')
    expect(t('table.edit.decimalMax')).toBe('最多允许{max}位小数，当前{actual}位')
  })

  it('registerLocale + setLocale：切语言生效，缺失 key 回退基准包', () => {
    registerLocale('en-US', {
      table: {
        operationsTitle: 'Actions',
        filter: { asc: 'Asc' },
      },
    })
    setLocale('en-US')
    expect(t('table.filter.asc')).toBe('Asc')
    expect(t('table.operationsTitle')).toBe('Actions')
    // 基准包有、英文包没有 → 回退中文
    expect(t('table.filter.desc')).toBe('降序')
    // 基准包也没有 → key 本身
    expect(t('no.such.key')).toBe('no.such.key')
  })

  it('setLocale 未注册语言：保持不变并告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setLocale('fr-FR')
    expect(getLocale()).toBe('zh-CN')
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('基准包结构抽检：筛选弹层/行内编辑/浮层三域完整', () => {
    const table = zhCN.table as unknown as { filter: Record<string, unknown>; edit: Record<string, unknown>; detail: Record<string, unknown> }
    expect(Object.keys(table.filter).length).toBeGreaterThanOrEqual(15)
    expect(table.edit.saveTitle).toBe('保存')
    expect(table.detail.copy).toBe('复制')
  })
})
