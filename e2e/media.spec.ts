import { test, expect, type Page } from '@playwright/test'

/**
 * 媒体管理四种接入模式（docs/17 媒体四模式，schemagine/media 可选导出）：
 * - 情况一 url（默认）：image/mediaImage 字段值即 URL，直接渲染
 * - 情况二 oss：setupMedia 注册七牛/S3 直传，上传返回最终 URL 落字段
 * - 情况三 api：宿主上传接口返回图片 URL 落字段
 * - 情况四 library：mock 媒体服务（media id 解析）+ 媒体库选择 + MediaLibrary 管理页
 * 上传端点由本文件 route 拦截（/mock/qiniu-upload、/mock/api-upload），全程离线。
 */

/** 进入发票模块并等表格渲染 */
async function gotoInvoice(page: Page, mediaMode?: string): Promise<void> {
  const query = mediaMode ? `?mediaMode=${mediaMode}` : ''
  await page.goto(`/module/module-invoice${query}`)
  await expect(page.locator('.vxe-table').first()).toBeVisible({ timeout: 15000 })
}

function firstRow(page: Page) {
  return page.locator('.vxe-table--main-wrapper .vxe-body--row').first()
}

test.describe('媒体情况一：url 模式（默认，纯表格组件）', () => {
  test('image 字段直接渲染 URL；mediaImage 未解析值降级为文本占位', async ({ page }) => {
    await gotoInvoice(page)
    const row = firstRow(page)
    // 情况一：scanImage = /favicon.ico，直接出 <img>
    await expect(row.locator('img.cell-image').first()).toHaveAttribute('src', /favicon\.ico/, { timeout: 8000 })
    // cover 值为媒体 id（media-deadbeef）：url 模式无媒体服务，降级显示原始值文本
    await expect(row.locator('td').filter({ hasText: 'media-deadbeef' })).toHaveCount(1)
  })

  test('url 模式行内编辑：仅 URL 输入与清除，无上传/媒体库按钮', async ({ page }) => {
    await gotoInvoice(page)
    const cell = firstRow(page).locator('td').filter({ hasText: 'media-deadbeef' })
    await cell.dblclick()
    const mediaEdit = firstRow(page).locator('.media-edit')
    await expect(mediaEdit).toBeVisible({ timeout: 5000 })
    await expect(mediaEdit.getByText('上传图片')).toHaveCount(0)
    await expect(mediaEdit.getByText('媒体库选择')).toHaveCount(0)
    const urlInput = mediaEdit.locator('input.media-edit__url')
    await expect(urlInput).toBeVisible()
    // 手填 URL 回车确认 → 字段落值直接渲染
    await urlInput.fill('https://cdn.e2e.mock/hand-written.png')
    await urlInput.press('Enter')
    await expect(firstRow(page).locator('td').filter({ hasText: 'media-deadbeef' })).toHaveCount(0, { timeout: 8000 })
    await expect(firstRow(page).locator('.media-image-cell').first()).toHaveAttribute('src', 'https://cdn.e2e.mock/hand-written.png')
  })
})

test.describe('媒体情况四：library 模式（媒体库组件集）', () => {
  test('mediaImage 媒体 id 经 IMediaService 解析渲染；行内编辑走媒体库选择', async ({ page }) => {
    await gotoInvoice(page, 'library')
    const row = firstRow(page)
    // media-deadbeef → mock 服务解析为 /favicon.ico
    await expect(row.locator('img.media-image-cell').first()).toHaveAttribute('src', /favicon\.ico/, { timeout: 8000 })

    // 双击进入编辑：library 模式出「媒体库选择」按钮
    await row.locator('td:has(img.media-image-cell)').first().dblclick()
    const mediaEdit = row.locator('.media-edit')
    await expect(mediaEdit).toBeVisible({ timeout: 5000 })
    await expect(mediaEdit.getByRole('button', { name: '媒体库', exact: true })).toBeVisible()
    await expect(mediaEdit.getByRole('button', { name: '上传', exact: true })).toBeVisible()
    await expect(mediaEdit.locator('input.media-edit__url')).toHaveCount(0)

    // 打开媒体库选择弹窗（种子唯一图片），双击直接确认
    await mediaEdit.getByRole('button', { name: '媒体库', exact: true }).click()
    const dialog = page.locator('.el-dialog').filter({ hasText: '从媒体库选择图片' })
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await dialog.locator('.media-picker__item').first().dblclick()
    await expect(dialog).not.toBeVisible({ timeout: 5000 })
    // 选回同一媒体 id，确认保存后解析渲染不变
    await row.locator('.edit-inline__btn--confirm').first().click()
    await expect(row.locator('img.media-image-cell').first()).toHaveAttribute('src', /favicon\.ico/, { timeout: 10000 })
  })

  test('MediaLibrary 管理页：种子列表/预览/能力按钮齐备', async ({ page }) => {
    await page.goto('/media-library')
    const library = page.locator('.sg-media-library')
    await expect(library).toBeVisible({ timeout: 15000 })
    await expect(library.getByText('favicon.ico')).toBeVisible({ timeout: 8000 })
    await expect(library.locator('.sg-media-library__thumb')).toBeVisible()
    await expect(library.getByRole('button', { name: '上传文件' })).toBeVisible()
    await expect(library.getByRole('button', { name: '新建资源' })).toBeVisible()
    await expect(library.getByRole('button', { name: '删除', exact: true })).toBeVisible()
    await expect(library.locator('.el-pagination')).toBeVisible()
  })
})

test.describe('媒体情况二：oss 直传（七牛）', () => {
  test('上传走拦截的七牛端点，最终 URL = domain + key 落字段并渲染', async ({ page }) => {
    await gotoInvoice(page, 'oss')
    let uploadHit = false
    await page.route('**/mock/qiniu-upload', async (route) => {
      uploadHit = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'e2e-key', hash: 'h' }) })
    })

    const cell = firstRow(page).locator('td').filter({ hasText: 'media-deadbeef' })
    await cell.dblclick()
    const mediaEdit = firstRow(page).locator('.media-edit')
    await expect(mediaEdit).toBeVisible({ timeout: 5000 })
    // oss 模式：上传按钮有、媒体库入口无、URL 手填保留
    await expect(mediaEdit.getByRole('button', { name: '上传', exact: true })).toBeVisible()
    await expect(mediaEdit.getByRole('button', { name: '媒体库', exact: true })).toHaveCount(0)
    await expect(mediaEdit.locator('input.media-edit__url')).toBeVisible()

    await mediaEdit.locator('input[type="file"]').setInputFiles({
      name: 'e2e-upload.png',
      mimeType: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71]),
    })
    // 上传成功后 editValue 变为最终 URL，确认保存（对勾按钮）
    await expect(mediaEdit.locator('input.media-edit__url')).toHaveValue(/https:\/\/cdn\.demo\.mock\//, { timeout: 8000 })
    await firstRow(page).locator('.edit-inline__btn--confirm').first().click()

    await expect(firstRow(page).locator('.media-image-cell').first()).toHaveAttribute('src', /https:\/\/cdn\.demo\.mock\/.+e2e-upload\.png$/, { timeout: 10000 })
    expect(uploadHit).toBe(true)
  })
})

test.describe('媒体情况三：api 宿主上传接口', () => {
  test('上传调宿主 API，按约定解析 url 落字段并渲染', async ({ page }) => {
    await gotoInvoice(page, 'api')
    let apiHit = false
    await page.route('**/mock/api-upload', async (route) => {
      apiHit = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: { url: '/favicon.ico' } }) })
    })

    const cell = firstRow(page).locator('td').filter({ hasText: 'media-deadbeef' })
    await cell.dblclick()
    const mediaEdit = firstRow(page).locator('.media-edit')
    await expect(mediaEdit).toBeVisible({ timeout: 5000 })
    await expect(mediaEdit.getByRole('button', { name: '上传', exact: true })).toBeVisible()
    await expect(mediaEdit.getByRole('button', { name: '媒体库', exact: true })).toHaveCount(0)

    await mediaEdit.locator('input[type="file"]').setInputFiles({
      name: 'via-api.png',
      mimeType: 'image/png',
      buffer: Buffer.from([1]),
    })
    await expect(mediaEdit.locator('input.media-edit__url')).toHaveValue(/\/favicon\.ico$/, { timeout: 8000 })
    await firstRow(page).locator('.edit-inline__btn--confirm').first().click()

    await expect(firstRow(page).locator('.media-image-cell').first()).toHaveAttribute('src', /\/favicon\.ico$/, { timeout: 10000 })
    expect(apiHit).toBe(true)
  })
})
