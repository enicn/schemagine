import { test, expect, type Page } from '@playwright/test'

/**
 * docs/19 批次 E「过滤与视图体系」验收用例:
 * - E1 SchemaFilterBar 挂载与筛选生效(10.1/10.3/10.4 已覆盖,此处补组合模式)
 * - E2 组合过滤:匹配方式切换(全部/任一)产生 FilterGroup,列表按 OR 语义过滤
 * - E3 保存视图:保存/切换/设默认(刷新后自动应用)/删除
 * - E5 pageSize 恢复:改每页条数后刷新保持
 * - E6 跨页勾选:vxe checkbox reserve,勾选→翻页→返回仍勾选
 */

/** 向 mock 存储注入额外凭证记录,使 module-voucher 达到指定总行数(默认种子仅 5 行,无法翻页) */
async function inflateVoucherRecords(page: Page, targetTotal: number): Promise<void> {
  await page.goto('/module/module-voucher')
  await expect(page.locator('.filter-bar-header button').filter({ hasText: '筛选' })).toBeVisible({ timeout: 8000 })
  await page.evaluate((total) => {
    const key = 'schemagine:records:module-voucher'
    const existing = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<Record<string, unknown>>
    let i = existing.length
    while (existing.length < total) {
      i += 1
      existing.push({
        id: `voucher-extra-${i}`,
        moduleId: 'module-voucher',
        version: 1,
        createdAt: '2026-05-01T08:00:00.000Z',
        updatedAt: '2026-05-01T08:00:00.000Z',
        fields: {
          voucherDate: '2026-05-01',
          voucherNo: `PZ-2026-${String(i).padStart(3, '0')}`,
          amount: 1000 + i,
          voucherType: '记账凭证',
          status: 'pending',
        },
      })
    }
    localStorage.setItem(key, JSON.stringify(existing))
  }, targetTotal)
  await page.reload()
  await expect(page.locator('.filter-bar-header button').filter({ hasText: '筛选' })).toBeVisible({ timeout: 8000 })
}

/** SchemaEngine 的视图配置经 mock 服务异步落库(约 300ms);刷新前必须等它写进 localStorage */
async function waitForConfigSave(page: Page, substring: string): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('schemagine:configs:module-voucher') ?? ''))
    .toContain(substring)
}

test.describe('批次 E 过滤与视图体系(docs/19)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/module/module-voucher')
    await expect(page.locator('.filter-bar-header button').filter({ hasText: '筛选' })).toBeVisible({ timeout: 8000 })
  })

  test('E2 组合过滤 - 「全部条件」交集为空、「任一条件」并集非空', async ({ page }) => {
    const filterBtn = page.locator('.filter-bar-header button').filter({ hasText: '筛选' })
    await expect(filterBtn).toBeVisible({ timeout: 8000 })
    await filterBtn.click()

    // 条件 1:状态 = 已审核(命中 1 行);条件 2:凭证类型 = 收款凭证(命中另一行,交集为空)
    const statusItem = page.locator('.filter-popover-item').filter({ hasText: '状态' })
    await statusItem.locator('.filter-select').click()
    await page.getByRole('option', { name: '已审核' }).first().click()

    const typeItem = page.locator('.filter-popover-item').filter({ hasText: '凭证类型' })
    await typeItem.locator('.filter-select').click()
    await page.getByRole('option', { name: '收款凭证' }).first().click()

    // 两个受管条件 → 匹配切换出现;默认「全部条件」(AND) → 交集为空,表格无数据行
    const allBtn = page.locator('.match-toggle button').filter({ hasText: '全部条件' })
    await expect(allBtn).toBeVisible({ timeout: 5000 })
    await page.locator('.filter-popover-actions button').filter({ hasText: '搜索' }).click()
    await expect(page.locator('.list-view-status-bar .el-tag')).toHaveCount(2)
    await expect(page.locator('.vxe-body--row')).toHaveCount(0)

    // 重开弹层(草稿自动还原)→ 切「任一条件」(OR) → 并集 2 行(含固定列克隆)
    await filterBtn.click()
    await page.locator('.match-toggle button').filter({ hasText: '任一条件' }).click()
    await page.locator('.filter-popover-actions button').filter({ hasText: '搜索' }).click()
    await expect(page.locator('.list-view-status-bar .el-tag')).toHaveCount(2)
    await expect.poll(async () => page.locator('.vxe-body--row').count()).toBeGreaterThanOrEqual(3)
  })

  test('E3 保存视图 - 保存/切换/设默认(刷新自动应用)/删除', async ({ page }) => {
    const filterBtn = page.locator('.filter-bar-header button').filter({ hasText: '筛选' })
    await expect(filterBtn).toBeVisible({ timeout: 8000 })

    // 1. 设置筛选:单日 2026-04-01
    await filterBtn.click()
    const dateInput = page.locator('input[placeholder="选择凭证日期"]')
    await expect(dateInput).toBeVisible({ timeout: 5000 })
    await dateInput.click()
    await dateInput.fill('2026-04-01')
    await page.keyboard.press('Tab')
    await page.locator('.filter-popover-actions button').filter({ hasText: '搜索' }).click()
    await expect(page.locator('.list-view-status-bar .tag-value')).toHaveText('2026-04-01')

    // 2. 存为视图
    await page.locator('button').filter({ hasText: '存为视图' }).click()
    const promptInput = page.locator('.el-message-box__input input')
    await expect(promptInput).toBeVisible()
    await promptInput.fill('四月一日')
    await page.locator('.el-message-box__btns button').filter({ hasText: '保存' }).click()

    const presetSelect = page.locator('.list-toolbar .preset-select')
    await expect(presetSelect).toContainText('四月一日')

    // 3. 清除筛选 → 离开视图上下文,状态条消失
    await page.locator('button').filter({ hasText: '清除全部' }).click()
    await expect(page.locator('.list-view-status-bar')).toHaveCount(0)

    // 4. 切换回视图 → 筛选恢复生效
    await presetSelect.click()
    await page.getByRole('option').filter({ hasText: '四月一日' }).first().click()
    await expect(page.locator('.list-view-status-bar .tag-value')).toHaveText('2026-04-01')

    // 5. 设为默认 → 刷新后自动应用
    await page.locator('button').filter({ hasText: '设为默认' }).click()
    await expect(page.locator('.list-toolbar .preset-hint')).toContainText('四月一日')
    await waitForConfigSave(page, '"isDefault":true')
    await page.reload()
    await expect(page.locator('.list-view-status-bar .tag-value')).toHaveText('2026-04-01')
    await expect(page.locator('.list-toolbar .preset-hint')).toContainText('四月一日')

    // 6. 删除视图 → 确认后默认应用消失
    await page.locator('button').filter({ hasText: '删除视图' }).click()
    await page.locator('.el-message-box__btns button').filter({ hasText: '删除' }).click()
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('schemagine:configs:module-voucher') ?? ''))
      .not.toContain('四月一日')
    await page.reload()
    await expect(page.locator('.list-view-status-bar')).toHaveCount(0)
  })

  test('E5 pageSize 恢复 - 改每页条数后刷新保持', async ({ page }) => {
    await inflateVoucherRecords(page, 30)

    // 改每页条数为 10
    const sizeSelect = page.locator('.schema-pagination .el-select')
    await expect(sizeSelect).toBeVisible({ timeout: 8000 })
    await sizeSelect.click()
    await page.getByRole('option').filter({ hasText: '10/page' }).click()
    await expect(page.locator('.schema-pagination .el-select')).toContainText('10/page')
    await waitForConfigSave(page, '"pageSize":10')

    // 刷新 → 每页条数保持 10
    await page.reload()
    const sizeSelectAfter = page.locator('.schema-pagination .el-select')
    await expect(sizeSelectAfter).toContainText('10')

    // 翻页控件应出现第 2 页(30 条 / 10 = 3 页)
    const pagerNumbers = page.locator('.el-pager li')
    await expect(pagerNumbers).toHaveCount(3)
  })

  test('E6 跨页勾选 - 勾选→翻页→返回仍勾选,可清空', async ({ page }) => {
    await inflateVoucherRecords(page, 30)

    // pageSize 10 → 2 页以上;勾选第 1 页第 1 行
    const firstRowCheckbox = page.locator('.vxe-body--row .vxe-checkbox--icon').first()
    await expect(firstRowCheckbox).toBeVisible({ timeout: 8000 })
    const batchEditBtn = page.locator('button').filter({ hasText: '批量编辑' })
    await firstRowCheckbox.click()
    await expect(batchEditBtn).toContainText('(1)')

    // 翻到第 2 页 → 计数保持(保留区勾选)
    const gotoPage2 = page.locator('.el-pager li').filter({ hasText: '2' })
    await gotoPage2.click()
    await expect(page.locator('button').filter({ hasText: '批量编辑' })).toContainText('(1)')

    // 返回第 1 页 → 行 1 仍勾选
    await page.locator('.el-pager li').filter({ hasText: '1' }).click()
    await expect(page.locator('.vxe-body--row .vxe-checkbox--icon').first()).toHaveClass(/checkbox-checked/)

    // 清空选择 → 计数消失
    await page.locator('button').filter({ hasText: '清空选择' }).click()
    await expect(page.locator('button').filter({ hasText: '批量编辑' })).not.toContainText('(1)')
  })
})
