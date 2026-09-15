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
