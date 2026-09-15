import { test, expect } from '@playwright/test'

test.describe('P0 Schema 引擎基础闭环', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('1.1 页面加载 - 标题和模块切换栏', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Schemagine')

    const radioLabels = page.locator('.el-radio-button__inner')
    await expect(radioLabels).toHaveText([
      '凭证管理',
      '应付账款',
      '发票管理',
      '销售单',
      '应收账单',
      '用户管理',
      '车间管理',
      '部门管理',
      '空模块',
      '无权限',
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
    // pageSize 缺省 20:凭证模块 15 条种子数据全部落在第一页
    expect(rowCount).toBeLessThanOrEqual(20)
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

  test('3.2 凭证管理 - 表头筛选交互（关键词）', async ({ page }) => {
    await page.waitForTimeout(1500)

    // 打开「金额」列表头的筛选与排序弹层（每列表头 ▼ 按钮）
    const amountHeader = page.locator('.vxe-header--row th').filter({ hasText: '金额' }).first()
    await expect(amountHeader).toBeVisible({ timeout: 10000 })
    await amountHeader.locator('button[aria-label="筛选与排序"]').click()

    // 数值列缺省为关键词模式：输入 125 并确定（like 包含匹配）
    // 注意：ElPopover persistent 常驻 DOM,每列各有一份弹层内容,只有当前打开的可见
    const keywordInput = page.locator('input[placeholder="输入关键词，回车筛选"]').filter({ visible: true })
    await expect(keywordInput).toBeVisible({ timeout: 5000 })
    await keywordInput.fill('125')
    await page.locator('.header-popover__footer button').filter({ hasText: '确定' }).filter({ visible: true }).click()

    // 仅剩金额为 12500 的一行（.vxe-body--row 含左右固定列克隆行，按凭证编号文本定位主表数据行）
    const dataRows = page.locator('.vxe-body--row').filter({ hasText: 'PZ-2026' })
    await expect(dataRows).toHaveCount(1, { timeout: 5000 })
    await expect(dataRows.first()).toContainText('12500')

    // 重开弹层清除筛选，恢复全量数据
    await amountHeader.locator('button[aria-label="筛选与排序"]').click()
    const clearButton = page.locator('.header-popover button').filter({ hasText: '清除筛选' }).filter({ visible: true })
    await expect(clearButton).toBeVisible({ timeout: 5000 })
    await clearButton.click()
    await page.waitForTimeout(800)
    const restoredCount = await dataRows.count()
    expect(restoredCount).toBeGreaterThanOrEqual(2)
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

    // 表头渲染 schema 列(首列可能是行首复选框列,按文本定位数据列)
    const headerTitle = page.locator('.vxe-header--row th .vxe-cell--title').filter({ hasText: '名称' }).first()
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
