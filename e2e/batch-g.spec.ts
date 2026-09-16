import { test, expect } from '@playwright/test'

/**
 * docs/19 批次 G「平台化与工程」验收用例。
 * G1 i18n：/module/xxx?locale=en-US 注入引擎语言（演示英文包在 ModuleDemo 注册）。
 */
test.describe('docs/19 批次 G：平台化与工程', () => {
  test('G1.1 默认 zh-CN：表头筛选弹层中文文案', async ({ page }) => {
    await page.goto('/module/module-voucher')
    await page.waitForTimeout(2000)
    // 选「状态」列（select 枚举）：候选值模式 + 可切换开关（首列日期列无模式开关）
    const statusHeader = page.locator('.vxe-header--row th').filter({ hasText: '状态' }).first()
    await expect(statusHeader).toBeVisible({ timeout: 8000 })
    await statusHeader.locator('button[aria-label="筛选与排序"]').click()
    const popover = page.locator('.schemagine-header-popover').filter({ visible: true })
    await expect(popover.getByText('升序')).toBeVisible({ timeout: 5000 })
    await expect(popover.getByText('降序')).toBeVisible()
    await expect(popover.getByText('候选值模式')).toBeVisible()
  })


  test('G2.1 键盘导航：点击定位 → 方向键移动 → Enter 进入编辑并保存', async ({ page }) => {
    await page.goto('/module/module-voucher')
    await page.waitForTimeout(2000)

    // a11y 基线：网格容器 role=grid + aria-label
    const grid = page.locator('.vxe-table-wrapper')
    await expect(grid).toHaveAttribute('role', 'grid', { timeout: 8000 })
    await expect(grid).toHaveAttribute('aria-label', /./)

    // 鼠标点击首行「金额」单元格（td 序：0 复选框、1 日期、2 编号、3 金额）
    const rows = page.locator('.vxe-table--main-wrapper .vxe-body--row')
    const firstAmount = rows.nth(0).locator('td').nth(3)
    await firstAmount.click()
    await expect(firstAmount).toHaveClass(/is-focused-cell/)

    // 方向键下移：焦点移至第二行同列
    await grid.press('ArrowDown')
    const secondAmount = rows.nth(1).locator('td').nth(3)
    await expect(secondAmount).toHaveClass(/is-focused-cell/)
    await expect(firstAmount).not.toHaveClass(/is-focused-cell/)

    // 记录第二行编号（保存后列表可能重排，按编号定位断言）
    const voucherNo = (await rows.nth(1).locator('td').nth(2).textContent())?.trim() ?? ''

    // Enter 进入行内编辑 → 改值回车确认
    await grid.press('Enter')
    const editor = rows.nth(1).locator('.edit-inline__input')
    await expect(editor).toBeVisible({ timeout: 5000 })
    await editor.fill('333')
    await editor.press('Enter')
    const editedRow = rows.filter({ hasText: voucherNo }).first()
    await expect(editedRow).toContainText('333', { timeout: 8000 })
  })
  test('G1.2 ?locale=en-US：弹层切英文，未覆盖 key 回退中文', async ({ page }) => {
    await page.goto('/module/module-voucher?locale=en-US')
    await page.waitForTimeout(2000)
    const statusHeader = page.locator('.vxe-header--row th').filter({ hasText: '状态' }).first()
    await expect(statusHeader).toBeVisible({ timeout: 8000 })
    await statusHeader.locator('button[aria-label="筛选与排序"]').click()
    const popover = page.locator('.schemagine-header-popover').filter({ visible: true })
    await expect(popover.getByText('Ascending')).toBeVisible({ timeout: 5000 })
    await expect(popover.getByText('Descending')).toBeVisible()
    await expect(popover.getByText('OK')).toBeVisible()
    // en-US 演示包未覆盖 candidateMode → 回退中文
    await expect(popover.getByText('候选值模式')).toBeVisible()
  })
})
