import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import MediaLibrary from '@/media/MediaLibrary.vue'
import MediaImageEditor from '@/components/field/editors/MediaImageEditor.vue'
import MediaPickerDialog from '@/components/media/MediaPickerDialog.vue'
import { setMediaMode } from '@/services/api/mediaConfig'
import { setMediaService } from '@/services/api/mediaService'
import { mockMediaService, resetMockMedia } from '@/services/mock/mockMediaService'
import type { FieldSchema } from '@/types'

beforeEach(() => {
  resetMockMedia()
  setMediaService(mockMediaService)
})

afterEach(() => {
  setMediaMode('url')
})

function fieldSchema(): FieldSchema {
  return { id: 'f1', name: '封面', key: 'cover', type: 'mediaImage', label: '封面', required: false, readonly: false, order: 1, visible: true, sortable: false, filterable: false }
}

describe('MediaLibrary 媒体库管理页', () => {
  it('列表渲染：种子数据出预览/文件名/复制操作', async () => {
    const wrapper = mount(MediaLibrary)
    await flush()
    const text = wrapper.text()
    expect(text).toContain('favicon.ico')
    expect(text).toContain('复制ID')
    expect(text).toContain('复制URL')
    expect(wrapper.find('.sg-media-library__thumb').exists()).toBe(true)
    wrapper.unmount()
  })

  it('全能力服务：删除按钮可见；关键字筛选走查询', async () => {
    const wrapper = mount(MediaLibrary)
    await flush()
    expect(wrapper.text()).toContain('删除')
    expect(wrapper.text()).toContain('新建资源')
    wrapper.unmount()
  })

  it('精简服务（无 remove/createManual）：对应入口隐藏', async () => {
    setMediaService({
      list: mockMediaService.list,
      upload: mockMediaService.upload,
      resolveUrls: mockMediaService.resolveUrls,
    })
    const wrapper = mount(MediaLibrary)
    await flush()
    expect(wrapper.text()).not.toContain('删除')
    expect(wrapper.text()).not.toContain('新建资源')
    wrapper.unmount()
  })

  it('分页组件出现（服务端分页口径）', async () => {
    const wrapper = mount(MediaLibrary)
    await flush()
    expect(wrapper.find('.el-pagination').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('MediaImageEditor 模式降级', () => {
  it('url 模式（默认）：URL 输入框，无上传/媒体库按钮', async () => {
    setMediaMode('url')
    const wrapper = mount(MediaImageEditor, { props: { value: 'https://cdn.x/a.png', fieldSchema: fieldSchema() } })
    await nextTick()
    const buttons = wrapper.findAll('button').map((b) => b.text())
    expect(buttons.join()).not.toContain('媒体库选择')
    expect(buttons.join()).not.toContain('上传图片')
    expect(wrapper.find('.media-image-editor__url').exists()).toBe(true)
    expect(wrapper.find('img').attributes('src')).toBe('https://cdn.x/a.png')
    wrapper.unmount()
  })

  it('url 模式：输入新地址 change 提交 update', async () => {
    setMediaMode('url')
    const wrapper = mount(MediaImageEditor, { props: { value: '', fieldSchema: fieldSchema() } })
    await nextTick()
    const input = wrapper.find('.media-image-editor__url input')
    await input.setValue('https://cdn.x/new.png')
    await input.trigger('change')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['https://cdn.x/new.png'])
    wrapper.unmount()
  })

  it('oss/api 模式：URL 输入 + 上传按钮，无媒体库入口', async () => {
    setMediaMode('oss')
    const wrapper = mount(MediaImageEditor, { props: { value: '', fieldSchema: fieldSchema() } })
    await nextTick()
    const buttons = wrapper.findAll('button').map((b) => b.text())
    expect(buttons.join()).toContain('上传图片')
    expect(buttons.join()).not.toContain('媒体库选择')
    expect(wrapper.find('.media-image-editor__url').exists()).toBe(true)
    wrapper.unmount()
  })

  it('library 模式：媒体库选择 + 上传按钮，无 URL 输入', async () => {
    setMediaMode('library')
    const wrapper = mount(MediaImageEditor, { props: { value: 'media-deadbeef', fieldSchema: fieldSchema() } })
    await flush()
    const buttons = wrapper.findAll('button').map((b) => b.text())
    expect(buttons.join()).toContain('媒体库选择')
    expect(buttons.join()).toContain('上传图片')
    expect(wrapper.find('.media-image-editor__url').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('MediaPickerDialog 多选', () => {
  // ElDialog append-to-body：弹层内容 teleport 到 document.body，不在 wrapper 树内，
  // 断言与交互走原生 DOM（组件 emits 仍由 wrapper 记录）
  function domItems(): HTMLElement[] {
    return [...document.querySelectorAll('.media-picker__item')] as HTMLElement[]
  }

  function fire(el: Element, type: string): void {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true }))
  }

  it('multiple：点选切换选中集合，确定吐 selectMany 数组', async () => {
    setMediaMode('library')
    const wrapper = mount(MediaPickerDialog, { props: { modelValue: true, multiple: true }, attachTo: document.body })
    await flush()
    const items = domItems()
    expect(items.length).toBeGreaterThanOrEqual(1)
    fire(items[0]!, 'click')
    await flush(2)
    expect(items[0]!.className).toContain('is-picked')
    const confirm = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('确定'))!
    fire(confirm, 'click')
    await flush(2)
    const emitted = wrapper.emitted('selectMany')
    expect(emitted).toBeTruthy()
    expect((emitted![0]![0] as unknown[]).length).toBe(1)
    wrapper.unmount()
    document.body.innerHTML = ''
  })

  it('单选模式行为不变：select 吐单对象', async () => {
    setMediaMode('library')
    const wrapper = mount(MediaPickerDialog, { props: { modelValue: true }, attachTo: document.body })
    await flush()
    fire(domItems()[0]!, 'dblclick')
    await flush(2)
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('selectMany')).toBeUndefined()
    wrapper.unmount()
    document.body.innerHTML = ''
  })
})

async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
