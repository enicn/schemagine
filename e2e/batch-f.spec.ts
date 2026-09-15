import { test, expect } from '@playwright/test'

/**
 * docs/19 批次 F：展示形态（F1 密度 / F2 树形 / F3 多级表头 / F4 行展开 / F5 合并 / F6 分组小计）。
 * 密度经 /module/xxx?density=compact|large 注入（ModuleDemo 演示入口透传 SchemaEngine）。
 */
test.describe('docs/19 批次 F：展示形态', () => {
  test('F1.1 默认密度行高 44px、表头 49px', async ({ page }) => {
    await page.goto('/module/module-voucher')
    await page.waitForTimeout(2000)
    const row = page.locator('.vxe-body--row').first()
    await expect(row).toBeVisible({ timeout: 8000 })
    const rowBox = await row.boundingBox()
    expect(Math.round(rowBox!.height)).toBe(44)
    const headerRow = page.locator('.vxe-header--row').first()
    const headerBox = await headerRow.boundingBox()
    expect(Math.round(headerBox!.height)).toBe(49)
  })

  test('F1.2 compact 密度行高 36px（query 注入）', async ({ page }) => {
    await page.goto('/module/module-voucher?density=compact')
    await page.waitForTimeout(2000)
    const row = page.locator('.vxe-body--row').first()
    await expect(row).toBeVisible({ timeout: 8000 })
    const box = await row.boundingBox()
    expect(Math.round(box!.height)).toBe(36)
  })

  test('F1.3 large 密度行高 52px（query 注入）', async ({ page }) => {
    await page.goto('/module/module-voucher?density=large')
    await page.waitForTimeout(2000)
    const row = page.locator('.vxe-body--row').first()
    await expect(row).toBeVisible({ timeout: 8000 })
    const box = await row.boundingBox()
    expect(Math.round(box!.height)).toBe(52)
  })

  // ===== F2 树形数据（module-dept：parentId 组树，expandAll=false 默认收起） =====

  test('F2.1 树形默认收起，逐级展开子行出现', async ({ page }) => {
    await page.goto('/module/module-dept')
    await page.waitForTimeout(2000)
    const rows = page.locator('.vxe-body--row')
    await expect(rows.filter({ hasText: '总经办' })).toBeVisible({ timeout: 8000 })
    // 默认收起：子部门不渲染
    await expect(rows.filter({ hasText: '技术部' })).toHaveCount(0)

    // 展开根行 → 一级子部门出现
    await rows.filter({ hasText: '总经办' }).locator('.vxe-cell--tree-btn').first().click()
    await expect(rows.filter({ hasText: '技术部' })).toBeVisible()
    await expect(rows.filter({ hasText: '市场部' })).toBeVisible()
    // 二级仍收起
    await expect(rows.filter({ hasText: '前端组' })).toHaveCount(0)

    // 展开技术部 → 二级子组出现
    await rows.filter({ hasText: '技术部' }).locator('.vxe-cell--tree-btn').first().click()
    await expect(rows.filter({ hasText: '前端组' })).toBeVisible()
    await expect(rows.filter({ hasText: '后端组' })).toBeVisible()
  })

  test('F2.2 展开后折叠，子行收起', async ({ page }) => {
    await page.goto('/module/module-dept')
    await page.waitForTimeout(2000)
    const rows = page.locator('.vxe-body--row')
    await expect(rows.filter({ hasText: '总经办' })).toBeVisible({ timeout: 8000 })
    await rows.filter({ hasText: '总经办' }).locator('.vxe-cell--tree-btn').first().click()
    await expect(rows.filter({ hasText: '市场部' })).toBeVisible()

    // 再点同一按钮收起
    await rows.filter({ hasText: '总经办' }).locator('.vxe-cell--tree-btn').first().click()
    await expect(rows.filter({ hasText: '市场部' })).toHaveCount(0)
  })

  test('F2.3 子行可双击行内编辑并保存', async ({ page }) => {
    await page.goto('/module/module-dept')
    await page.waitForTimeout(2000)
    const rows = page.locator('.vxe-body--row')
    await expect(rows.filter({ hasText: '总经办' })).toBeVisible({ timeout: 8000 })
    await rows.filter({ hasText: '总经办' }).locator('.vxe-cell--tree-btn').first().click()
    await expect(rows.filter({ hasText: '技术部' })).toBeVisible()
    await rows.filter({ hasText: '技术部' }).locator('.vxe-cell--tree-btn').first().click()
    await expect(rows.filter({ hasText: '前端组' })).toBeVisible()

    // 双击子行「负责人」单元格（复选框列 + 3 数据列 → 第 4 列）进入编辑
    const headCell = rows.filter({ hasText: '前端组' }).locator('td').nth(3)
    await headCell.dblclick()
    const editor = rows.filter({ hasText: '前端组' }).locator('.edit-inline__input')
    await expect(editor).toBeVisible()
    await expect(editor).toHaveValue('李雷')

    // 改值并回车确认 → 单元格直接显示新值
    await editor.fill('李雷2')
    await editor.press('Enter')
    await expect(rows.filter({ hasText: '前端组' })).toContainText('李雷2', { timeout: 8000 })
  })
})
