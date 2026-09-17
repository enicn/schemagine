import { test, expect, type Page } from '@playwright/test'

/**
 * 性能基准套件(docs/19 §七「性能基准套件」升格交付):
 * 万行数据下的渲染/滚动/编辑提交量化基准。与功能 e2e 分离,经 `pnpm bench` 单独运行;
 * CI 中为 workflow_dispatch 可选 job,不阻塞常规门禁。
 *
 * 口径:
 * - 数据:localStorage 注入 10,000 条凭证记录 + UserViewConfig.pageSize=10000(单页全量,
 *   才能真正压到 vxe 虚拟滚动);
 * - 断言分两类:确定性断言(DOM 行数有界=虚拟滚动生效)与宽裕预算断言(共享 CI runner
 *   不因机器快慢抖动,绝对值仅作回归参考,逐次打印机器可读指标行);
 * - 指标输出:`[perf-metrics] {...}` JSON 行,便于 CI job 抓取对比。
 */

const TOTAL = 10_000
const MOUNT_BUDGET_MS = 60_000
const SCROLL_BUDGET_MS = 60_000
const EDIT_BUDGET_MS = 30_000
/** 虚拟滚动下 DOM 行数上界(gt=100 + vxe 渲染缓冲;整表渲染会是 10000 行) */
const MAX_DOM_ROWS = 500

async function inflateTenThousandRecords(page: Page): Promise<void> {
  await page.goto('/module/module-voucher')
  await page.locator('.vxe-table--main-wrapper .vxe-body--row').first().waitFor({ state: 'visible', timeout: 30_000 })
  await page.evaluate((total) => {
    const key = 'schemagine:records:module-voucher'
    const existing = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<Record<string, unknown>>
    let i = existing.length
    while (existing.length < total) {
      i += 1
      existing.push({
        id: `voucher-bench-${i}`,
        moduleId: 'module-voucher',
        version: 1,
        createdAt: '2026-05-01T08:00:00.000Z',
        updatedAt: '2026-05-01T08:00:00.000Z',
        fields: {
          date: '2026-05-01',
          number: `BENCH-${String(i).padStart(6, '0')}`,
          amount: 100 + (i % 1000),
          currency: 'CNY',
          type: 'receipt',
          status: 'pending_audit',
        },
      })
    }
    localStorage.setItem(key, JSON.stringify(existing))
    // 单页全量加载,才能真正把 1 万行压进 vxe(默认每页 20 行测不到虚拟滚动)
    const configKey = 'schemagine:configs:module-voucher'
    const config = JSON.parse(localStorage.getItem(configKey) ?? 'null') as Record<string, unknown> | null
    const next = config ?? { moduleId: 'module-voucher', version: 1, columns: [] }
    next.pageSize = total
    localStorage.setItem(configKey, JSON.stringify(next))
  }, TOTAL)
}

test.describe('性能基准(万行,docs/19 §七)', () => {
  test('万行渲染/滚动/编辑提交基准', async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    await inflateTenThousandRecords(page)

    const rows = page.locator('.vxe-table--main-wrapper .vxe-body--row')
    const metrics: Record<string, number> = { totalRecords: TOTAL }

    // ── 基准 1:首次渲染(导航 → 首屏行可见) ──
    const mountStart = Date.now()
    await page.reload()
    await rows.first().waitFor({ state: 'visible', timeout: MOUNT_BUDGET_MS })
    metrics.mountMs = Date.now() - mountStart
    expect(metrics.mountMs).toBeLessThan(MOUNT_BUDGET_MS)

    // 确定性断言:单页全量 1 万行时 DOM 行数必须有界(虚拟滚动生效)
    const domRows = await rows.count()
    metrics.renderedDomRows = domRows
    expect(domRows).toBeGreaterThan(0)
    expect(domRows).toBeLessThan(MAX_DOM_ROWS)
    await expect(page.locator('.schema-pagination')).toContainText(String(TOTAL))

    // ── 基准 2:滚动到底(20 步大步长 + 让 vxe 重渲染) ──
    const bodyWrapper = page.locator('.vxe-table--body-wrapper').first()
    await expect(bodyWrapper).toBeVisible()
    const scrollStart = Date.now()
    for (let i = 0; i < 20; i++) {
      await bodyWrapper.evaluate((el) => {
        el.scrollTop += Math.max(25_000, el.scrollHeight / 20)
      })
      // 有意节流:给 vxe 虚拟滚动一个重渲染帧,模拟真实滚动节奏(固定等待是基准口径的一部分)
      // eslint-disable-next-line playwright/no-wait-for-timeout
      await page.waitForTimeout(25)
    }
    metrics.scrollMs = Date.now() - scrollStart
    expect(metrics.scrollMs).toBeLessThan(SCROLL_BUDGET_MS)
    // 确已滚到底部,且滚动过程中 DOM 行数始终有界
    const atBottom = await bodyWrapper.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight < 5_000)
    expect(atBottom).toBe(true)
    expect(await rows.count()).toBeLessThan(MAX_DOM_ROWS)

    // ── 基准 3:行内编辑提交延迟(td 序:0 复选框、1 日期、2 编号、3 金额) ──
    const firstRow = rows.nth(0)
    const voucherNo = (await firstRow.locator('td').nth(2).textContent())?.trim() ?? ''
    const amountCell = firstRow.locator('td').nth(3)
    const editStart = Date.now()
    await amountCell.click()
    await page.locator('.vxe-table-wrapper').press('Enter')
    const editor = rows.nth(0).locator('.edit-inline__input')
    await expect(editor).toBeVisible({ timeout: EDIT_BUDGET_MS })
    await editor.fill('77777')
    await editor.press('Enter')
    await expect(rows.filter({ hasText: voucherNo }).first()).toContainText('77777', { timeout: EDIT_BUDGET_MS })
    metrics.editCommitMs = Date.now() - editStart
    expect(metrics.editCommitMs).toBeLessThan(EDIT_BUDGET_MS)

    const line = `[perf-metrics] ${JSON.stringify(metrics)}`
    console.log(line)
    await testInfo.attach('perf-metrics', { body: line, contentType: 'application/json' })
  })
})
