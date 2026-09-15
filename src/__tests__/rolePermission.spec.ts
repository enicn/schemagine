import { describe, expect, it } from 'vitest'
import { resolveRoleOverride } from '@/utils/rolePermission'

describe('resolveRoleOverride（docs/19 G3 roleBased）', () => {
  it('未声明 roleBased / 无角色 → undefined（走基础判定）', () => {
    expect(resolveRoleOverride(undefined, ['manager'])).toBeUndefined()
    expect(resolveRoleOverride({ manager: true }, undefined)).toBeUndefined()
    expect(resolveRoleOverride({ manager: true }, [])).toBeUndefined()
  })

  it('命中 true → 放行（可覆盖基础 visible/editable=false）', () => {
    expect(resolveRoleOverride({ manager: true }, ['manager'])).toBe(true)
    expect(resolveRoleOverride({ manager: true }, ['staff', 'manager'])).toBe(true)
  })

  it('命中 false → 拒绝（deny 优先，多角色叠加最严者胜）', () => {
    expect(resolveRoleOverride({ intern: false }, ['intern'])).toBe(false)
    expect(resolveRoleOverride({ manager: true, intern: false }, ['manager', 'intern'])).toBe(false)
  })

  it('角色未命中任何 key → undefined', () => {
    expect(resolveRoleOverride({ manager: true }, ['staff'])).toBeUndefined()
    expect(resolveRoleOverride({ manager: false }, ['staff'])).toBeUndefined()
  })

  it('usePermission 判定语义：roleBased 覆盖基础权限（语义锚定测试，经 resolveRoleOverride 组合复现）', () => {
    // 基础 editable=false + 命中 true → 可编辑
    const baseEditable = false
    const override = resolveRoleOverride({ admin: true }, ['admin'])
    const editable = override === true ? true : baseEditable
    expect(editable).toBe(true)
    // 基础 editable=true + 命中 false → 不可编辑
    const override2 = resolveRoleOverride({ intern: false }, ['intern'])
    expect(override2 === false ? false : true).toBe(false)
  })
})
