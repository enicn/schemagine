import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * docs/19 批次 H3「undo/redo 扩面」验收用例:
 * - H3.1 批量编辑后撤销整批、重做恢复(计划验收项)
 * - H3.2 行内编辑撤销/重做(useCellEdit 成功落库后入栈)
 *
 * 撤销/重做回放是本地内存操作,断言全部针对界面单元格文本。
 */

/** 从表头行定位「状态」列的 td 序号(列显隐跟随视图配置,动态探测防硬编码漂移) */
async function findStatusColumnIndex(page: Page): Promise<number> {
  const headers = page.locator('.vxe-table--main-wrapper .vxe-header--row th')
  const count = await headers.count()
  for (let i = 0; i < count; i++) {
    const text = (await headers.nth(i).textContent())?.trim() ?? ''
    if (text.includes('状态')) return i
  }
  throw new Error('未找到状态列')
}

async function rowStatusText(rows: Locator, voucherNo: string, statusIdx: number): Promise<string> {
  const cell = rows.filter({ hasText: voucherNo }).first().locator('td').nth(statusIdx)
  return ((await cell.textContent()) ?? '').trim()
}

test.describe('docs/19 批次 H3:引擎级 undo/redo', () => {
  test('H3.1 批量编辑后撤销整批,重做恢复', async ({ page }) => {
    await page.goto('/module/module-voucher')
    const rows = page.locator('.vxe-table--main-wrapper .vxe-body--row')
    await expect(rows.first()).toBeVisible({ timeout: 8000 })

    // 选中前两行(种子:PZ-0001 已过账 / PZ-0002 已审核,目标值「已作废」与两者都不同)
    const voucherNoA = (await rows.nth(0).locator('td').nth(2).textContent())?.trim() ?? ''
    const voucherNoB = (await rows.nth(1).locator('td').nth(2).textContent())?.trim() ?? ''
    const statusIdx = await findStatusColumnIndex(page)
    const statusA = await rowStatusText(rows, voucherNoA, statusIdx)
    const statusB = await rowStatusText(rows, voucherNoB, statusIdx)
    expect(statusA).not.toContain('已作废')
    expect(statusB).not.toContain('已作废')

    const rowCheckbox = page.locator('.vxe-body--row .vxe-checkbox--icon')
    await rowCheckbox.nth(0).click()
    await rowCheckbox.nth(1).click()

    // 打开批量编辑,字段选「状态」,填充「已作废」
    await page.locator('button').filter({ hasText: '批量编辑 (2)' }).click()
    const dialog = page.locator('.el-dialog').filter({ hasText: '批量编辑' })
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await page.locator('.batch-edit-field-select').click()
    await page.getByRole('option', { name: '状态' }).click()
    await page.locator('.batch-edit-editor .el-select').click()
    await page.getByRole('option', { name: '已作废' }).click()
    await dialog.locator('button').filter({ hasText: '应用' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 5000 })

    // 两行均变为已作废
    await expect(rows.filter({ hasText: voucherNoA }).first()).toContainText('已作废', { timeout: 5000 })
    await expect(rows.filter({ hasText: voucherNoB }).first()).toContainText('已作废')

    // 撤销整批 → 两行还原各自原状态;undo 栈清空后撤销按钮禁用
    const undoBtn = page.getByRole('button', { name: '撤销' })
    const redoBtn = page.getByRole('button', { name: '重做' })
    await undoBtn.click()
    await expect(rows.filter({ hasText: voucherNoA }).first().locator('td').nth(statusIdx)).toHaveText(statusA, { timeout: 5000 })
    await expect(rows.filter({ hasText: voucherNoB }).first().locator('td').nth(statusIdx)).toHaveText(statusB)
    await expect(undoBtn).toBeDisabled()
    await expect(redoBtn).toBeEnabled()

    // 重做 → 整批恢复已作废;redo 栈清空后重做按钮禁用
    await redoBtn.click()
    await expect(rows.filter({ hasText: voucherNoA }).first()).toContainText('已作废', { timeout: 5000 })
    await expect(rows.filter({ hasText: voucherNoB }).first()).toContainText('已作废')
    await expect(redoBtn).toBeDisabled()
    await expect(undoBtn).toBeEnabled()
  })

  test('H3.2 行内编辑撤销/重做(成功落库后入栈)', async ({ page }) => {
    await page.goto('/module/module-voucher')
    const rows = page.locator('.vxe-table--main-wrapper .vxe-body--row')
    await expect(rows.first()).toBeVisible({ timeout: 8000 })

    const voucherNo = (await rows.nth(0).locator('td').nth(2).textContent())?.trim() ?? ''
    const amountIdx = 3
    const originalAmount = ((await rows.nth(0).locator('td').nth(amountIdx).textContent()) ?? '').trim()

    // 点击定位首行金额单元格 → Enter 进入行内编辑 → 改值回车确认(G2 同款交互)
    const firstAmount = rows.nth(0).locator('td').nth(amountIdx)
    await firstAmount.click()
    await page.locator('.vxe-table-wrapper').press('Enter')
    const editor = rows.nth(0).locator('.edit-inline__input')
    await expect(editor).toBeVisible({ timeout: 5000 })
    await editor.fill('777')
    await editor.press('Enter')

    const editedRow = rows.filter({ hasText: voucherNo }).first()
    await expect(editedRow).toContainText('777', { timeout: 8000 })

    // 撤销 → 金额还原;重做 → 777 再现
    const undoBtn = page.getByRole('button', { name: '撤销' })
    const redoBtn = page.getByRole('button', { name: '重做' })
    await undoBtn.click()
    await expect(editedRow.locator('td').nth(amountIdx)).toHaveText(originalAmount, { timeout: 5000 })
    await redoBtn.click()
    await expect(editedRow).toContainText('777', { timeout: 5000 })
  })
})
