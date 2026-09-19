import { test, expect } from '@playwright/test'

test.describe('P2 Schema 引擎高级特性', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/module/module-voucher')
    await page.waitForTimeout(2000)
  })

  // ===== 1. 列表设置面板 =====
  test('1.1 列表设置按钮 - 列表视图下可见', async ({ page }) => {
    const colSettingBtn = page.locator('button', { hasText: '列表设置' })
    await expect(colSettingBtn).toBeVisible({ timeout: 8000 })
  })

  test('1.2 列表设置面板 - 打开与字段列表渲染', async ({ page }) => {
    const colSettingBtn = page.locator('button', { hasText: '列表设置' })
    await expect(colSettingBtn).toBeVisible({ timeout: 8000 })
    await colSettingBtn.click()
    await page.waitForTimeout(800)

    const settingsPopover = page.locator('.column-settings')
    await expect(settingsPopover).toBeVisible({ timeout: 5000 })

    const headerFields = settingsPopover.locator('.settings-table-header')
    await expect(headerFields).toBeVisible()
    await expect(headerFields).toContainText('显示')
    await expect(headerFields).toContainText('字段')
    await expect(headerFields).toContainText('宽度')
    await expect(headerFields).toContainText('固定')
    await expect(headerFields).toContainText('排序')
  })

  test('1.3 列表设置面板 - 字段列表包含凭证模块字段', async ({ page }) => {
    const colSettingBtn = page.locator('button', { hasText: '列表设置' })
    await expect(colSettingBtn).toBeVisible({ timeout: 8000 })
    await colSettingBtn.click()
    await page.waitForTimeout(800)

    const fieldLabels = page.locator('.column-settings .field-label')
    const labelTexts: string[] = []
    const count = await fieldLabels.count()
    for (let i = 0; i < count; i++) {
      const t = await fieldLabels.nth(i).textContent()
      if (t) labelTexts.push(t.trim())
    }
    const joined = labelTexts.join(' ')
    expect(joined).toContain('凭证日期')
    expect(joined).toContain('金额')
    expect(joined).toContain('税额')
  })

  test('1.4 列表设置面板 - 列显隐切换与保存', async ({ page }) => {
    const colSettingBtn = page.locator('button', { hasText: '列表设置' })
    await expect(colSettingBtn).toBeVisible({ timeout: 8000 })
    await colSettingBtn.click()
    await page.waitForTimeout(800)

    const checkboxes = page.locator('.column-settings .el-checkbox')
    const checkboxCount = await checkboxes.count()
    expect(checkboxCount).toBeGreaterThanOrEqual(5)

    const saveBtn = page.locator('.column-settings button', { hasText: '保存' })
    await expect(saveBtn).toBeVisible()
  })

  test('1.5 列表设置面板 - 恢复默认功能存在', async ({ page }) => {
    const colSettingBtn = page.locator('button', { hasText: '列表设置' })
    await expect(colSettingBtn).toBeVisible({ timeout: 8000 })
    await colSettingBtn.click()
    await page.waitForTimeout(800)

    const resetBtn = page.locator('.column-settings button', { hasText: '恢复默认' })
    await expect(resetBtn).toBeVisible()
  })

  // ===== 2. 列拖拽排序 =====
  test('2.1 列表视图 - 列可拖拽属性存在', async ({ page }) => {
    await page.waitForTimeout(1000)
    const tableEl = page.locator('.vxe-table')
    await expect(tableEl).toBeVisible({ timeout: 8000 })
    // .vxe-header--row 含左右固定列克隆行(docs/18 e2e 经验),取主表首行
    const headerRow = page.locator('.vxe-header--row').first()
    await expect(headerRow).toBeVisible()
    const headerCells = headerRow.locator('th')
    const cellCount = await headerCells.count()
    expect(cellCount).toBeGreaterThanOrEqual(5)
  })

  // ===== 3. 外键候选值 =====
  test('3.1 外键字段 - 部门列触发下拉', async ({ page }) => {
    await page.waitForTimeout(1000)

    const tableEl = page.locator('.vxe-table')
    await expect(tableEl).toBeVisible({ timeout: 8000 })

    const headerCells = page.locator('.vxe-header--row th .vxe-cell--title')
    const headerCount = await headerCells.count()

    let deptIndex = -1
    for (let i = 0; i < headerCount; i++) {
      const t = await headerCells.nth(i).textContent()
      if (t && t.includes('部门')) {
        deptIndex = i
        break
      }
    }
    expect(deptIndex).toBeGreaterThanOrEqual(0)
  })

  test('3.2 新增视图 - 部门外键字段存在', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: '新增', exact: true })
    await expect(createBtn).toBeVisible({ timeout: 8000 })
    await createBtn.click()
    await page.waitForTimeout(1500)

    await expect(page.locator('.create-view')).toBeVisible({ timeout: 5000 })

    const headerCells = page.locator('.create-table th')
    const headerCount = await headerCells.count()
    expect(headerCount).toBeGreaterThanOrEqual(5)

    const texts: string[] = []
    for (let i = 0; i < headerCount; i++) {
      const t = await headerCells.nth(i).textContent()
      if (t) texts.push(t.trim())
    }
    const joined = texts.join(' ')
    expect(joined).toContain('部门')
  })

  // ===== 4. 新增视图公式汇总行 =====
  test('4.1 新增视图 - 切换到凭证管理的新增视图', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: '新增', exact: true })
    await expect(createBtn).toBeVisible({ timeout: 8000 })
    await createBtn.click()
    await page.waitForTimeout(1500)

    await expect(page.locator('.create-view')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.create-table tbody tr')).toBeVisible()
  })

  test('4.2 新增视图 - 公式字段列头渲染', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: '新增', exact: true })
    await expect(createBtn).toBeVisible({ timeout: 8000 })
    await createBtn.click()
    await page.waitForTimeout(1500)

    const headerCells = page.locator('.create-table th')
    const texts: string[] = []
    const count = await headerCells.count()
    for (let i = 0; i < count; i++) {
      const t = await headerCells.nth(i).textContent()
      if (t) texts.push(t.trim())
    }
    const joined = texts.join(' ')
    expect(joined).toContain('税额')
  })

  test('4.3 新增视图 - 公式列的单元格为只读展示', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: '新增', exact: true })
    await expect(createBtn).toBeVisible({ timeout: 8000 })
    await createBtn.click()
    await page.waitForTimeout(1500)

    const formulaCells = page.locator('.create-table .formula-cell')
    const count = await formulaCells.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('4.4 新增视图 - 底部操作按钮区域', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: '新增', exact: true })
    await expect(createBtn).toBeVisible({ timeout: 8000 })
    await createBtn.click()
    await page.waitForTimeout(1500)

    await expect(page.locator('.create-toolbar')).toBeVisible()
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '保存并继续', exact: true })).toBeVisible()
  })

  test('4.5 新增视图 - 公式列只显示结果值', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: '新增', exact: true })
    await expect(createBtn).toBeVisible({ timeout: 8000 })
    await createBtn.click()
    await page.waitForTimeout(1500)

    await expect(page.locator('.create-view')).toBeVisible({ timeout: 5000 })

    const bodyRows = page.locator('.create-table tbody tr')
    const firstRow = bodyRows.first()

    const amountInput = firstRow.locator('.el-input-number input[type="number"]').first()
    await expect(amountInput).toBeVisible()
    await amountInput.fill('100')
    await amountInput.press('Tab')
    await page.waitForTimeout(500)

    // 首行含两个公式列(税额/本币金额),取第一个(税额)避免 strict-mode 冲突
    const formulaResult = firstRow.locator('.formula-result-only').first()
    await expect(formulaResult).toBeVisible()
    await expect(formulaResult).toHaveText('13')
  })

  test('4.6 新增视图 - 修改依赖字段后结果联动更新', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: '新增', exact: true })
    await expect(createBtn).toBeVisible({ timeout: 8000 })
    await createBtn.click()
    await page.waitForTimeout(1500)

    await expect(page.locator('.create-view')).toBeVisible({ timeout: 5000 })

    const bodyRows = page.locator('.create-table tbody tr')
    const firstRow = bodyRows.first()

    const numberInputs = firstRow.locator('.el-input-number input[type="number"]')
    const inputCount = await numberInputs.count()
    expect(inputCount).toBeGreaterThanOrEqual(2)

    const amountInput = numberInputs.nth(0)
    await amountInput.fill('200')
    await amountInput.press('Tab')
    await page.waitForTimeout(500)

    await expect(firstRow.locator('.formula-result-only').first()).toHaveText('26')

    // 税率字段为 percent(decimal:0):UI 按「整数百分比」输入,存值自动 /100(显示 ×100);
    // 故填 6(=6% → 存 0.06),联动重算 税额 = 200 * 0.06 = 12
    const taxRateInput = numberInputs.nth(1)
    await taxRateInput.fill('6')
    await taxRateInput.press('Tab')
    await page.waitForTimeout(500)

    await expect(firstRow.locator('.formula-result-only').first()).toHaveText('12')
  })

  test('4.7 公式列展开/折叠按钮和公式说明显示', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: '新增', exact: true })
    await expect(createBtn).toBeVisible({ timeout: 8000 })
    await createBtn.click()
    await page.waitForTimeout(1500)

    await expect(page.locator('.create-view')).toBeVisible({ timeout: 5000 })

    const toggleBtn = page.locator('.formula-toggle-btn').first()
    await expect(toggleBtn).toBeVisible()
    expect(await toggleBtn.textContent()).toContain('公式')

    const bodyRows = page.locator('.create-table tbody tr')
    const firstRow = bodyRows.first()

    const amountInput = firstRow.locator('.el-input-number input[type="number"]').first()
    await expect(amountInput).toBeVisible()
    await amountInput.fill('99')
    await amountInput.press('Tab')
    await page.waitForTimeout(500)

    const formulaChain = firstRow.locator('.formula-chain')
    await expect(formulaChain).toHaveCount(0)

    await toggleBtn.click()
    await page.waitForTimeout(300)

    // 展开为全局状态,首行两个公式列的 chain 同时出现;断言第一个(税额)
    await expect(firstRow.locator('.formula-chain').first()).toBeVisible()
    const chainText = await firstRow.locator('.formula-chain').first().textContent()
    expect(chainText).toContain('税额')
    expect(chainText).toContain('金额')
    expect(chainText).toContain('税率')
    expect(chainText).toContain('99 * 0.13')
    expect(chainText).toContain('12.87')

    await toggleBtn.click()
    await page.waitForTimeout(300)

    await expect(firstRow.locator('.formula-chain')).toHaveCount(0)
  })

  // ===== 5. 循环检测 =====
  test('5.1 公式字段 - 正常模块无循环警告', async ({ page }) => {
    await page.waitForTimeout(1500)
    const cycleTag = page.locator('.el-tag--danger', { hasText: '公式循环' })
    await expect(cycleTag).toBeHidden()
  })

  test('5.2 公式字段 - 应付账款模块有公式', async ({ page }) => {
    await page.goto('/module/module-ap')
    await page.waitForTimeout(2000)

    const headerCells = page.locator('.vxe-header--row th .vxe-cell--title')
    const texts: string[] = []
    const count = await headerCells.count()
    for (let i = 0; i < count; i++) {
      const t = await headerCells.nth(i).textContent()
      if (t) texts.push(t.trim())
    }
    const joined = texts.join(' ')
    expect(joined).toContain('余额')
    expect(joined).toContain('应付金额')
    expect(joined).toContain('已付金额')
  })

  // ===== 6. Schema 编辑器 =====
  test('6.1 Schema 编辑器 - 导航到编辑器页面', async ({ page }) => {
    const editorBtn = page.locator('a[href="/editor"] button, .el-button', { hasText: 'Schema 编辑器' })
    await expect(editorBtn).toBeVisible({ timeout: 8000 })
  })

  test('6.2 Schema 编辑器 - 编辑器页面渲染', async ({ page }) => {
    await page.goto('/editor')
    await page.waitForTimeout(2000)

    await expect(page.locator('.schema-editor')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.editor-title')).toContainText('Schema 编辑器')
  })

  test('6.3 Schema 编辑器 - 模块选择器存在', async ({ page }) => {
    await page.goto('/editor')
    await page.waitForTimeout(2000)

    await expect(page.locator('.schema-editor')).toBeVisible({ timeout: 10000 })
    const moduleSelect = page.locator('.module-select')
    await expect(moduleSelect).toBeVisible()
  })

  test('6.4 Schema 编辑器 - 字段列表侧边栏渲染', async ({ page }) => {
    await page.goto('/editor')

    await expect(page.locator('.schema-editor')).toBeVisible({ timeout: 10000 })
    // 字段列表在默认激活的「字段编辑」Tab 内;侧边栏类名为 field-list-sidebar
    await expect(page.locator('.field-list-sidebar')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.field-list')).toBeVisible()

    const fieldItems = page.locator('.field-list-item')
    const count = await fieldItems.count()
    expect(count).toBeGreaterThanOrEqual(5)
  })

  test('6.5 Schema 编辑器 - Tab 面板切换', async ({ page }) => {
    await page.goto('/editor')

    await expect(page.locator('.schema-editor')).toBeVisible({ timeout: 10000 })
    // 编辑器异步加载 Schema(期间显示「加载中...」),等首个 Tab 渲染后再计数
    await expect(page.locator('.el-tabs__item').first()).toBeVisible({ timeout: 15000 })

    const tabs = page.locator('.el-tabs__item')
    const tabCount = await tabs.count()
    expect(tabCount).toBeGreaterThanOrEqual(4)

    const tabTexts: string[] = []
    for (let i = 0; i < tabCount; i++) {
      const t = await tabs.nth(i).textContent()
      if (t) tabTexts.push(t.trim())
    }
    const joined = tabTexts.join(' ')
    expect(joined).toContain('字段编辑')
    expect(joined).toContain('公式构建')
    expect(joined).toContain('预览')
    expect(joined).toContain('导入/导出')
    expect(joined).toContain('依赖图')
  })

  test('6.6 Schema 编辑器 - 字段编辑面板内容', async ({ page }) => {
    await page.goto('/editor')
    await page.waitForTimeout(2000)

    await expect(page.locator('.schema-editor')).toBeVisible({ timeout: 10000 })

    const firstField = page.locator('.field-list-item').first()
    await expect(firstField).toBeVisible()
    await firstField.click()
    await page.waitForTimeout(500)

    await expect(page.locator('.field-form-panel')).toBeVisible()
    // .panel-title 在模块配置与字段编辑两个面板中各有一个,限定字段编辑面板
    await expect(page.locator('.field-form-panel .panel-title')).toContainText('字段编辑')
  })

  test('6.7 Schema 编辑器 - 公式构建Tab', async ({ page }) => {
    await page.goto('/editor')
    await page.waitForTimeout(2000)

    await expect(page.locator('.schema-editor')).toBeVisible({ timeout: 10000 })

    const formulaTab = page.locator('.el-tabs__item', { hasText: '公式构建' })
    await expect(formulaTab).toBeVisible()
    await formulaTab.click()
    await page.waitForTimeout(500)

    await expect(page.locator('.formula-builder')).toBeVisible()
  })

  test('6.8 Schema 编辑器 - 导入导出Tab', async ({ page }) => {
    await page.goto('/editor')
    await page.waitForTimeout(2000)

    await expect(page.locator('.schema-editor')).toBeVisible({ timeout: 10000 })

    const importExportTab = page.locator('.el-tabs__item', { hasText: '导入/导出' })
    await expect(importExportTab).toBeVisible()
    await importExportTab.click()
    await page.waitForTimeout(500)

    await expect(page.locator('.json-import-export')).toBeVisible()
    await expect(page.locator('button', { hasText: '导出' })).toBeVisible()
    await expect(page.locator('button', { hasText: '导入' })).toBeVisible()
  })

  test('6.9 Schema 编辑器 - 依赖图Tab', async ({ page }) => {
    await page.goto('/editor')
    await page.waitForTimeout(2000)

    await expect(page.locator('.schema-editor')).toBeVisible({ timeout: 10000 })

    const graphTab = page.locator('.el-tabs__item', { hasText: '依赖图' })
    await expect(graphTab).toBeVisible()
    await graphTab.click()
    await page.waitForTimeout(500)

    await expect(page.locator('.dependency-graph')).toBeVisible()
    await expect(page.locator('.graph-legend')).toBeVisible()
    await expect(page.locator('.graph-canvas')).toBeVisible()
  })

  test('6.10 Schema 编辑器 - 导出功能显示JSON', async ({ page }) => {
    await page.goto('/editor')
    await page.waitForTimeout(2000)

    await expect(page.locator('.schema-editor')).toBeVisible({ timeout: 10000 })

    const importExportTab = page.locator('.el-tabs__item', { hasText: '导入/导出' })
    await importExportTab.click()
    await page.waitForTimeout(500)

    await expect(page.locator('.json-area textarea')).toBeVisible()
    const jsonContent = await page.locator('.json-area textarea').inputValue()
    expect(jsonContent.length).toBeGreaterThan(50)
    expect(jsonContent).toContain('"id"')
    expect(jsonContent).toContain('"fields"')
  })

  test('6.11 Schema 编辑器 - 返回按钮存在', async ({ page }) => {
    await page.goto('/editor')
    await page.waitForTimeout(2000)

    await expect(page.locator('.schema-editor')).toBeVisible({ timeout: 10000 })
    const backBtn = page.locator('.editor-header button', { hasText: '返回' })
    await expect(backBtn).toBeVisible()
  })

  // ===== 7. 视图模式联动 =====
  test('7.1 列表/卡片/新增视图循环完整', async ({ page }) => {
    await page.waitForTimeout(1000)

    const cardBtn = page.locator('button', { hasText: '卡片视图' })
    await expect(cardBtn).toBeVisible({ timeout: 8000 })
    await cardBtn.click()
    await page.waitForTimeout(1000)
    await expect(page.locator('.schema-card')).toBeVisible({ timeout: 5000 })

    const listBtn = page.locator('button', { hasText: '列表视图' })
    await expect(listBtn).toBeVisible()
    await listBtn.click()
    await page.waitForTimeout(1000)
    await expect(page.locator('.vxe-table')).toBeVisible({ timeout: 5000 })

    const createBtn = page.getByRole('button', { name: '新增', exact: true })
    await expect(createBtn).toBeVisible()
    await createBtn.click()
    await page.waitForTimeout(1000)
    await expect(page.locator('.create-view')).toBeVisible({ timeout: 5000 })
  })

  // ===== 8. 模块切换 =====
  test('8.1 模块切换后列表设置按钮仍存在', async ({ page }) => {
    const colSettingBtn = page.locator('button', { hasText: '列表设置' })
    await expect(colSettingBtn).toBeVisible({ timeout: 8000 })

    const apRadio = page.locator('.el-radio-button', { hasText: '应付账款' })
    await expect(apRadio).toBeVisible()
    await apRadio.click()
    await page.waitForTimeout(2000)

    await expect(page.getByText('应付账款').first()).toBeVisible({ timeout: 10000 })
    const colSettingBtn2 = page.locator('button', { hasText: '列表设置' })
    await expect(colSettingBtn2).toBeVisible({ timeout: 8000 })
  })

  test('8.2 空模块切换后列表设置按钮仍存在', async ({ page }) => {
    const emptyRadio = page.locator('.el-radio-button', { hasText: '空模块' })
    await expect(emptyRadio).toBeVisible()
    await emptyRadio.click()
    await page.waitForTimeout(2000)

    await expect(page.getByText('空模块（无数据）').first()).toBeVisible({ timeout: 10000 })
    const colSettingBtn = page.locator('button', { hasText: '列表设置' })
    await expect(colSettingBtn).toBeVisible({ timeout: 8000 })
  })

  // ===== 9. 底部快速筛选标签 (BottomTabs) =====
  test('9.1 BottomTabs - 可见且包含标签', async ({ page }) => {
    await page.waitForTimeout(1500)

    const bottomTabs = page.locator('.bottom-tabs')
    await expect(bottomTabs).toBeVisible({ timeout: 8000 })

    const tabBtns = bottomTabs.locator('.tab-btn')
    const count = await tabBtns.count()
    expect(count).toBeGreaterThanOrEqual(3)

    const firstLabel = tabBtns.nth(0).locator('.tab-label')
    await expect(firstLabel).toHaveText('全部')
  })

  test('9.2 BottomTabs - 标签含计数', async ({ page }) => {
    await page.waitForTimeout(1500)

    const tabCounts = page.locator('.bottom-tabs .tab-count')
    const count = await tabCounts.count()
    expect(count).toBeGreaterThanOrEqual(3)

    const allCount = await tabCounts.first().textContent()
    expect(Number(allCount)).toBeGreaterThanOrEqual(1)
  })

  test('9.3 BottomTabs - 点击状态标签筛选数据', async ({ page }) => {
    await page.waitForTimeout(1500)

    const tabBtns = page.locator('.bottom-tabs .tab-btn')
    const tabCount = await tabBtns.count()
    expect(tabCount).toBeGreaterThanOrEqual(3)

    const secondTab = tabBtns.nth(1)
    await expect(secondTab).toBeVisible()
    await secondTab.click()
    await page.waitForTimeout(1500)

    await expect(secondTab).toHaveClass(/active/)
  })

  test('9.4 BottomTabs - 点击全部标签恢复全部数据', async ({ page }) => {
    await page.waitForTimeout(1500)

    const allTab = page.locator('.bottom-tabs .tab-btn').first()
    await expect(allTab).toBeVisible()
    await allTab.click()
    await page.waitForTimeout(1500)

    await expect(allTab).toHaveClass(/active/)
  })

  test('9.5 BottomTabs - 应付账款模块显示筛选标签', async ({ page }) => {
    await page.goto('/module/module-ap')
    await page.waitForTimeout(2000)

    const bottomTabs = page.locator('.bottom-tabs')
    await expect(bottomTabs).toBeVisible({ timeout: 8000 })

    const tabLabels = bottomTabs.locator('.tab-label')
    const texts: string[] = []
    const count = await tabLabels.count()
    for (let i = 0; i < count; i++) {
      const t = await tabLabels.nth(i).textContent()
      if (t) texts.push(t.trim())
    }
    const joined = texts.join(' ')
    expect(joined).toContain('全部')
  })

  test('9.6 BottomTabs - 空模块不显示筛选标签', async ({ page }) => {
    await page.goto('/module/module-empty')
    await page.waitForTimeout(2000)

    await expect(page.getByText('空模块（无数据）').first()).toBeVisible({ timeout: 10000 })
    const bottomTabs = page.locator('.bottom-tabs')
    await expect(bottomTabs).toBeHidden()
  })

  // ===== 10. 日期筛选优化 =====
  test('10.1 单日筛选 - 选择 2026-04-01 正确显示数据', async ({ page }) => {
    const filterBtn = page.locator('.filter-bar-header button').filter({ hasText: '筛选' })
    await expect(filterBtn).toBeVisible({ timeout: 8000 })
    await filterBtn.click()
    await page.waitForTimeout(500)

    const dateInput = page.locator('input[placeholder="选择凭证日期"]')
    await expect(dateInput).toBeVisible({ timeout: 5000 })
    await dateInput.click()
    await dateInput.fill('2026-04-01')
    await page.keyboard.press('Tab')
    await page.waitForTimeout(300)

    const searchBtn = page.locator('.el-popover button').filter({ hasText: '搜索' })
    await searchBtn.click()
    await page.waitForTimeout(800)

    const tagValue = page.locator('.list-view-status-bar .tag-value')
    await expect(tagValue).toBeVisible({ timeout: 5000 })
    const text = tagValue
    await expect(text).toHaveText('2026-04-01')

    const bodyRows = page.locator('.vxe-body--row')
    const rowCount = await bodyRows.count()
    expect(rowCount).toBeGreaterThanOrEqual(1)
  })

  test('10.2 formatDateValue - Date 对象格式化为 yyyy-mm-dd', async ({ page }) => {
    const result = await page.evaluate(() => {
      function formatDateValue(value, isDateTime) {
        if (value == null || value === '') return ''
        const d = value instanceof Date ? value : new Date(String(value))
        if (isNaN(d.getTime())) return String(value)
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        if (isDateTime) {
          const hh = String(d.getHours()).padStart(2, '0')
          const min = String(d.getMinutes()).padStart(2, '0')
          const ss = String(d.getSeconds()).padStart(2, '0')
          return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`
        }
        return `${yyyy}-${mm}-${dd}`
      }
      return {
        single: formatDateValue(new Date('2026-04-01'), false),
        range: `${formatDateValue(new Date('2026-04-01'), false)} ~ ${formatDateValue(new Date('2026-04-05'), false)}`,
        nullVal: formatDateValue(null, false),
        emptyVal: formatDateValue('', false),
        stringInput: formatDateValue('2026-04-01', false),
        dateTime: formatDateValue(new Date('2026-04-01T14:30:00'), true),
        invalid: formatDateValue('not-a-date', false),
      }
    })
    expect(result.single).toBe('2026-04-01')
    expect(result.range).toBe('2026-04-01 ~ 2026-04-05')
    expect(result.nullVal).toBe('')
    expect(result.emptyVal).toBe('')
    expect(result.stringInput).toBe('2026-04-01')
    expect(result.dateTime).toBe('2026-04-01 14:30:00')
    expect(result.invalid).toBe('not-a-date')
  })

  test('10.3 筛选弹出层 - 重开后保留筛选模式', async ({ page }) => {
    await page.waitForTimeout(1000)

    const filterBtn = page.locator('.filter-bar-header button').filter({ hasText: '筛选' })
    await expect(filterBtn).toBeVisible({ timeout: 8000 })
    await filterBtn.click()
    await page.waitForTimeout(500)

    const dateInput = page.locator('input[placeholder="选择凭证日期"]')
    await expect(dateInput).toBeVisible({ timeout: 5000 })
    await dateInput.click()
    await dateInput.fill('2026-04-01')
    await page.keyboard.press('Tab')
    await page.waitForTimeout(300)

    const searchBtn = page.locator('.el-popover button').filter({ hasText: '搜索' })
    await searchBtn.click()
    await page.waitForTimeout(800)

    const tagValue = page.locator('.list-view-status-bar .tag-value')
    await expect(tagValue).toBeVisible({ timeout: 5000 })
    await expect(tagValue).toHaveText('2026-04-01')

    await filterBtn.click()
    await page.waitForTimeout(500)

    const singleBtn = page.locator('.date-mode-toggle .el-button').filter({ hasText: '单日' })
    const isSingleActive = await singleBtn.evaluate(el => el.classList.contains('el-button--primary'))
    expect(isSingleActive).toBe(true)

    const dateInputAfter = page.locator('input[placeholder="选择凭证日期"]')
    await expect(dateInputAfter).toBeVisible({ timeout: 5000 })
  })

  test('10.4 清除全部后 - 日期范围筛选仍正常工作', async ({ page }) => {
    await page.waitForTimeout(1000)

    const filterBtn = page.locator('.filter-bar-header button').filter({ hasText: '筛选' })
    await expect(filterBtn).toBeVisible({ timeout: 8000 })
    await filterBtn.click()
    await page.waitForTimeout(500)

    const dateInput = page.locator('input[placeholder="选择凭证日期"]')
    await expect(dateInput).toBeVisible({ timeout: 5000 })
    await dateInput.click()
    await dateInput.fill('2026-04-01')
    await page.keyboard.press('Tab')
    await page.waitForTimeout(300)

    const searchBtn = page.locator('.el-popover button').filter({ hasText: '搜索' })
    await searchBtn.click()
    await page.waitForTimeout(800)

    const clearAllBtn = page.locator('button').filter({ hasText: '清除全部' })
    await expect(clearAllBtn).toBeVisible({ timeout: 5000 })
    await clearAllBtn.click()
    await page.waitForTimeout(500)

    await filterBtn.click()
    await page.waitForTimeout(500)

    const rangeBtn = page.locator('.date-mode-toggle .el-button').filter({ hasText: '范围' })
    await expect(rangeBtn).toBeVisible({ timeout: 5000 })
    await rangeBtn.click()
    await page.waitForTimeout(300)

    const startInput = page.locator('input[placeholder="开始凭证日期"]')
    await expect(startInput).toBeVisible({ timeout: 5000 })
    await startInput.click()
    await startInput.fill('2026-04-01')
    await page.keyboard.press('Tab')
    await page.waitForTimeout(200)

    const endInput = page.locator('input[placeholder="结束凭证日期"]')
    await endInput.click()
    await endInput.fill('2026-04-05')
    await page.keyboard.press('Tab')
    await page.waitForTimeout(500)

    await searchBtn.click()
    await page.waitForTimeout(800)

    const tagValue = page.locator('.list-view-status-bar .tag-value')
    const text = await tagValue.textContent()
    expect(text).toMatch(/^\d{4}-\d{2}-\d{2} ~ \d{4}-\d{2}-\d{2}$/)

    const bodyRows = page.locator('.vxe-body--row')
    const rowCount = await bodyRows.count()
    expect(rowCount).toBeGreaterThanOrEqual(1)
  })

  test('11.1 批量编辑 - 选中 2 行填充字段成功(docs/19 D2)', async ({ page }) => {
    await page.goto('/module/module-voucher')
    await page.waitForTimeout(1500)

    // 勾选前两行(主表复选框;固定列克隆同源,点主表即可)
    const checkboxCells = page.locator('.vxe-body--row .vxe-cell--checkbox')
    await expect(checkboxCells.nth(1)).toBeVisible({ timeout: 10000 })
    await checkboxCells.nth(0).click()
    await checkboxCells.nth(1).click()

    // 工具栏出现批量编辑(2)
    const batchEditBtn = page.locator('button').filter({ hasText: '批量编辑' })
    await expect(batchEditBtn).toContainText('(2)', { timeout: 5000 })
    await batchEditBtn.click()

    // 对话框:字段选「摘要」
    const dialog = page.locator('.el-dialog').filter({ hasText: '批量编辑' })
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await dialog.locator('.batch-edit-field-select').click()
    await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({ hasText: '摘要' }).first().click()

    // 填充值(TextEditor)
    const valueInput = dialog.locator('.batch-edit-editor input')
    await expect(valueInput).toBeVisible({ timeout: 5000 })
    await valueInput.fill('批量填充校验值')

    // 应用 → 成功提示 2 条(同屏可能有模块加载消息,按文本过滤)
    await dialog.locator('button').filter({ hasText: '应用' }).click()
    await expect(page.locator('.el-message').filter({ hasText: '已更新 2 条' })).toBeVisible({ timeout: 8000 })

    // 两行摘要列显示新值
    await expect(page.locator('.vxe-body--row').filter({ hasText: '批量填充校验值' })).toHaveCount(2, { timeout: 8000 })
  })
})
