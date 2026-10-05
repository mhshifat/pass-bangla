import prisma from "@/lib/prisma"
import { invalidateRolePermissionsCache } from "@/lib/permissions"

const DEFAULT_PERMISSIONS = [
  { key: "user.create", name: "Create Users", description: "Create new user accounts", category: "User Management" },
  { key: "user.edit", name: "Edit Users", description: "Modify user information", category: "User Management" },
  { key: "user.delete", name: "Delete Users", description: "Remove user accounts", category: "User Management" },
  { key: "user.view", name: "View Users", description: "View user information", category: "User Management" },
  { key: "password.create", name: "Create Passwords", description: "Create new password entries", category: "Password Management" },
  { key: "password.edit", name: "Edit Passwords", description: "Modify password entries", category: "Password Management" },
  { key: "password.delete", name: "Delete Passwords", description: "Remove password entries", category: "Password Management" },
  { key: "password.view", name: "View Passwords", description: "View password entries", category: "Password Management" },
  { key: "password.share", name: "Share Passwords", description: "Share passwords with others", category: "Password Management" },
  { key: "team.create", name: "Create Teams", description: "Create new teams", category: "Team Management" },
  { key: "team.edit", name: "Edit Teams", description: "Modify team settings", category: "Team Management" },
  { key: "team.delete", name: "Delete Teams", description: "Remove teams", category: "Team Management" },
  { key: "team.view", name: "View Teams", description: "View team information", category: "Team Management" },
  { key: "settings.view", name: "View Settings", description: "View system settings", category: "System Settings" },
  { key: "settings.edit", name: "Edit Settings", description: "Modify system settings", category: "System Settings" },
  { key: "audit.view", name: "View Audit Logs", description: "Access audit logs", category: "System Settings" },
  { key: "role.manage", name: "Manage Roles", description: "Create and edit roles", category: "System Settings" },
  { key: "report.view", name: "View Reports", description: "View and access reports", category: "Reports" },
  { key: "report.create", name: "Create Reports", description: "Create and generate reports", category: "Reports" },
  { key: "report.update", name: "Update Reports", description: "Modify report configurations", category: "Reports" },
  { key: "report.delete", name: "Delete Reports", description: "Remove reports", category: "Reports" },
]

const SYSTEM_ROLES = [
  {
    name: "SUPER_ADMIN",
    description: "Super Administrator with ultimate system control - can manage roles and system settings",
    permissions: DEFAULT_PERMISSIONS.map((p) => p.key),
  },
  {
    name: "ADMIN",
    description: "Administrator with elevated permissions - can manage users and content, but cannot manage roles or edit system settings",
    permissions: [
      "user.create", "user.edit", "user.delete", "user.view",
      "password.create", "password.edit", "password.delete", "password.view", "password.share",
      "team.create", "team.edit", "team.delete", "team.view",
      "settings.view", "audit.view",
      "report.view", "report.create",
    ],
  },
  {
    name: "MANAGER",
    description: "Manager with management permissions",
    permissions: [
      "user.view", "user.edit",
      "password.create", "password.edit", "password.delete", "password.view", "password.share",
      "team.create", "team.edit", "team.delete", "team.view",
      "settings.view", "audit.view",
      "report.view", "report.create",
    ],
  },
  {
    name: "USER",
    description: "Standard user with basic permissions",
    permissions: [
      "user.view",
      "password.create", "password.edit", "password.delete", "password.view", "password.share",
      "team.view",
    ],
  },
  {
    name: "AUDITOR",
    description: "Auditor with read-only access to audit logs",
    permissions: ["user.view", "password.view", "team.view", "settings.view", "audit.view", "report.view"],
  },
]

/**
 * Makes sure the default permissions and the five global system roles exist.
 * One parallel check up front; when everything is there nothing is written.
 * Seeding is additive and runs in one transaction: it never deletes or rewrites
 * role-permission rows, so other tenants always see their roles' permissions.
 */
export async function ensureSystemRolesExist(): Promise<void> {
  const roleNames = SYSTEM_ROLES.map((r) => r.name)
  const [permissions, roles] = await Promise.all([
    prisma.permission.findMany({ select: { id: true, key: true } }),
    prisma.role.findMany({
      where: { name: { in: roleNames }, companyId: null, isSystem: true },
      select: { id: true, name: true, _count: { select: { permissions: true } } },
    }),
  ])

  const existingKeys = new Set(permissions.map((p) => p.key))
  const missingPermissions = DEFAULT_PERMISSIONS.filter((p) => !existingKeys.has(p.key))
  const rolesByName = new Map(roles.map((r) => [r.name, r]))
  const complete =
    missingPermissions.length === 0 &&
    SYSTEM_ROLES.every((r) => (rolesByName.get(r.name)?._count.permissions ?? 0) > 0)
  if (complete) return

  await prisma.$transaction(async (tx) => {
    if (missingPermissions.length > 0) {
      await tx.permission.createMany({ data: missingPermissions, skipDuplicates: true })
    }
    const permissionIds = new Map(
      (await tx.permission.findMany({ select: { id: true, key: true } })).map((p) => [p.key, p.id])
    )
    const newKeys = new Set(missingPermissions.map((p) => p.key))

    const rows: { roleId: string; permissionId: string }[] = []
    for (const def of SYSTEM_ROLES) {
      const existing = rolesByName.get(def.name)
      const roleId =
        existing?.id ??
        (
          await tx.role.create({
            data: { name: def.name, description: def.description, isSystem: true, createdById: null },
            select: { id: true },
          })
        ).id
      // A new or empty role gets its full default set; an existing one only the permissions that are new
      const isEmpty = !existing || existing._count.permissions === 0
      for (const key of def.permissions) {
        const permissionId = permissionIds.get(key)
        if (permissionId && (isEmpty || newKeys.has(key))) rows.push({ roleId, permissionId })
      }
    }
    if (rows.length > 0) {
      await tx.rolePermission.createMany({ data: rows, skipDuplicates: true })
    }
  })

  invalidateRolePermissionsCache()
}
