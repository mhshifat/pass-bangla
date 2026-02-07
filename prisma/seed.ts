import { PrismaClient } from "../src/app/generated"
import { PrismaPg } from "@prisma/adapter-pg"
import * as dotenv from "dotenv"

// Load environment variables
dotenv.config()

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
})

const prisma = new PrismaClient({
  adapter,
})

async function main() {
  console.log("🌱 Seeding database...")

  // First, ensure permissions exist (they should be auto-created by getAllPermissions, but let's seed them here too)
  console.log("📝 Seeding permissions...")
  const defaultPermissions = [
    // User Management
    { key: "user.create", name: "Create Users", description: "Create new user accounts", category: "User Management" },
    { key: "user.edit", name: "Edit Users", description: "Modify user information", category: "User Management" },
    { key: "user.delete", name: "Delete Users", description: "Remove user accounts", category: "User Management" },
    { key: "user.view", name: "View Users", description: "View user information", category: "User Management" },
    // Password Management
    { key: "password.create", name: "Create Passwords", description: "Create new password entries", category: "Password Management" },
    { key: "password.edit", name: "Edit Passwords", description: "Modify password entries", category: "Password Management" },
    { key: "password.delete", name: "Delete Passwords", description: "Remove password entries", category: "Password Management" },
    { key: "password.view", name: "View Passwords", description: "View password entries", category: "Password Management" },
    { key: "password.share", name: "Share Passwords", description: "Share passwords with others", category: "Password Management" },
    // Team Management
    { key: "team.create", name: "Create Teams", description: "Create new teams", category: "Team Management" },
    { key: "team.edit", name: "Edit Teams", description: "Modify team settings", category: "Team Management" },
    { key: "team.delete", name: "Delete Teams", description: "Remove teams", category: "Team Management" },
    { key: "team.view", name: "View Teams", description: "View team information", category: "Team Management" },
    // System Settings
    { key: "settings.view", name: "View Settings", description: "View system settings", category: "System Settings" },
    { key: "settings.edit", name: "Edit Settings", description: "Modify system settings", category: "System Settings" },
    { key: "audit.view", name: "View Audit Logs", description: "Access audit logs", category: "System Settings" },
    { key: "role.manage", name: "Manage Roles", description: "Create and edit roles", category: "System Settings" },
    // Reports
    { key: "report.view", name: "View Reports", description: "View and access reports", category: "Reports" },
    { key: "report.create", name: "Create Reports", description: "Create and generate reports", category: "Reports" },
    { key: "report.update", name: "Update Reports", description: "Modify report configurations", category: "Reports" },
    { key: "report.delete", name: "Delete Reports", description: "Remove reports", category: "Reports" },
  ]

  // Create permissions if they don't exist
  for (const permission of defaultPermissions) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {},
      create: permission,
    })
  }
  console.log(`  ✓ ${defaultPermissions.length} permissions ready`)

  // Get all permissions for assignment
  const allPermissions = await prisma.permission.findMany()
  const permissionMap = new Map(allPermissions.map((p) => [p.key, p.id]))

  // Define system roles with their permissions
  const systemRoles = [
    {
      name: "SUPER_ADMIN",
      description: "Super Administrator with ultimate system control - can manage roles and system settings",
      isSystem: true,
      permissions: [
        "user.create",
        "user.edit",
        "user.delete",
        "user.view",
        "password.create",
        "password.edit",
        "password.delete",
        "password.view",
        "password.share",
        "team.create",
        "team.edit",
        "team.delete",
        "team.view",
        "settings.view",
        "settings.edit",
        "audit.view",
        "role.manage",
        "report.view",
        "report.create",
        "report.update",
        "report.delete",
      ],
    },
    {
      name: "ADMIN",
      description: "Administrator with elevated permissions - can manage users and content, but cannot manage roles or edit system settings",
      isSystem: true,
      permissions: [
        "user.create",
        "user.edit",
        "user.delete",
        "user.view",
        "password.create",
        "password.edit",
        "password.delete",
        "password.view",
        "password.share",
        "team.create",
        "team.edit",
        "team.delete",
        "team.view",
        "settings.view",
        "audit.view",
        "report.view",
        "report.create",
        // Note: ADMIN cannot edit settings or manage roles (SUPER_ADMIN only)
      ],
    },
    {
      name: "MANAGER",
      description: "Manager with management permissions",
      isSystem: true,
      permissions: [
        "user.view",
        "user.edit",
        "password.create",
        "password.edit",
        "password.delete",
        "password.view",
        "password.share",
        "team.create",
        "team.edit",
        "team.delete",
        "team.view",
        "settings.view",
        "audit.view",
        "report.view",
        "report.create",
      ],
    },
    {
      name: "USER",
      description: "Standard user with basic permissions",
      isSystem: true,
      permissions: [
        "user.view",
        "password.create",
        "password.edit",
        "password.delete",
        "password.view",
        "password.share",
        "team.view",
      ],
    },
    {
      name: "AUDITOR",
      description: "Auditor with read-only access to audit logs",
      isSystem: true,
      permissions: [
        "user.view",
        "password.view",
        "team.view",
        "settings.view",
        "audit.view",
        "report.view",
      ],
    },
  ]

  // Seed system roles and their permissions
  console.log("📝 Seeding system roles and permissions...")
  for (const roleData of systemRoles) {
    const { permissions, ...roleInfo } = roleData

    // Find existing system role (system roles have null companyId)
    const existingRole = await prisma.role.findFirst({
      where: { name: roleInfo.name, companyId: null, isSystem: true },
    })

    // Upsert role
    const role = existingRole
      ? await prisma.role.update({
          where: { id: existingRole.id },
          data: {
            description: roleInfo.description,
            isSystem: true, // Ensure it stays as system role
          },
        })
      : await prisma.role.create({
          data: {
            name: roleInfo.name,
            description: roleInfo.description,
            isSystem: true,
            createdById: null,
          },
        })

    // Get permission IDs for this role
    const permissionIds = permissions
      .map((key) => permissionMap.get(key))
      .filter((id): id is string => id !== undefined)

    // Delete existing permissions for this role (to allow re-seeding with updated permissions)
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id },
    })

    // Assign permissions to role
    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      })
      console.log(`  ✓ ${roleInfo.name} (${permissionIds.length} permissions)`)
    } else {
      console.log(`  ⚠ ${roleInfo.name} (no permissions found)`)
    }
  }

  console.log("✅ Seeding completed!")
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error("❌ Error seeding database:", e)
    await prisma.$disconnect()
    process.exit(1)
  })

