/**
 * 角色覆盖判定（docs/19 批次 G3）：FieldPermission.roleBased 的语义。
 *
 * roleBased 形如 `{ manager: true, intern: false }`——key 为角色名，value 为
 * 覆盖性授权：
 *  - 命中任一 `false` → 拒绝（deny 优先，多角色叠加时最严者胜）；
 *  - 未命中 false 但命中 `true` → 放行（覆盖基础 visible/editable=false）；
 *  - 无角色命中或未声明 roleBased → undefined（走基础判定，不改变行为）。
 */
export function resolveRoleOverride(
  roleBased: Record<string, boolean> | undefined,
  currentRoles: string[] | undefined,
): boolean | undefined {
  if (!roleBased || !currentRoles || currentRoles.length === 0) return undefined
  let allow = false
  let hit = false
  for (const role of currentRoles) {
    const v = roleBased[role]
    if (v === false) return false
    if (v === true) {
      allow = true
      hit = true
    }
  }
  return hit ? allow : undefined
}
