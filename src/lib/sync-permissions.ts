import prisma from "@/lib/prisma"
import { Prisma } from "@/app/generated"

/**
 * Sync all permissions and update system roles
 * This ensures all permissions exist and system roles have the correct permissions
 */
export async function syncPermissionsAndRoles() {
  // Define all default permissions
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

  // Create missing permissions
  await prisma.permission.createMany({
    data: defaultPermissions,
    skipDuplicates: true,
  })

  // Get all permissions
  const allPermissions = await prisma.permission.findMany()
  const permissionMap = new Map(allPermissions.map((p) => [p.key, p.id]))

  // Define system roles with their permissions
  const systemRoles = [
    {
      name: "SUPER_ADMIN",
      description: "Super Administrator with ultimate system control - can manage roles and system settings",
      permissions: [
        "user.create", "user.edit", "user.delete", "user.view",
        "password.create", "password.edit", "password.delete", "password.view", "password.share",
        "team.create", "team.edit", "team.delete", "team.view",
        "settings.view", "settings.edit", "audit.view", "role.manage",
        "report.view", "report.create", "report.update", "report.delete",
      ],
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

  // Update each system role
  for (const roleData of systemRoles) {
    const { permissions, ...roleInfo } = roleData

    // Create or update the role
    const role = await prisma.role.upsert({
      where: { name: roleInfo.name },
      update: {
        description: roleInfo.description,
        isSystem: true,
      },
      create: {
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

    // Delete existing permissions for this role (to ensure correct permissions)
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id },
    })

    // Assign permissions
    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      })
    }
  }

  // Seed system report templates
  await seedSystemReportTemplates()

  return { success: true, message: "Permissions and roles synced successfully" }
}

/**
 * Seed system report templates (SOC2, ISO27001, etc.)
 */
export async function seedSystemReportTemplates() {
  // NOTE: This function is for system initialization and intentionally queries
  // across companies to find a system user. This is expected for setup.
  // Get a system user (SUPER_ADMIN) to use as creator, or find any user
  let systemUser = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
  })

  // If no SUPER_ADMIN exists, find any user
  // NOTE: Intentionally queries across companies for system setup
  if (!systemUser) {
    systemUser = await prisma.user.findFirst({
      select: { id: true },
    })
  }

  // If still no user exists, we can't create templates (need at least one user)
  if (!systemUser) {
    console.warn("No users found - cannot create system report templates")
    return
  }

  const systemTemplates = [
    {
      name: "SOC2 Compliance Report",
      description: "Generate a SOC2 Type II compliance report covering security, availability, processing integrity, confidentiality, and privacy controls",
      reportType: "SOC2",
      category: "COMPLIANCE",
      isSystem: true,
      isPublic: true,
      config: {
        filters: {
          dateRange: {
            // Default to last 90 days
            start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            end: new Date(),
          },
        },
        format: "PDF",
      },
    },
    {
      name: "ISO27001 Compliance Report",
      description: "Generate an ISO/IEC 27001:2022 compliance report covering access control, cryptography, and incident management",
      reportType: "ISO27001",
      category: "COMPLIANCE",
      isSystem: true,
      isPublic: true,
      config: {
        filters: {
          dateRange: {
            // Default to last 90 days
            start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            end: new Date(),
          },
        },
        format: "PDF",
      },
    },
    {
      name: "Security Audit Report",
      description: "Generate a comprehensive security report including failed logins, blocked attempts, and threat events",
      reportType: "SECURITY",
      category: "SECURITY",
      isSystem: true,
      isPublic: true,
      config: {
        filters: {
          dateRange: {
            // Default to last 30 days
            start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            end: new Date(),
          },
        },
        format: "PDF",
      },
    },
    {
      name: "Audit Log Report",
      description: "Generate a detailed audit log report with all system activities",
      reportType: "AUDIT",
      category: "AUDIT",
      isSystem: true,
      isPublic: true,
      config: {
        filters: {
          dateRange: {
            // Default to last 30 days
            start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            end: new Date(),
          },
        },
        format: "CSV",
      },
    },
  ]

  // Create or update system templates
  for (const templateData of systemTemplates) {
    // Check if template already exists by name and isSystem
    const existing = await prisma.reportTemplate.findFirst({
      where: {
        name: templateData.name,
        isSystem: true,
      },
    })

    if (!existing && systemUser) {
      // Only create if it doesn't exist and we have a valid user
      await prisma.reportTemplate.create({
        data: {
          name: templateData.name,
          description: templateData.description,
          reportType: templateData.reportType,
          category: templateData.category,
          config: templateData.config as Prisma.JsonValue,
          isSystem: templateData.isSystem,
          isPublic: templateData.isPublic,
          userId: systemUser.id,
          companyId: null, // System templates are not company-specific
        },
      })
    }
  }
}



