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

  // Find the role in the database (could be system or custom)
  // Filter by company: system roles are global, custom roles are company-specific
  const roleWhere: Prisma.RoleWhereInput = { name: user.role }
  if (user.companyId) {
    roleWhere.OR = [
      { isSystem: true }, // System roles are available to all companies
      {
        isSystem: false,
        createdBy: {
          companyId: user.companyId, // Custom roles are company-specific
        },
      },
    ]
  } else {
    // If user has no company, only allow system roles
    roleWhere.isSystem = true
  }

  const role = await prisma.role.findFirst({
    where: roleWhere,
    include: {
      permissions: {
        include: {
          permission: true,
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

