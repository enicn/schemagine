// appearance.ts —— 引擎外观契约的实例级下发通道（provide/inject）。
//
// SchemaEngineDialog 不在 SchemaEngine → ListView 的显式 prop 链上（由
// ListActionBar / FkSelector 等多处实例化），行号等外观开关经此 key 注入；
// 引擎树外直接使用 SchemaEngineDialog 时 inject 到缺省空对象，行为同关闭。
import type { ComputedRef, InjectionKey } from 'vue'
import type { EngineAppearance } from '@/types'

export const APPEARANCE_KEY: InjectionKey<ComputedRef<EngineAppearance>> = Symbol('sg-appearance')
