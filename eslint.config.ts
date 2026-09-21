import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginPlaywright from 'eslint-plugin-playwright'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  {
    ...pluginPlaywright.configs['flat/recommended'],
    files: ['e2e/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    // docs/16 批次 H-a/H-c:固定延时与测试内条件分支已清零,升 error 防回潮
    rules: {
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-conditional-in-test': 'error',
    },
  },

  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/*'],
  },

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  {
    name: 'app/pragmatic-overrides',
    rules: {
      // docs/16 批次 H（2026-09-22）收敛完成：vxe/EP 边界回调换官方类型或结构类型，0 any 基线
      '@typescript-eslint/no-explicit-any': 'error',
      // Vue3-only 代码库：规则把模板内 TS 联合类型断言的「|」误判为 Vue1 过滤器（docs/16 批次 H-c 逐条核实为误报），关停
      'vue/no-deprecated-filter': 'off',
      'vue/no-mutating-props': 'error',
      'vue/no-side-effects-in-computed-properties': 'error',
    },
  },

  skipFormatting,
)
