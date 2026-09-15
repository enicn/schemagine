# 15 - 样式 Token 基线与宿主换肤指南

> 唯一权威来源：`src/styles/tokens.css`。本文档与该文件同步维护；
> 组件样式**禁止**出现字面量颜色/字号/间距/圆角/阴影，一律引用 `--sg-*` token。

## 1. 设计原则

1. **前缀与作用域**：全部 token 以 `--sg-` 为前缀，定义在 `:root`，全局生效 ——
   EP 弹层（dialog / popover / message）teleport 到 body 后依然可用。
2. **默认跟随 Element Plus**：品牌/功能/文字/边框/填充色的基色写成 `var(--el-*, 回退值)`；
   品牌与功能色的浅色阶（light-N）用 `color-mix` 从基色派生（与 EP 的 mix 白算法等价）。
   宿主已用 EP 时零配置继承 EP 主题（含 `html.dark` 暗色模式）；
   未安装 EP 样式时回退到静态默认值（EP 2.x 官方色板）。
   需要浏览器支持 `color-mix()`（Chrome 111+ / Safari 16.2+ / Firefox 113+，2023 基线）。
3. **宿主可覆盖**：在任意祖先节点覆盖 `--sg-*` 即可，例如：

   ```css
   /* 整站换成紫色主题、全局圆角放大 */
   :root {
     --sg-color-primary: #7c3aed;
     --sg-radius-md: 6px;
     --sg-font-size-base: 13px;
   }
   ```

   覆盖 `--sg-color-primary` 后，浅色阶 / alpha / focus 光晕全部自动跟随，
   无需逐个覆盖；覆盖 EP 的 `--el-color-primary` 同样生效（经基色传导）。

4. **TS 侧颜色同样走 token**：JS 注入的内联样式（枚举标签三件套、筛选命中高亮、
   依赖图节点色）返回 `var(--sg-*)` 字符串，与 CSS 同源。

## 2. Token 分组速查

| 分组 | token（前缀 `--sg-`） | 默认值 / 说明 |
| --- | --- | --- |
| 品牌色 | `color-primary`（跟随 `--el-color-primary`）及 `-light-3/5/7/8/9`、`-dark-2`（color-mix 派生） | 覆盖基色即可整体换色 |
| 主色透明变体 | `color-primary-alpha-20` / `-alpha-40` | `color-mix(主色, transparent)`，focus 光晕用 |
| 功能色 | `color-success` / `color-warning` / `color-danger` / `color-info`（跟随 `--el-color-*`）及 `-light-3/8/9`（派生） | 同上 |
| 文字色 | `text-color-primary/regular/secondary/placeholder/disabled` | 跟随 `--el-text-color-*` |
| 反色文字 | `color-white` | `#ffffff`，彩色底之上的文字 |
| 高亮 | `color-highlight` / `color-on-highlight` | `#ffc107` / `#000000`，筛选命中荧光笔 |
| 边框色 | `border-color` / `-light` / `-lighter` / `-extra-light` | 跟随 `--el-border-color*` |
| 填充/背景 | `fill-color` / `-light` / `-lighter`、`bg-color`、`bg-color-page` | 跟随 `--el-*`；page 回退 `#f8fafc` |
| 骨架屏 | `skeleton-color` / `skeleton-highlight` | `#e0e0e0` / `#f0f0f0` |
| 字号 | `font-size-xs` 10px → `-3xl` 32px（共 8 档） | 基准 `base`=12px |
| 字体 | `font-family` | 引擎默认继承宿主，演示壳使用该 token |
| 间距 | `spacing-1`=2px 起步的 2px 网格（1/2/3/4/5/6/7/8/10/12/16/20/24） | token 数值 = px ÷ 2 |
| 控件高度 | `size-sm/md/lg` = 24/28/32px | 新控件从档位取值 |
| 表格密度 | `table-row-height-{compact,default,large}` = 36/44/52px；`table-header-height-{compact,default,large}` = 41/49/57px；生效值别名 `table-row-height` / `table-header-height` | docs/19 F1；vxe 实际行高由 `tableDensity.ts` 数值表驱动，默认值由单测钉住 |
| 圆角 | `radius-xs/sm/md/lg/xl` = 2/3/4/6/8px；`round`=9999px；`circle`=50% | 默认 `md`=4px |
| 阴影 | `shadow-sm/md/lg/xl` | 见 tokens.css |
| focus 光晕 | `shadow-focus` / `shadow-focus-strong` | 随主色联动 |
| 层叠 | `z-index-base/raised/sticky/overlay/topmost` = 1/2/10/100/1000 | EP 弹层从 2000 起 |
| 动效 | `duration-fast`=0.15s / `duration-normal`=0.2s | transition 引用 |

完整清单与精确值见 `src/styles/tokens.css`（含注释）。

## 3. 组件使用约定

```css
/* 正确 */
.tip { color: var(--sg-text-color-secondary); font-size: var(--sg-font-size-base); }
.card { padding: var(--sg-spacing-4); border: 1px solid var(--sg-border-color-light); }

/* 错误：字面量（review 直接打回） */
.tip { color: #909399; font-size: 12px; }
```

- `color:`/`background:` 的取值必须是语义 token，不允许「顺手」用错组
  （如把边框色当背景色 token 用，除非语义确实是该色值）。
- 边框宽度（`1px`）与定位偏移（`top: -1px`）不属于间距体系，保持字面量。
- 宽高不在强制 token 范围内；控件高度优先用 `--sg-size-*` 档位。
- 新增 token：先在 `tokens.css` 登记并补注释，再更新本表。

## 4. 宿主接入方式

1. **跟随 EP 主题（推荐，零配置）**：宿主正常引入 Element Plus 并定制
   `--el-*`（或启用 `html.dark`），引擎自动跟随。
2. **覆盖 --sg- token**：宿主样式表中按 §1 示例覆盖即可；支持只覆盖部分。
3. **字段级颜色**：schema 中枚举 `color` 支持语义色调（`primary|success|warning|danger|info`）
   与任意 CSS 颜色；语义色调渲染走 token，宿主主题变更自动生效。

## 5. 存量迁移说明（2026-09 样式整理）

- 全库 700+ 处字面量已收敛为 token 引用；`scripts/tokenize_styles.py` 为一次性迁移脚本，留档备查。
- 历史上硬编码的是 element-ui（Vue2）旧色板（如 primary-light-3 `#66b1ff`），
  与实际依赖 EP 2.x 色板（`#79bbff`）存在漂移；本次统一到 EP 2.x 官方值。
- 归一化的近似色（视觉差 ≤ 一个色阶）：`#f0f7ff/#f0f9ff→primary-light-9`、
  `#bae6fd/#0ea5e9→primary 系`、`#999→text-color-secondary`、`#fdf6f6→danger-light-9`、
  `#e2e8f0→border-color-light`、`#f2f3f5→fill-color`、字号 `15px→lg(14px)`、
  圆角 `5px→4px / 7px、9px→8px`、阴影 9 种归并为 4 档 + 2 档 focus。
- **演示壳（`App.vue` 页面框架、`views/ModuleDemo.vue` 首屏装饰渐变）不属于引擎样式**，
  其装饰性渐变/发光保留字面量，不参与 token 化。
