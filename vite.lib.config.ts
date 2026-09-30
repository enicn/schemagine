import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'path'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'

export default defineConfig({
  plugins: [vue(), vueJsx()],
  publicDir: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    lib: {
      // 四入口：主入口 schemagine + 可选子路径 media（schemagine/media）+ mock（schemagine/mock）+ rules（schemagine/rules）
      entry: {
        schemagine: resolve(__dirname, 'src/index.ts'),
        media: resolve(__dirname, 'src/media/index.ts'),
        mock: resolve(__dirname, 'src/mock/index.ts'),
        rules: resolve(__dirname, 'src/rules/index.ts'),
      },
      name: 'Schemagine',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => {
        if (entryName === 'schemagine') return `schemagine.${format === 'es' ? 'mjs' : 'cjs'}`
        return `${entryName}.${format === 'es' ? 'mjs' : 'cjs'}`
      },
    },
    rollupOptions: {
      // 外置所有 peers（含子路径，如 vxe-table/lib/style.css 等 CSS）。
      // xlsx 是 optional peer(docs/23 M3):external 化让「宿主未装则回退 CSV」的运行时分支真实可达,
      // 已知 CVE 的 npm 版不再被打进 dist。
      // Vite 8(rolldown) 的字符串 external 不再对子路径做前缀匹配，必须改用函数。
      external: (id: string) =>
        /^(vue|vue-router|pinia|element-plus|@element-plus\/icons-vue|vxe-table|vxe-pc-ui|xe-utils|mathjs|xlsx)(\/|$)/.test(id),
      output: {
        globals: {
          vue: 'Vue',
          'vue-router': 'VueRouter',
          pinia: 'Pinia',
          'element-plus': 'ElementPlus',
        },
      },
    },
  },
})
