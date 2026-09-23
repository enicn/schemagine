import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * docs/21 批次 K1「rules 引擎接线」浏览器级验收(demo 位:module-invoice 发票管理):
 * - R1.1 行内编辑 amount 后,compute 链同步 amountWithTax = roundTo(amount×1.13, 2)
 * - R1.2 违反模块级 validate(when: amount ≤ 0)的行内编辑被拦截并提示,原值保留
 * - R1.3 rowAction.action Effect 链:confirm(插值)→ 确定 → toast(插值)
 * - R1.4 labelWhen 按行切换按钮文案(amount ≥ 10000 显示「重点催办」)
 * - R1.5 aggregate 规则在统计条末尾追加 sum 项;零规则模块不出现(零开销语义)
 *
 * 写法沿用 batch-h 约定:文件内 helper + 动态探测列序(列显隐跟随视图配置,防硬编码漂移)。
 */

/** 从表头行定位指定标题列的 td 序号 */
async function findColumnIndex(page: Page, title: string): Promise<number> {
  const headers = page.locator('.vxe-table--main-wrapper .vxe-header--row th')
  const count = await headers.count()
  for (let i = 0; i < count; i++) {
    const text = (await headers.nth(i).textContent())?.trim() ?? ''
    if (text.includes(title)) return i
  }
  throw new Error(`未找到列:${title}`)
}

/** 行内编辑数值单元格:点击 → Enter 进入编辑 → 改值回车确认(G2/H3.2 同款交互) */
async function inlineEditAmount(page: Page, rows: Locator, rowIndex: number, colIdx: number, value: string): Promise<Locator> {
  await rows.nth(rowIndex).locator('td').nth(colIdx).click()
  await page.locator('.vxe-table-wrapper').press('Enter')
  const editor = rows.nth(rowIndex).locator('.edit-inline__input')
  await expect(editor).toBeVisible({ timeout: 5000 })
  await editor.fill(value)
  await editor.press('Enter')
  return editor
}

test.describe('docs/21 批次 K1:声明式规则引擎接线', () => {
  test('R1.1 行内编辑 amount 后 amountWithTax 同步 roundTo(amount×1.13, 2)', async ({ page }) => {
    await page.goto('/module/module-invoice')
    const rows = page.locator('.vxe-table--main-wrapper .vxe-body--row')
    await expect(rows.first()).toBeVisible({ timeout: 8000 })

    const amountIdx = await findColumnIndex(page, '发票金额')
    const taxIdx = await findColumnIndex(page, '含税金额')

    // 种子无 amountWithTax 值,编辑前列为空
    await expect(rows.nth(0).locator('td').nth(taxIdx)).toHaveText('')

    await inlineEditAmount(page, rows, 0, amountIdx, '200')

    // compute 链写回派生列(200 × 1.13 = 226;currency 列查看态为数值原文)
    await expect(rows.nth(0).locator('td').nth(taxIdx)).toHaveText(/¥?226(\.00)?/, { timeout: 8000 })
  })

  test('R1.2 违反模块级 validate(金额 ≤ 0)的行内编辑被拦截并提示', async ({ page }) => {
    await page.goto('/module/module-invoice')
    const rows = page.locator('.vxe-table--main-wrapper .vxe-body--row')
    await expect(rows.first()).toBeVisible({ timeout: 8000 })

    const amountIdx = await findColumnIndex(page, '发票金额')
    const before = ((await rows.nth(0).locator('td').nth(amountIdx).textContent()) ?? '').trim()

    await inlineEditAmount(page, rows, 0, amountIdx, '0')

    // 拦截提示(rules message)+ 原值保留(cancelEdit 丢弃编辑)
    await expect(page.locator('.el-message').filter({ hasText: '发票金额必须大于 0' })).toBeVisible({ timeout: 5000 })
    await expect(rows.nth(0).locator('td').nth(amountIdx)).toHaveText(before)
  })

  test('R1.3/R1.4 rowAction.action:labelWhen 按行切换文案,confirm→确定→toast Effect 链', async ({ page }) => {
    await page.goto('/module/module-invoice')
    const rows = page.locator('.vxe-table--main-wrapper .vxe-body--row')
    await expect(rows.first()).toBeVisible({ timeout: 8000 })

    // R1.4:行 1(amount 12500 ≥ 10000)「重点催办」,行 2(8800)「催办」
    const opBtn = (i: number) => rows.nth(i).locator('button.op-link').filter({ hasText: '催办' })
    await expect(opBtn(0)).toHaveText(/重点催办/, { timeout: 5000 })
    await expect(opBtn(1)).toHaveText(/催办/)
    await expect(opBtn(1)).not.toHaveText(/重点/)

    // R1.3:点击 → confirm 框({{invoiceNumber}} 插值)→ 确定 → toast({{invoiceNumber}} 插值)
    await opBtn(0).click()
    const box = page.locator('.el-message-box')
    await expect(box).toBeVisible({ timeout: 5000 })
    await expect(box).toContainText('确认对 INV-2026-001 发送催办?')
    await box.locator('.el-button--primary').click()
    await expect(page.locator('.el-message').filter({ hasText: '已向 INV-2026-001 发送催办' })).toBeVisible({ timeout: 5000 })
  })

  test('R1.5 aggregate 规则追加统计条 sum 项', async ({ page }) => {
    await page.goto('/module/module-invoice')
    const rows = page.locator('.vxe-table--main-wrapper .vxe-body--row')
    await expect(rows.first()).toBeVisible({ timeout: 8000 })

    // 种子 12500 + 8800 = 21300;统计条数值 zh-CN 两位小数千分位
    const bar = page.locator('.aggregation-bar')
    await expect(bar).toContainText('发票金额合计', { timeout: 5000 })
    await expect(bar).toContainText('21,300.00')

    // 对照:零规则模块(module-voucher)统计条不出现 rules 追加项(零开销语义)
    await page.goto('/module/module-voucher')
    await expect(page.locator('.vxe-table--main-wrapper .vxe-body--row').first()).toBeVisible({ timeout: 8000 })
    await expect(page.locator('.aggregation-bar')).not.toContainText('发票金额合计')
  })
})
