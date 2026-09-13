<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView />
</template>

<style>
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: 'Open Sans', 'Inter', 'Helvetica Neue', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
  background: var(--sg-bg-color-page);
  color: var(--sg-text-color-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

h1, h2, h3, h4, h5, h6 {
  font-family: 'Poppins', 'Inter', 'Helvetica Neue', 'PingFang SC', sans-serif;
  font-weight: 600;
  letter-spacing: -0.02em;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

.text-red-500 { color: var(--sg-color-danger); }
.text-green-500 { color: var(--sg-color-success); }
.text-blue-500 { color: var(--sg-color-primary); }
.text-yellow-500 { color: var(--sg-color-warning); }
.text-gray-500 { color: var(--sg-text-color-secondary); }

.sort-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  margin-right: var(--sg-spacing-1);
  font-size: var(--sg-font-size-base);
  line-height: 1;
  color: currentColor;
}

.schemagine-header-popover .header-popover {
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-5);
}
.schemagine-header-popover .header-popover__sort {
  display: flex;
  align-items: center;
  gap: var(--sg-spacing-3);
  padding-bottom: var(--sg-spacing-4);
  border-bottom: 1px solid var(--sg-border-color-lighter);
}
.schemagine-header-popover .header-popover__filter {
  display: flex;
  flex-direction: column;
  gap: var(--sg-spacing-4);
}
.schemagine-header-popover .header-popover__filter-title {
  font-size: var(--sg-font-size-base);
  color: var(--sg-text-color-regular);
}
.schemagine-header-popover .header-popover__filter-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.schemagine-header-popover .header-popover__options {
  max-height: 240px;
  overflow: auto;
  padding: var(--sg-spacing-3) var(--sg-spacing-1);
  border: 1px solid var(--sg-border-color-lighter);
  border-radius: var(--sg-radius-md);
}
.schemagine-header-popover .header-popover__options .el-checkbox {
  display: flex;
  align-items: center;
  width: 100%;
  margin-right: 0;
  padding: var(--sg-spacing-2) var(--sg-spacing-3);
  border-radius: var(--sg-radius-md);
}
.schemagine-header-popover .header-popover__options .el-checkbox:hover {
  background: var(--sg-fill-color-light);
}
.schemagine-header-popover .header-popover__options .el-checkbox__label {
  flex: 1;
  min-width: 0;
}
.schemagine-header-popover .header-popover__opt-label,
.schemagine-header-popover .header-popover__opt-count {
  transition: color var(--sg-duration-fast) ease;
}
.schemagine-header-popover .header-popover__options .el-checkbox:hover .header-popover__opt-label {
  color: var(--sg-text-color-primary);
}
.schemagine-header-popover .header-popover__options .el-checkbox:hover .header-popover__opt-count {
  color: var(--sg-text-color-regular);
}
.schemagine-header-popover .header-popover__opt-label {
  margin-right: var(--sg-spacing-3);
}
.schemagine-header-popover .header-popover__opt-count {
  color: var(--sg-text-color-secondary);
}
.schemagine-header-popover .header-popover__loading,
.schemagine-header-popover .header-popover__loading-more {
  padding: var(--sg-spacing-4);
  color: var(--sg-text-color-secondary);
  font-size: var(--sg-font-size-base);
  text-align: center;
}
.schemagine-header-popover .header-popover__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--sg-spacing-4);
}
</style>
