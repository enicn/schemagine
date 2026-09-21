import { test, expect } from '@playwright/test'

test.describe('P1 Schema 引擎扩展功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/module/module-voucher')
    // 引擎加载完成的确定性信号:表格渲染可见(docs/16 批次 H-a:以条件等待替代固定延时)
    await expect(page.locator('.vxe-table').first()).toBeVisible({ timeout: 15000 })
  })

  test('1.1 公式字段 - 列头存在税额列', async ({ page }) => {
    const headerCells = page.locator('.vxe-header--row th .vxe-cell--title')
    const joined = (await headerCells.allTextContents()).map((t) => t.trim()).join(' ')
    expect(joined).toContain('金额')
    expect(joined).toContain('税额')
    expect(joined).toContain('税率')
  })

  test('1.2 公式字段 - 应付账款余额列', async ({ page }) => {
    await page.goto('/module/module-ap')
    await expect(page.locator('.vxe-table').first()).toBeVisible({ timeout: 15000 })

    const headerCells = page.locator('.vxe-header--row th .vxe-cell--title')
    const joined = (await headerCells.allTextContents()).map((t) => t.trim()).join(' ')
    expect(joined).toContain('余额')
    expect(joined).toContain('应付金额')
    expect(joined).toContain('已付金额')
  })

  test('2.1 卡片视图 - 切换与基本渲染', async ({ page }) => {
    const cardButton = page.locator('button', { hasText: '卡片界面' })
    await expect(cardButton).toBeVisible({ timeout: 8000 })
    await cardButton.click()

    await expect(page.locator('.schema-card')).toBeVisible({ timeout: 8000 })

    const recordId = page.locator('.schema-card .card-record-id')
    await expect(recordId.first()).toBeVisible()

    const navigatorInfo = page.locator('.navigator-info')
    await expect(navigatorInfo).toBeVisible()
    const navText = await navigatorInfo.textContent()
    expect(navText).toContain('记录')
    expect(navText).toContain('共')
  })

  test('2.2 卡片视图 - 字段展示', async ({ page }) => {
    const cardButton = page.locator('button', { hasText: '卡片界面' })
    await expect(cardButton).toBeVisible({ timeout: 8000 })
    await cardButton.click()

    await expect(page.locator('.schema-card')).toBeVisible({ timeout: 8000 })

    const labels = page.locator('.schema-card .card-grid-field .field-label')
    const joined = (await labels.allTextContents()).map((t) => t.trim()).join(' ')
    expect(joined).toContain('凭证日期')
    expect(joined).toContain('凭证编号')
    expect(joined).toContain('金额')
  })

  test('2.3 卡片视图 - 导航按钮状态', async ({ page }) => {
    const cardButton = page.locator('button', { hasText: '卡片界面' })
    await expect(cardButton).toBeVisible({ timeout: 8000 })
    await cardButton.click()

    await expect(page.locator('.schema-card')).toBeVisible({ timeout: 8000 })

    const nextButton = page.locator('.card-navigator button', { hasText: '下一页' })
    const prevButton = page.locator('.card-navigator button', { hasText: '上一页' })

    await expect(prevButton).toBeVisible()
    await expect(nextButton).toBeVisible()
    await expect(prevButton).toBeDisabled()
    await expect(nextButton).toBeEnabled()
  })

  test('3.1 新增视图 - 切换与草稿行', async ({ page }) => {
    const createButton = page.getByRole('button', { name: '新增', exact: true })
    await expect(createButton).toBeVisible({ timeout: 8000 })
    await createButton.click()

    await expect(page.locator('.create-view')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('.create-table')).toBeVisible()

    const thCells = page.locator('.create-table th')
    const thCount = await thCells.count()
    expect(thCount).toBeGreaterThanOrEqual(3)

    const bodyRows = page.locator('.create-table tbody tr')
    const rowCount = await bodyRows.count()
    expect(rowCount).toBeGreaterThanOrEqual(1)
  })

  test('3.2 新增视图 - 添加和删除行', async ({ page }) => {
    const createButton = page.getByRole('button', { name: '新增', exact: true })
    await expect(createButton).toBeVisible({ timeout: 8000 })
    await createButton.click()

    const addRowButton = page.locator('.add-row-btn')
    await expect(addRowButton).toBeVisible()
    await addRowButton.click()

    const bodyRows = page.locator('.create-table tbody tr')
    const rowCount = bodyRows
    await expect(rowCount).toHaveCount(2)

    const firstDelete = bodyRows.first().locator('button', { hasText: '删除' })
    await expect(firstDelete).toBeVisible()
  })

  test('3.3 新增视图 - 底部操作按钮', async ({ page }) => {
    const createButton = page.getByRole('button', { name: '新增', exact: true })
    await expect(createButton).toBeVisible({ timeout: 8000 })
    await createButton.click()

    await expect(page.locator('.create-toolbar')).toBeVisible()
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '保存并继续', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '取消', exact: true })).toBeVisible()
  })

  test('4.1 视图切换 - 列表/卡片/新增循环', async ({ page }) => {
    const cardButton = page.locator('button', { hasText: '卡片界面' })
    await expect(cardButton).toBeVisible({ timeout: 8000 })
    await cardButton.click()
    await expect(page.locator('.schema-card')).toBeVisible({ timeout: 5000 })

    // list-module 卡片态的回列表按钮（6706bd6 术语化:列表界面仅 card 型模块显示）
    const listButton = page.locator('button', { hasText: '返回列表' })
    await expect(listButton).toBeVisible()
    await listButton.click()
    await expect(page.locator('.vxe-table')).toBeVisible({ timeout: 5000 })

    const createButton = page.getByRole('button', { name: '新增', exact: true })
    await expect(createButton).toBeVisible()
    await createButton.click()
    await expect(page.locator('.create-view')).toBeVisible({ timeout: 5000 })
  })

  test('5.1 外键字段 - 部门列渲染', async ({ page }) => {
    const headerCells = page.locator('.vxe-header--row th .vxe-cell--title')
    const headerTexts = await headerCells.allTextContents()
    expect(headerTexts.some((t) => t.includes('部门'))).toBeTruthy()
  })

  test('6.1 权限 - 无权限模块隐藏操作按钮', async ({ page }) => {
    await page.goto('/module/module-no-perm')

    await expect(page.getByText('无权限访问该模块')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('button', { hasText: '卡片界面' })).toBeHidden()
    await expect(page.locator('button', { hasText: '新增' }).first()).toBeHidden()
  })

  test('7.1 空模块 - 可切换到新增视图', async ({ page }) => {
    await page.goto('/module/module-empty')

    await expect(page.getByText('空模块（无数据）').first()).toBeVisible({ timeout: 10000 })

    const createBtn = page.getByRole('button', { name: '新增', exact: true })
    await expect(createBtn).toBeVisible()
    await createBtn.click()

    await expect(page.locator('.create-view')).toBeVisible({ timeout: 5000 })
  })
})
