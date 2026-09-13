import { test, expect } from '@playwright/test'

test.describe('P0 Schema 引擎基础闭环', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('1.1 页面加载 - 标题和模块切换栏', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Schema 引擎演示')

    const radioLabels = page.locator('.el-radio-button__inner')
    await expect(radioLabels).toHaveText([
      '凭证管理',
      '应付账款',
      '发票管理',
      '销售单',
      '应收账单',
      '用户管理',
      '车间管理',
      '空模块（无数据）',
      '无权限模块',
    ])
  })

  test('1.2 默认加载凭证管理模块', async ({ page }) => {
    await page.waitForTimeout(1000)
    await expect(page.getByText('凭证管理').first()).toBeVisible({ timeout: 10000 })
  })

  test('2.1 凭证管理 - 表格列头渲染', async ({ page }) => {
    await page.waitForTimeout(1000)
    const headerCells = page.locator('.vxe-header--row th')
    const count = await headerCells.count()
    expect(count).toBeGreaterThanOrEqual(5)

    const headerTexts: string[] = []
    for (let i = 0; i < count; i++) {
      const text = await headerCells.nth(i).locator('.vxe-cell--title').textContent()
      if (text) headerTexts.push(text.trim())
    }
    const joined = headerTexts.join(' ')
    expect(joined).toContain('凭证日期')
    expect(joined).toContain('凭证编号')
    expect(joined).toContain('金额')
    expect(joined).toContain('凭证类型')
    expect(joined).toContain('状态')
  })

  test('2.2 凭证管理 - 表格数据行渲染', async ({ page }) => {
    await page.waitForTimeout(1000)
    const bodyRows = page.locator('.vxe-body--row')
    const rowCount = await bodyRows.count()
    expect(rowCount).toBeGreaterThanOrEqual(1)
    expect(rowCount).toBeLessThanOrEqual(10)
  })

  test('3.1 凭证管理 - 排序交互', async ({ page }) => {
    await page.waitForTimeout(1000)
    const sortableHeader = page.locator('.vxe-header--row th.is--sortable').first()
    await expect(sortableHeader).toBeVisible({ timeout: 5000 })

    await sortableHeader.click()
    await page.waitForTimeout(500)

    await sortableHeader.click()
    await page.waitForTimeout(500)
  })

  test('3.2 凭证管理 - 筛选交互', async ({ page }) => {
    await page.waitForTimeout(1000)

    const filterButton = page.locator('button', { hasText: '筛选' }).first()
    await expect(filterButton).toBeVisible({ timeout: 5000 })
    await filterButton.click()
    await page.waitForTimeout(500)

    const searchButton = page.locator('button', { hasText: '搜索' }).nth(0)
    await expect(searchButton).toBeVisible({ timeout: 5000 })
    await searchButton.click()

    const resetButton = page.locator('button', { hasText: '重置' }).first()
    await expect(resetButton).toBeVisible({ timeout: 3000 })
    await resetButton.click()
  })

  test('4.1 切换到应付账款模块', async ({ page }) => {
    await page.goto('/module/module-ap')
    await page.waitForTimeout(1500)
    await expect(page.getByText('应付账款').first()).toBeVisible({ timeout: 10000 })

    const headerCells = page.locator('.vxe-header--row th')
    const count = await headerCells.count()
    expect(count).toBeGreaterThanOrEqual(4)

    const headerTexts: string[] = []
    for (let i = 0; i < count; i++) {
      const text = await headerCells.nth(i).locator('.vxe-cell--title').textContent()
      if (text) headerTexts.push(text.trim())
    }
    const joined = headerTexts.join(' ')
    expect(joined).toContain('供应商')
    expect(joined).toContain('发票号')
    expect(joined).toContain('应付金额')
  })

  test('5.1 空模块 - 显示空数据状态', async ({ page }) => {
    await page.goto('/module/module-empty')
    await expect(page.getByText('空模块（无数据）').first()).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(2000)

    const headerTitle = page.locator('.vxe-header--row th .vxe-cell--title').first()
    await expect(headerTitle).toContainText('名称')

    const paginationTotal = page.locator('.el-pagination__total')
    await expect(paginationTotal).toBeHidden()
  })

  test('6.1 无权限模块 - 显示权限错误', async ({ page }) => {
    await page.goto('/module/module-no-perm')
    await page.waitForTimeout(1500)
    await expect(page.getByText('无权限访问该模块')).toBeVisible({ timeout: 10000 })
  })

  test('7.1 分页控件', async ({ page }) => {
    await page.waitForTimeout(1000)

    const pagination = page.locator('.el-pagination')
    await expect(pagination).toBeVisible({ timeout: 5000 })

    await expect(pagination.locator('.el-pagination__total')).toContainText(/[1-9]/)
  })
})
