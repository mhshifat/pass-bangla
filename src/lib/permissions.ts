import prisma from "@/lib/prisma"
import { Prisma } from "@/app/generated"

/**
 * Get all permission keys for a user based on their role
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  // Get user's role and company
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, companyId: true },
  })

  if (!user || !user.role) {
    return []
  }

  return getRolePermissions(user.role, user.companyId)
}

/**
 * Get all permission keys for a role name, for callers that already loaded the user
 */
export async function getRolePermissions(
  roleName: string,
  companyId: string | null
): Promise<string[]> {
  // Find the role in the database (could be system or custom)
  // Filter by company: system roles are global, custom roles are company-specific
  const roleWhere: Prisma.RoleWhereInput = { name: roleName }
  if (companyId) {
    roleWhere.OR = [
      { isSystem: true }, // System roles are available to all companies
      {
        isSystem: false,
        createdBy: {
          companyId, // Custom roles are company-specific
        },
      },
    ]
  } else {
    // If user has no company, only allow system roles
    roleWhere.isSystem = true
  }

  const role = await prisma.role.findFirst({
    where: roleWhere,
    select: {
      permissions: {
        select: {
          permission: { select: { key: true } },
        },
      },
    },
  })

  if (!role) {
    return []
  }

  // Extract permission keys
  return role.permissions.map((rp) => rp.permission.key)
}

const ROLE_PERMISSIONS_TTL_MS = 60_000
const ROLE_PERMISSIONS_MAX_ENTRIES = 2_000

const rolePermissionsCache = new Map<string, { keys: string[]; at: number }>()
const rolePermissionsInFlight = new Map<string, Promise<string[]>>()
// Bumped on invalidation so a lookup that started before it cannot repopulate the cache
let rolePermissionsGeneration = 0

/**
 * getRolePermissions with a 60 second in-memory cache per `role|companyId`.
 *
 * Security trade-off: the cache is per server instance. A permission removed
 * from (or added to) a role applies immediately on the instance that calls
 * `invalidateRolePermissionsCache()`, but can take up to 60 seconds on other
 * warm instances. Changing which role a USER has is not affected: the user row
 * is read on every request. Empty results and failures are never cached.
 */
export async function getCachedRolePermissions(
  roleName: string,
  companyId: string | null
): Promise<string[]> {
  const cacheKey = `${roleName}|${companyId ?? ""}`
  const cached = rolePermissionsCache.get(cacheKey)
  if (cached && Date.now() - cached.at < ROLE_PERMISSIONS_TTL_MS) {
    return [...cached.keys]
  }

  let load = rolePermissionsInFlight.get(cacheKey)
  if (!load) {
    const startedAt = rolePermissionsGeneration
    const pending = getRolePermissions(roleName, companyId)
      .then((keys) => {
        if (keys.length > 0 && startedAt === rolePermissionsGeneration) {
          if (rolePermissionsCache.size >= ROLE_PERMISSIONS_MAX_ENTRIES) rolePermissionsCache.clear()
          rolePermissionsCache.set(cacheKey, { keys, at: Date.now() })
        }
        return keys
      })
      .finally(() => {
        if (rolePermissionsInFlight.get(cacheKey) === pending) rolePermissionsInFlight.delete(cacheKey)
      })
    rolePermissionsInFlight.set(cacheKey, pending)
    load = pending
  }

  return [...(await load)]
}

/** Drop cached role → permission keys. Call after any write to roles or role permissions. */
export function invalidateRolePermissionsCache(): void {
  rolePermissionsGeneration++
  rolePermissionsCache.clear()
  rolePermissionsInFlight.clear()
}

/**
 * Check if a user has a specific permission
 */
export async function hasPermission(
  userId: string,
  permissionKey: string
): Promise<boolean> {
  const permissions = await getUserPermissions(userId)
  return permissions.includes(permissionKey)
}

/**
 * Check if a user has any of the specified permissions
 */
export async function hasAnyPermission(
  userId: string,
  permissionKeys: string[]
): Promise<boolean> {
  const permissions = await getUserPermissions(userId)
  return permissionKeys.some((key) => permissions.includes(key))
}

/**
 * Check if a user has all of the specified permissions
 */
export async function hasAllPermissions(
  userId: string,
  permissionKeys: string[]
): Promise<boolean> {
  const permissions = await getUserPermissions(userId)
  return permissionKeys.every((key) => permissions.includes(key))
}

/**
 * Get user's role name
 */
export async function getUserRoleName(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })

  return user?.role || null
}

