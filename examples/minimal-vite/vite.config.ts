import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // REQUIRED: schemagine is built in library mode with vue/pinia/vue-router as
    // externals. Without dedupe, two copies of Pinia break provide/inject.
    dedupe: ['pinia', 'vue', 'vue-router'],
  },
})
