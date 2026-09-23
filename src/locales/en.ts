/**
 * 引擎内置文案：en（英语，随版本增量覆盖）。
 * 与基准包同结构，仅维护已翻译 key；未覆盖 key 经 t() 回退 zh-CN 基准包。
 * 当前行号列覆盖为「#」（井号），其余文案宿主可经 registerLocale 继续补齐。
 */
export default {
  table: {
    rowNumber: '#',
  },
} as const
