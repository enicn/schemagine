import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'en-US',
  title: 'Schemagine',
  description: 'Schema-driven data engine for Vue 3 — list, card and create views from one ModuleSchema, backed by six injectable services.',
  base: '/schemagine/',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Playground', link: '/demo/playground', target: '_blank' },
      { text: 'npm', link: 'https://www.npmjs.com/package/schemagine' },
      { text: 'GitHub', link: 'https://github.com/enicn/schemagine' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'Installation', link: '/guide/installation' },
          { text: 'Quick Start', link: '/guide/quick-start' },
          { text: 'Tutorial', link: '/guide/tutorial' },
          { text: 'Services', link: '/guide/services' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/enicn/schemagine' },
    ],
    outline: [2, 3],
  },
})
