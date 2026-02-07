import prisma from "@/lib/prisma"
import { createTRPCRouter, protectedProcedure } from "@/trpc/init"
import z from "zod"
import { TRPCError } from "@trpc/server"
import { Prisma } from "@/app/generated"

export const rolesRouter = createTRPCRouter({
  create: protectedProcedure("role.manage")
    .input(
      z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Check if role already exists (system roles are global, custom roles are company-scoped)
      const existingRoleWhere: Prisma.RoleWhereInput = { name: input.name }
      // System roles are unique globally, custom roles are unique per company
      // For now, we'll check if any role with this name exists (system or custom)
      // This prevents conflicts between system and custom roles
      const existingRole = await prisma.role.findFirst({
        where: existingRoleWhere,
      })

      if (existingRole) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Role with this name already exists",
        })
      }

      // Get current userId from context
      const createdById = ctx.userId

      // Create role
      const role = await prisma.role.create({
        data: {
          name: input.name,
          description: input.description || null,
          isSystem: false,
          createdById,
        },
        select: {
          id: true,
          name: true,
          description: true,
          isSystem: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      return {
        success: true,
        role,
      }
    }),

  update: protectedProcedure("role.manage")
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(2, "Name must be at least 2 characters").optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input

      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Check if role exists and belongs to same company (or is system role)
      const roleWhere: Prisma.RoleWhereInput = { id }
      // System roles are global, custom roles are company-scoped
      if (companyId) {
        roleWhere.OR = [
          { isSystem: true },
          {
            isSystem: false,
            createdBy: {
              companyId: companyId,
            },
          },
        ]
      }

      const existingRole = await prisma.role.findFirst({
        where: roleWhere,
      })

      if (!existingRole) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Role not found",
        })
      }

      // Check if role is system role (cannot edit system roles)
      if (existingRole.isSystem) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot edit system roles",
        })
      }

      // Verify custom role belongs to same company
      if (companyId && existingRole.createdById) {
        const creator = await prisma.user.findUnique({
          where: { id: existingRole.createdById },
          select: { companyId: true },
        })
        if (creator?.companyId !== companyId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only edit roles from your own company",
          })
        }
      }

      // If name is being updated, check for conflicts (system roles are global, custom roles are company-scoped)
      if (data.name && data.name !== existingRole.name) {
        // Check if any role with this name exists (system or custom from same company)
        const nameTakenWhere: Prisma.RoleWhereInput = { name: data.name }
        const nameTaken = await prisma.role.findFirst({
          where: nameTakenWhere,
        })

        if (nameTaken) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Role with this name already exists",
          })
        }
      }

      // Update role
      const role = await prisma.role.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          // If description is provided (even as empty string), set it to null if empty, otherwise use the value
          ...(data.description !== undefined && { 
            description: data.description.trim() === "" ? null : data.description.trim() 
          }),
        },
        select: {
          id: true,
          name: true,
          description: true,
          isSystem: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      return {
        success: true,
        role,
      }
    }),

  delete: protectedProcedure("role.manage")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Check if role exists and belongs to same company (or is system role)
      const roleWhere: Prisma.RoleWhereInput = { id: input.id }
      // System roles are global, custom roles are company-scoped
      if (companyId) {
        roleWhere.OR = [
          { isSystem: true },
          {
            isSystem: false,
            createdBy: {
              companyId: companyId,
            },
          },
        ]
      }

      const existingRole = await prisma.role.findFirst({
        where: roleWhere,
      })

      if (!existingRole) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Role not found",
        })
      }

      // Check if role is system role (cannot delete system roles)
      if (existingRole.isSystem) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete system roles",
        })
      }

      // Verify custom role belongs to same company
      if (companyId && existingRole.createdById) {
        const creator = await prisma.user.findUnique({
          where: { id: existingRole.createdById },
          select: { companyId: true },
        })
        if (creator?.companyId !== companyId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only delete roles from your own company",
          })
        }
      }

      // Check if role has any users assigned in the same company (by checking if any users have this role name)
      // Note: This is a basic check - in a real system, you might want to check RolePermission relationships
      const roleNameUpper = existingRole.name.toUpperCase().replace(/\s+/g, '_')
      const validRoles: Array<'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'USER' | 'AUDITOR'> = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER', 'AUDITOR']
      if (validRoles.includes(roleNameUpper as 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'USER' | 'AUDITOR')) {
        const userWhere: Prisma.UserWhereInput = {
          role: roleNameUpper as 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'USER' | 'AUDITOR',
        }
        if (companyId) {
          userWhere.companyId = companyId
        }
        const userCount = await prisma.user.count({
          where: userWhere,
        })
        if (userCount > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Cannot delete role. ${userCount} user(s) in your company are assigned to this role.`,
          })
        }
      } else {
        // For custom roles, check users in same company
        const userWhere: Prisma.UserWhereInput = {
          role: existingRole.name,
        }
        if (companyId) {
          userWhere.companyId = companyId
        }
        const userCount = await prisma.user.count({
          where: userWhere,
        })
        if (userCount > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Cannot delete role. ${userCount} user(s) in your company are assigned to this role.`,
          })
        }
      }

      // Delete role (this will cascade delete RolePermission records)
      await prisma.role.delete({
        where: { id: input.id },
      })

      return {
        success: true,
      }
    }),

  getAssignableRoles: protectedProcedure("user.create")
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Get system roles from database
      const systemRoles = await prisma.role.findMany({
        where: {
          isSystem: true,
        },
        select: {
          name: true,
          description: true,
        },
        orderBy: {
          name: "asc",
        },
      })

      // Get custom roles from same company (not just created by current user)
      const customRolesWhere: Prisma.RoleWhereInput = {
        isSystem: false,
      }
      if (companyId) {
        customRolesWhere.createdBy = {
          companyId: companyId,
        }
      } else {
        // If no company, only show roles created by current user
        customRolesWhere.createdById = ctx.userId
      }

      const customRoles = await prisma.role.findMany({
        where: customRolesWhere,
        select: {
          name: true,
          description: true,
        },
        orderBy: {
          name: "asc",
        },
      })

      // Helper function to format display name (convert SUPER_ADMIN to "Super Admin")
      const formatDisplayName = (name: string): string => {
        return name
          .split("_")
          .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
          .join(" ")
      }

      return {
        roles: [
          // Filter out SUPER_ADMIN - it can only be assigned during sign up
          ...systemRoles
            .filter((role) => role.name !== "SUPER_ADMIN")
            .map((role) => ({
              name: role.name,
              displayName: formatDisplayName(role.name),
              isSystem: true,
              description: role.description,
            })),
          ...customRoles.map((role) => ({
            name: role.name,
            displayName: role.name,
            isSystem: false,
            description: role.description,
          })),
        ],
      }
    }),

  stats: protectedProcedure("role.manage")
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Build where clause - filter roles by company through createdBy user
      const where: Prisma.RoleWhereInput = {
        OR: [
          { isSystem: true },
        ],
      }
      
      if (companyId) {
        where.OR.push({
          isSystem: false,
          createdBy: {
            companyId: companyId,
          },
        })
      } else {
        // If no company, only show system roles and roles created by current user
        where.OR.push({
          isSystem: false,
          createdById: ctx.userId,
        })
      }

      const [total, system, custom, permissions] = await Promise.all([
        prisma.role.count({ where }),
        prisma.role.count({
          where: { isSystem: true },
        }),
        prisma.role.count({
          where: {
            isSystem: false,
            ...(companyId ? {
              createdBy: {
                companyId: companyId,
              },
            } : {
              createdById: ctx.userId,
            }),
          },
        }),
        prisma.permission.count(),
      ])

      return {
        total,
        system,
        custom,
        permissions,
      }
    }),

  list: protectedProcedure("role.manage")
    .input(
      z
        .object({
          page: z.number().min(1).default(1),
          pageSize: z.number().min(1).max(100).default(100),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const page = input?.page ?? 1
      const pageSize = input?.pageSize ?? 100
      const skip = (page - 1) * pageSize

      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Build where clause - filter roles by company through createdBy user
      const where: Prisma.RoleWhereInput = {
        OR: [
          { isSystem: true },
        ],
      }
      
      if (companyId) {
        where.OR.push({
          isSystem: false,
          createdBy: {
            companyId: companyId,
          },
        })
      } else {
        // If no company, only show system roles and roles created by current user
        where.OR.push({
          isSystem: false,
          createdById: ctx.userId,
        })
      }

      const [roles, total] = await Promise.all([
        prisma.role.findMany({
          where,
          select: {
            id: true,
            name: true,
            description: true,
            isSystem: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          skip,
          take: pageSize,
        }),
        prisma.role.count({ where }),
      ])

      // Count users for each role - filter by company
      // Since User.role is now a string, we can match both system and custom roles
      const rolesWithUserCount = await Promise.all(
        roles.map(async (role) => {
          // Count users with this role name in the same company
          const userWhere: Prisma.UserWhereInput = {
            role: role.name, // Match exact role name
          }
          
          if (companyId) {
            userWhere.companyId = companyId
          }

          const userCount = await prisma.user.count({
            where: userWhere,
          })
          
          return {
            ...role,
            users: userCount,
            createdAt: role.createdAt.toISOString(),
          }
        })
      )

      return {
        roles: rolesWithUserCount,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      }
    }),

  getPermissions: protectedProcedure("role.manage")
    .input(z.object({ roleId: z.string() }))
    .query(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Verify role belongs to same company (or is system role)
      const roleWhere: Prisma.RoleWhereInput = { id: input.roleId }
      if (companyId) {
        roleWhere.OR = [
          { isSystem: true },
          {
            isSystem: false,
            createdBy: {
              companyId: companyId,
            },
          },
        ]
      }

      const role = await prisma.role.findFirst({
        where: roleWhere,
      })

      if (!role) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Role not found",
        })
      }

      const rolePermissions = await prisma.rolePermission.findMany({
        where: { roleId: input.roleId },
        select: {
          permission: {
            select: {
              key: true,
            },
          },
        },
      })

      return {
        permissionKeys: rolePermissions.map((rp: { permission: { key: string } }) => rp.permission.key),
      }
    }),

  updatePermissions: protectedProcedure("role.manage")
    .input(
      z.object({
        roleId: z.string(),
        permissionKeys: z.array(z.string()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Verify role belongs to same company (or is system role)
      const roleWhere: Prisma.RoleWhereInput = { id: input.roleId }
      if (companyId) {
        roleWhere.OR = [
          { isSystem: true },
          {
            isSystem: false,
            createdBy: {
              companyId: companyId,
            },
          },
        ]
      }

      const role = await prisma.role.findFirst({
        where: roleWhere,
      })

      if (!role) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Role not found",
        })
      }

      // Cannot modify permissions for system roles
      if (role.isSystem) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot modify permissions for system roles",
        })
      }

      // Delete existing permissions
      await prisma.rolePermission.deleteMany({
        where: { roleId: input.roleId },
      })

      // Create new permissions by looking up IDs from keys
      if (input.permissionKeys.length > 0) {
        const permissions = await prisma.permission.findMany({
          where: { key: { in: input.permissionKeys } },
          select: { id: true },
        })

        await prisma.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: input.roleId,
            permissionId: permission.id,
          })),
        })
      }

      return {
        success: true,
      }
    }),

  getAllPermissions: protectedProcedure("role.manage").query(async () => {
    // Always ensure all default permissions exist (create missing ones)
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

    // Create missing permissions in database (skipDuplicates ensures existing ones aren't recreated)
    await prisma.permission.createMany({
      data: defaultPermissions,
      skipDuplicates: true,
    })

    // Fetch all permissions
    const permissions = await prisma.permission.findMany({
      orderBy: [
        { category: "asc" },
        { name: "asc" },
      ],
    })

    // Group by category
    const grouped = permissions.reduce(
      (acc: Record<string, Array<{ key: string; name: string; description: string }>>, permission: { id: string; key: string; name: string; description: string | null; category: string }) => {
        if (!acc[permission.category]) {
          acc[permission.category] = []
        }
        acc[permission.category].push({
          key: permission.key,
          name: permission.name,
          description: permission.description || "",
        })
        return acc
      },
      {} as Record<string, Array<{ key: string; name: string; description: string }>>
    )

    return Object.entries(grouped).map(([category, items]) => ({
      category,
      items,
    }))
  }),
})

