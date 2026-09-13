import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',

  timeout: 60 * 1000,

  expect: {
    timeout: 10000,
  },

  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 0,

  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
  ],

  use: {
    actionTimeout: 15000,
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    headless: true,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  webServer: {
    command: 'pnpm run build && pnpm exec vite preview --port 5173 --strictPort',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
})
