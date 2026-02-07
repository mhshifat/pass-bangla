import prisma from "@/lib/prisma"
import { createTRPCRouter, protectedProcedure, baseProcedure } from "@/trpc/init"
import z from "zod"
import { hashPassword } from "@/lib/auth"
import { TRPCError } from "@trpc/server"
import { Prisma } from '@/app/generated'
import { getOrCreateCorrelationId } from "@/lib/correlation-id-util"

export const usersRouter = createTRPCRouter({
  create: protectedProcedure("user.create")
    .input(
      z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        email: z.string().email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
        role: z.string().min(1, "Role is required").default("USER"),
        mfaEnabled: z.boolean().default(false), // Default to false - only enforce if explicitly set or required by global settings
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Check if user already exists in this company
      const existingUser = await prisma.user.findFirst({
        where: { 
          email: input.email,
          companyId: companyId || null, // Check within the same company (or null if no company)
        },
      })

      if (existingUser) {
        const correlationId = getOrCreateCorrelationId(ctx)
        throw new TRPCError({
          code: "CONFLICT",
          message: `User with this email already exists in your company [Correlation ID: ${correlationId}]`,
          cause: { correlationId },
        })
      }

      // Validate password against security policies
      const { validatePassword } = await import("@/lib/password-validation")
      const validation = await validatePassword(input.password)
      if (!validation.isValid) {
        const correlationId = getOrCreateCorrelationId(ctx)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: validation.errors.join(". ") + ` [Correlation ID: ${correlationId}]`,
          cause: { correlationId },
        })
      }

      // Hash password
      const hashedPassword = await hashPassword(input.password)

      // Get current userId from context
      const createdById = ctx.userId;

      // Validate role - check if it's a valid system role or a custom role
      const validSystemRoles = ["SUPER_ADMIN", "ADMIN", "MANAGER", "USER", "AUDITOR"]
      let roleValue = input.role.toUpperCase()
      
      // Prevent assigning SUPER_ADMIN - it can only be assigned during sign up
      if (roleValue === "SUPER_ADMIN") {
        const correlationId = getOrCreateCorrelationId(ctx)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `SUPER_ADMIN role cannot be assigned. It can only be assigned during sign up. [Correlation ID: ${correlationId}]`,
          cause: { correlationId },
        })
      }
      
      if (!validSystemRoles.includes(roleValue)) {
        // Check if it's a custom role - must belong to same company
        const customRoleWhere: Prisma.RoleWhereInput = {
          name: input.role,
          isSystem: false,
        }
        if (companyId) {
          customRoleWhere.createdBy = {
            companyId: companyId,
          }
        } else if (ctx.userId) {
          // If no companyId, only allow roles created by current user
          customRoleWhere.createdById = ctx.userId
        }
        
        const customRole = await prisma.role.findFirst({
          where: customRoleWhere,
        })
        if (!customRole) {
          const correlationId = getOrCreateCorrelationId(ctx)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid role: ${input.role}. Role must be a system role or a custom role from your company. [Correlation ID: ${correlationId}]`,
            cause: { correlationId },
          })
        }
        // Use the custom role name as-is
        roleValue = input.role
      }

      // Create user
      const user = await prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          password: hashedPassword,
          role: roleValue,
          mfaEnabled: input.mfaEnabled,
          isActive: input.isActive,
          companyId,
          createdById,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          mfaEnabled: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "USER_CREATED",
        resource: "User",
        resourceId: user.id,
        details: { name: user.name, email: user.email, role: user.role },
        userId: ctx.userId,
      })

      return {
        success: true,
        user,
      }
    }),

  update: protectedProcedure("user.edit")
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(2).optional(),
        email: z.string().email().optional(),
        password: z.string().min(8).optional(),
        role: z.string().min(1).optional(),
        mfaEnabled: z.boolean().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, password, ...data } = input

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true, // Include email to check if it's being changed
          createdById: true,
          companyId: true, // Include companyId to check for email conflicts within same company
        },
      })

      if (!existingUser) {
        const correlationId = getOrCreateCorrelationId(ctx)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `User not found [Correlation ID: ${correlationId}]`,
          cause: { correlationId },
        })
      }

      // Use companyId from context (already fetched, no extra query needed)
      const requesterCompanyId = ctx.companyId

      // Verify user belongs to same company (unless SUPER_ADMIN)
      if (ctx.userRole !== "SUPER_ADMIN" && requesterCompanyId && existingUser.companyId !== requesterCompanyId) {
        const correlationId = getOrCreateCorrelationId(ctx)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You can only modify users from your own company [Correlation ID: ${correlationId}]`,
          cause: { correlationId },
        })
      }

      // Prevent users from modifying their creator (SUPER_ADMIN can modify anyone)
      if (ctx.userRole !== "SUPER_ADMIN" && existingUser.createdById === ctx.userId) {
        const correlationId = getOrCreateCorrelationId(ctx)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You cannot modify the user who created your account [Correlation ID: ${correlationId}]`,
          cause: { correlationId },
        })
      }

      // If email is being updated, check for conflicts (only if email actually changed)
      if (data.email && data.email !== existingUser.email) {
        // Check if email is taken within the same company
        const emailTaken = await prisma.user.findFirst({
          where: { 
            email: data.email,
            companyId: existingUser.companyId || null,
            id: { not: input.id }, // Exclude the current user
          },
        })

        if (emailTaken) {
          const correlationId = getOrCreateCorrelationId(ctx)
          throw new TRPCError({
            code: "CONFLICT",
            message: `Email already in use [Correlation ID: ${correlationId}]`,
            cause: { correlationId },
          })
        }
      }

      // Hash password if provided
      const updateData: Record<string, unknown> = { ...data }
      if (password) {
        // Validate password against security policies
        const { validatePassword } = await import("@/lib/password-validation")
        const validation = await validatePassword(password)
        if (!validation.isValid) {
          const correlationId = getOrCreateCorrelationId(ctx)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: validation.errors.join(". ") + ` [Correlation ID: ${correlationId}]`,
            cause: { correlationId },
          })
        }
        updateData.password = await hashPassword(password)
      }

      // Handle role update if provided
      if (data.role) {
        const validSystemRoles = ["SUPER_ADMIN", "ADMIN", "MANAGER", "USER", "AUDITOR"]
        let roleValue = data.role.toUpperCase()
        
        // Prevent assigning SUPER_ADMIN - it can only be assigned during sign up
        if (roleValue === "SUPER_ADMIN") {
          const correlationId = getOrCreateCorrelationId(ctx)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `SUPER_ADMIN role cannot be assigned. It can only be assigned during sign up. [Correlation ID: ${correlationId}]`,
            cause: { correlationId },
          })
        }
        
        if (!validSystemRoles.includes(roleValue)) {
          // Use companyId from context (already fetched, no extra query needed)
          const requesterCompanyId = ctx.companyId
          
          // Check if it's a custom role - must belong to same company
          const customRoleWhere: Prisma.RoleWhereInput = {
            name: data.role,
            isSystem: false,
          }
          if (requesterCompanyId) {
            customRoleWhere.createdBy = {
              companyId: requesterCompanyId,
            }
          } else if (ctx.userId) {
            // If no companyId, only allow roles created by current user
            customRoleWhere.createdById = ctx.userId
          }
          
          const customRole = await prisma.role.findFirst({
            where: customRoleWhere,
          })
          if (!customRole) {
            const correlationId = getOrCreateCorrelationId(ctx)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Invalid role: ${data.role}. Role must be a system role or a custom role from your company. [Correlation ID: ${correlationId}]`,
              cause: { correlationId },
            })
          }
          // Use the custom role name as-is
          roleValue = data.role
        }
        updateData.role = roleValue
      }

      // Update user
      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          mfaEnabled: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      const changedFields = Object.keys(data).filter(key => data[key as keyof typeof data] !== undefined)
      await createAuditLog({
        action: "USER_UPDATED",
        resource: "User",
        resourceId: user.id,
        details: { changedFields, email: user.email },
        userId: ctx.userId,
      })

      return {
        success: true,
        user,
      }
    }),

  delete: protectedProcedure("user.delete")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          createdById: true,
          companyId: true,
        },
      })

      if (!existingUser) {
        const correlationId = getOrCreateCorrelationId(ctx)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `User not found [Correlation ID: ${correlationId}]`,
          cause: { correlationId },
        })
      }

      // Use companyId from context (already fetched, no extra query needed)
      const requesterCompanyId = ctx.companyId

      // Verify user belongs to same company (unless SUPER_ADMIN)
      if (ctx.userRole !== "SUPER_ADMIN" && requesterCompanyId && existingUser.companyId !== requesterCompanyId) {
        const correlationId = getOrCreateCorrelationId(ctx)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You can only delete users from your own company [Correlation ID: ${correlationId}]`,
          cause: { correlationId },
        })
      }

      // Prevent users from deleting their creator (SUPER_ADMIN can delete anyone)
      if (ctx.userRole !== "SUPER_ADMIN" && existingUser.createdById === ctx.userId) {
        const correlationId = getOrCreateCorrelationId(ctx)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You cannot delete the user who created your account [Correlation ID: ${correlationId}]`,
          cause: { correlationId },
        })
      }

      // Create audit log before deletion
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "USER_DELETED",
        resource: "User",
        resourceId: input.id,
        userId: ctx.userId,
      })

      // Delete user
      await prisma.user.delete({
        where: { id: input.id },
      })

      return {
        success: true,
      }
    }),

  // Change own password - requires current password
  changeOwnPassword: baseProcedure
    .use(async ({ ctx, next }) => {
      // Check if user is authenticated
      if (!ctx.userId) {
        const correlationId = getOrCreateCorrelationId(ctx)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: `You must be logged in to change your password [Correlation ID: ${correlationId}]`,
          cause: { correlationId },
        })
      }
      return next({ ctx })
    })
    .input(z.object({ 
      currentPassword: z.string().min(1, "Current password is required"),
      newPassword: z.string().min(8, "Password must be at least 8 characters")
    }))
    .mutation(async ({ input, ctx }) => {
      // Get current user
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: {
          id: true,
          password: true,
        },
      })

      if (!user) {
        const correlationId = getOrCreateCorrelationId(ctx)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `User not found [Correlation ID: ${correlationId}]`,
          cause: { correlationId },
        })
      }

      // Verify current password
      if (!user.password) {
        const correlationId = getOrCreateCorrelationId(ctx)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `User does not have a password set [Correlation ID: ${correlationId}]`,
          cause: { correlationId },
        })
      }

      const { verifyPassword } = await import("@/lib/auth")
      const isCurrentPasswordValid = await verifyPassword(input.currentPassword, user.password)

      if (!isCurrentPasswordValid) {
        const correlationId = getOrCreateCorrelationId(ctx)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: `Current password is incorrect [Correlation ID: ${correlationId}]`,
          cause: { correlationId },
        })
      }

      // Check if new password is same as current
      const isSamePassword = await verifyPassword(input.newPassword, user.password)

      if (isSamePassword) {
        const correlationId = getOrCreateCorrelationId(ctx)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `New password must be different from current password [Correlation ID: ${correlationId}]`,
          cause: { correlationId },
        })
      }

      // Validate new password against security policies
      const { validatePassword } = await import("@/lib/password-validation")
      const validation = await validatePassword(input.newPassword)
      if (!validation.isValid) {
        const correlationId = getOrCreateCorrelationId(ctx)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: validation.errors.join(". ") + ` [Correlation ID: ${correlationId}]`,
          cause: { correlationId },
        })
      }

      // Hash the new password
      const hashedPassword = await hashPassword(input.newPassword)

      // Update user password
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "PASSWORD_RESET",
        resource: "User",
        resourceId: user.id,
        details: { changedBy: "self" },
        userId: ctx.userId,
      })

      return {
        success: true,
      }
    }),

  resetPassword: protectedProcedure("user.edit")
    .input(z.object({ 
      id: z.string(),
      currentPassword: z.string().optional(), // Optional for admins
      newPassword: z.string().min(8, "Password must be at least 8 characters")
    }))
    .mutation(async ({ input, ctx }) => {
      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          password: true,
          createdById: true,
          companyId: true,
        },
      })

      if (!existingUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        })
      }

      // Check if user is resetting their own password
      const isResettingOwnPassword = existingUser.id === ctx.userId

      // Use companyId from context (already fetched, no extra query needed)
      const requesterCompanyId = ctx.companyId

      // If not resetting own password, check permissions and company
      if (!isResettingOwnPassword) {
        // Verify user belongs to same company (unless SUPER_ADMIN)
        if (ctx.userRole !== "SUPER_ADMIN" && requesterCompanyId && existingUser.companyId !== requesterCompanyId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only reset passwords for users from your own company",
          })
        }
        
        // Prevent users from resetting their creator's password (SUPER_ADMIN can reset anyone's password)
        if (ctx.userRole !== "SUPER_ADMIN" && existingUser.createdById === ctx.userId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You cannot reset the password of the user who created your account",
          })
        }
      }
      
      // Admins don't need to provide current password (even for their own password)
      // If currentPassword is provided, we can optionally verify it, but it's not required

      // Check if new password is same as current (if password exists)
      if (existingUser.password) {
        const { verifyPassword } = await import("@/lib/auth")
        const isSamePassword = await verifyPassword(input.newPassword, existingUser.password)

        if (isSamePassword) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "New password must be different from current password",
          })
        }
      }

      // Validate new password against security policies
      const { validatePassword } = await import("@/lib/password-validation")
      const validation = await validatePassword(input.newPassword)
      if (!validation.isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: validation.errors.join(". "),
        })
      }

      // Hash the new password
      const hashedPassword = await hashPassword(input.newPassword)

      // Update user password
      await prisma.user.update({
        where: { id: input.id },
        data: { password: hashedPassword },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "PASSWORD_RESET",
        resource: "User",
        resourceId: input.id,
        details: { 
          changedBy: isResettingOwnPassword ? "self" : "admin",
          changedByUserId: ctx.userId,
        },
        userId: ctx.userId,
      })

      return {
        success: true,
      }
    }),

  list: protectedProcedure("user.view")
    .input(
      z
        .object({
          page: z.number().min(1).default(1),
          pageSize: z.number().min(1).max(100).default(10),
          excludeUserId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const page = input?.page ?? 1
      const pageSize = input?.pageSize ?? 10
      const skip = (page - 1) * pageSize

      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Build where clause - show all users in the same company
      const whereClause: Prisma.UserWhereInput = {};
      if (companyId) {
        whereClause.companyId = companyId;
      }
      if (input?.excludeUserId) {
        whereClause.id = { not: input.excludeUserId };
      }

      // Check if user has edit permission to see sensitive information
      const hasEditPermission = ctx.permissions.includes("user.edit");
      // Check if current user is SUPER_ADMIN (can see everything and perform all actions)
      const isSuperAdmin = ctx.userRole === "SUPER_ADMIN";

      const { limit } = await import("@/lib/p-limit");
      const [users, total] = await Promise.all([
        limit(() => prisma.user.findMany({
          where: whereClause,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdById: true, // Include to check if user can modify this user
            // Only include sensitive fields if user has edit permission
            ...(hasEditPermission ? {
              mfaEnabled: true,
              lastLoginAt: true,
            } : {}),
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          skip,
          take: pageSize,
        })),
        prisma.user.count({ where: whereClause }),
      ])

      // Filter out sensitive fields for creator users if not SUPER_ADMIN
      // SUPER_ADMIN can see everything, but other roles cannot see sensitive info about their creator
      const filteredUsers = users.map((user) => {
        // If current user is SUPER_ADMIN, return all fields as-is
        if (isSuperAdmin) {
          return user;
        }
        
        // If this user is the creator of the current user, remove sensitive fields
        if (user.createdById === ctx.userId && hasEditPermission) {
          return {
            ...user,
            mfaEnabled: undefined,
            lastLoginAt: undefined,
          };
        }
        
        return user;
      });

      return {
        users: filteredUsers,
        // Include flag to indicate if sensitive fields are included
        includeSensitiveFields: hasEditPermission,
        // Include flag to indicate if current user is SUPER_ADMIN
        isSuperAdmin,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      }
    }),

  sendEmail: protectedProcedure("user.edit")
    .input(
      z.object({
        userId: z.string(),
        subject: z.string().min(1, "Subject is required"),
        message: z.string().min(1, "Message is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get user email
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { 
          id: true,
          email: true, 
          name: true,
          createdById: true,
          companyId: true,
        },
      })

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        })
      }

      // Use companyId from context (already fetched, no extra query needed)
      const requesterCompanyId = ctx.companyId

      // Verify user belongs to same company (unless SUPER_ADMIN)
      if (ctx.userRole !== "SUPER_ADMIN" && requesterCompanyId && user.companyId !== requesterCompanyId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only send emails to users from your own company",
        })
      }

      // Prevent users from sending emails to their creator (SUPER_ADMIN can send emails to anyone)
      if (ctx.userRole !== "SUPER_ADMIN" && user.createdById === ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot send emails to the user who created your account",
        })
      }

      // Send email using nodemailer
      const { sendEmail } = await import("@/lib/mailer")
      const emailResult = await sendEmail({
        to: user.email,
        subject: input.subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">${input.subject}</h2>
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <p style="color: #555; white-space: pre-wrap;">${input.message}</p>
            </div>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">
              This email was sent from Password Storage application.
            </p>
          </div>
        `,
        text: input.message,
      })

      if (!emailResult.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: emailResult.error || "Failed to send email",
        })
      }

      // Create audit log for email sent
      await prisma.auditLog.create({
        data: {
          action: "EMAIL_SENT",
          resource: "User",
          userId: input.userId,
          resourceId: null,
          details: `Email sent to ${user.email}: ${input.subject}`,
        },
      })

      return { success: true }
    }),

  stats: protectedProcedure("user.view")
    .input(z.object({ excludeUserId: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const where: Prisma.UserWhereInput = {};
      if (companyId) {
        where.companyId = companyId;
      }
      if (input?.excludeUserId) {
        where.id = { not: input.excludeUserId };
      }
      const { limit } = await import("@/lib/p-limit");
      const [total, active, mfa, admins] = await Promise.all([
        limit(() => prisma.user.count({ where })),
        limit(() => prisma.user.count({ where: { ...where, isActive: true } })),
        limit(() => prisma.user.count({ where: { ...where, mfaEnabled: true } })),
        limit(() => prisma.user.count({ where: { ...where, role: { in: ["ADMIN", "admin"] } } })),
      ])
      return {
        total,
        active,
        mfa,
        admins,
      }
    }),

  // ========== Profile Management ==========

  getProfile: baseProcedure
    .use(async ({ ctx, next }) => {
      // Check if user is authenticated
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to view your profile",
        })
      }
      return next({ ctx })
    })
    .query(async ({ ctx }) => {
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          phoneNumber: true,
          bio: true,
          preferences: true,
          role: true,
          mfaEnabled: true,
          mfaMethod: true,
          createdAt: true,
          lastLoginAt: true,
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        })
      }

      return { user }
    }),

  updateProfile: baseProcedure
    .use(async ({ ctx, next }) => {
      // Check if user is authenticated
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to update your profile",
        })
      }
      return next({ ctx })
    })
    .input(
      z.object({
        name: z.string().min(2, "Name must be at least 2 characters").optional(),
        bio: z.string().max(500, "Bio must be less than 500 characters").optional().nullable(),
        phoneNumber: z.string().optional().nullable(),
        preferences: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { createAuditLog } = await import("@/lib/audit-log")

      const user = await prisma.user.update({
        where: { id: ctx.userId },
        data: {
          ...(input.name && { name: input.name }),
          ...(input.bio !== undefined && { bio: input.bio }),
          ...(input.phoneNumber !== undefined && { phoneNumber: input.phoneNumber }),
          ...(input.preferences && { preferences: input.preferences as Prisma.InputJsonValue }),
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          phoneNumber: true,
          bio: true,
          preferences: true,
        },
      })

      await createAuditLog({
        action: "PROFILE_UPDATED",
        resource: "User",
        resourceId: ctx.userId,
        userId: ctx.userId,
        details: "User profile updated",
      })

      return { user }
    }),

  updateAvatar: baseProcedure
    .use(async ({ ctx, next }) => {
      // Check if user is authenticated
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to update your avatar",
        })
      }
      return next({ ctx })
    })
    .input(
      z.object({
        imageUrl: z.string().url("Invalid image URL"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { createAuditLog } = await import("@/lib/audit-log")

      const user = await prisma.user.update({
        where: { id: ctx.userId },
        data: {
          image: input.imageUrl,
        },
        select: {
          id: true,
          image: true,
        },
      })

      await createAuditLog({
        action: "AVATAR_UPDATED",
        resource: "User",
        resourceId: ctx.userId,
        userId: ctx.userId,
        details: "User avatar updated",
      })

      return { user }
    }),

  getUserActivity: baseProcedure
    .use(async ({ ctx, next }) => {
      // Check if user is authenticated
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to view your activity",
        })
      }
      return next({ ctx })
    })
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const { page = 1, pageSize = 20 } = input as { page: number; pageSize: number }

      const where = {
        userId: ctx.userId,
      }

      // Import limit function at the top of the handler
      const pLimitModule = await import("@/lib/p-limit")
      const { limit } = pLimitModule
      
      const logsPromise: Promise<unknown> = limit(() => 
        prisma.auditLog.findMany({
          where,
          take: pageSize,
          skip: (page - 1) * pageSize,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            action: true,
            resource: true,
            resourceId: true,
            status: true,
            ipAddress: true,
            userAgent: true,
            createdAt: true,
            details: true,
          },
        })
      )
      
      const countPromise: Promise<number> = prisma.auditLog.count({ where })
      
      const [logs, total] = await Promise.all([logsPromise, countPromise])

      return {
        logs,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      }
    }),

  getUserStatistics: baseProcedure
    .use(async ({ ctx, next }) => {
      // Check if user is authenticated
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to view your statistics",
        })
      }
      return next({ ctx })
    })
    .query(async ({ ctx }) => {
      const [passwords, sharedPasswords, teams, auditLogs, lastLogin] = await Promise.all([
        prisma.password.count({
          where: { ownerId: ctx.userId },
        }),
        prisma.passwordShare.count({
          where: { userId: ctx.userId },
        }),
        prisma.teamMember.count({
          where: { userId: ctx.userId },
        }),
        prisma.auditLog.count({
          where: { userId: ctx.userId },
        }),
        prisma.user.findUnique({
          where: { id: ctx.userId },
          select: { lastLoginAt: true, createdAt: true },
        }),
      ])

      return {
        passwords,
        sharedPasswords,
        teams,
        auditLogs,
        lastLoginAt: lastLogin?.lastLoginAt,
        accountCreatedAt: lastLogin?.createdAt,
      }
    }),

  // ========== Session Management ==========

  listSessions: baseProcedure
    .use(async ({ ctx, next }) => {
      // Check if user is authenticated
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to view your sessions",
        })
      }
      return next({ ctx })
    })
    .query(async ({ ctx }) => {
      // Get current session token from cookie
      const { cookies } = await import("next/headers")
      const cookieStore = await cookies()
      const currentSessionToken = cookieStore.get("session")?.value

      const sessions = await prisma.session.findMany({
        where: {
          userId: ctx.userId,
          expires: {
            gt: new Date(), // Only active sessions
          },
        },
        orderBy: {
          lastActiveAt: "desc",
        },
        select: {
          id: true,
          sessionToken: true,
          ipAddress: true,
          userAgent: true,
          deviceName: true,
          deviceType: true,
          deviceFingerprint: true,
          isTrusted: true,
          requireMfa: true,
          lastActiveAt: true,
          createdAt: true,
          expires: true,
        },
      })

      // Find current session ID by matching the session token
      const currentSessionId = currentSessionToken
        ? sessions.find((s) => s.sessionToken === currentSessionToken)?.id || null
        : null

      return { sessions, currentSessionId }
    }),

  revokeSession: baseProcedure
    .use(async ({ ctx, next }) => {
      // Check if user is authenticated
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to revoke sessions",
        })
      }
      return next({ ctx })
    })
    .input(
      z.object({
        sessionId: z.string().min(1, "Session ID is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { createAuditLog } = await import("@/lib/audit-log")

      // Verify session belongs to user
      const session = await prisma.session.findFirst({
        where: {
          id: input.sessionId,
          userId: ctx.userId,
        },
      })

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        })
      }

      // Delete session
      await prisma.session.delete({
        where: { id: input.sessionId },
      })

      await createAuditLog({
        action: "SESSION_REVOKED",
        resource: "Session",
        resourceId: input.sessionId,
        userId: ctx.userId,
        details: `Session revoked: ${session.deviceName || "Unknown Device"}`,
      })

      return { success: true }
    }),

  revokeAllSessions: baseProcedure
    .use(async ({ ctx, next }) => {
      // Check if user is authenticated
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to revoke sessions",
        })
      }
      return next({ ctx })
    })
    .mutation(async ({ ctx }) => {
      const { createAuditLog } = await import("@/lib/audit-log")

      // Get current session token from cookie
      const { cookies } = await import("next/headers")
      const cookieStore = await cookies()
      const currentSessionToken = cookieStore.get("session")?.value

      // Get all active sessions for the user
      const allSessions = await prisma.session.findMany({
        where: {
          userId: ctx.userId,
          expires: { gt: new Date() },
        },
        select: { id: true, sessionToken: true },
      })

      // Find current session ID by matching the session token
      const currentSessionId = currentSessionToken
        ? allSessions.find((s) => s.sessionToken === currentSessionToken)?.id
        : null

      // Delete all sessions except the current one
      const deleted = await prisma.session.deleteMany({
        where: {
          userId: ctx.userId,
          ...(currentSessionId ? {
            id: { not: currentSessionId },
          } : {}),
        },
      })

      await createAuditLog({
        action: "ALL_SESSIONS_REVOKED",
        resource: "Session",
        resourceId: null,
        userId: ctx.userId,
        details: `All sessions revoked except current (${deleted.count} sessions deleted)`,
      })

      return { success: true, revokedCount: deleted.count }
    }),

  markSessionAsTrusted: baseProcedure
    .use(async ({ ctx, next }) => {
      // Check if user is authenticated
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to mark sessions as trusted",
        })
      }
      return next({ ctx })
    })
    .input(
      z.object({
        sessionId: z.string().min(1, "Session ID is required"),
        isTrusted: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify session belongs to user
      const session = await prisma.session.findFirst({
        where: {
          id: input.sessionId,
          userId: ctx.userId,
        },
      })

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        })
      }

      // If marking as trusted, also trust all sessions with the same device fingerprint
      if (input.isTrusted && session.deviceFingerprint) {
        await prisma.session.updateMany({
          where: {
            userId: ctx.userId,
            deviceFingerprint: session.deviceFingerprint,
          },
          data: { isTrusted: true },
        })
      } else {
        // If untrusting, only untrust this specific session
        await prisma.session.update({
          where: { id: input.sessionId },
          data: { isTrusted: false },
        })
      }

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      const { getRequestMetadata } = await import("@/lib/audit-log")
      const headersList = await import("next/headers").then((m) => m.headers())
      const { ipAddress, userAgent } = getRequestMetadata(headersList)

      await createAuditLog({
        action: input.isTrusted ? "DEVICE_TRUSTED" : "DEVICE_UNTRUSTED",
        resource: "Session",
        resourceId: input.sessionId,
        userId: ctx.userId,
        ipAddress,
        userAgent,
        details: {
          deviceName: session.deviceName,
          deviceFingerprint: session.deviceFingerprint,
        },
      })

      return { success: true }
    }),

  // Get trusted devices list
  getTrustedDevices: baseProcedure
    .use(async ({ ctx, next }) => {
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to view trusted devices",
        })
      }
      return next({ ctx })
    })
    .query(async ({ ctx }) => {
      // Get unique trusted devices by fingerprint
      const trustedSessions = await prisma.session.findMany({
        where: {
          userId: ctx.userId,
          isTrusted: true,
          deviceFingerprint: { not: null },
          expires: {
            gt: new Date(), // Only active sessions
          },
        },
        orderBy: {
          lastActiveAt: "desc",
        },
        distinct: ["deviceFingerprint"],
        select: {
          id: true,
          deviceFingerprint: true,
          deviceName: true,
          deviceType: true,
          ipAddress: true,
          userAgent: true,
          lastActiveAt: true,
          createdAt: true,
        },
      })

      // Get count of sessions per device
      const deviceCounts = await Promise.all(
        trustedSessions.map(async (session) => {
          if (!session.deviceFingerprint) return { fingerprint: null, count: 0 }
          const count = await prisma.session.count({
            where: {
              userId: ctx.userId,
              deviceFingerprint: session.deviceFingerprint,
              isTrusted: true,
            },
          })
          return { fingerprint: session.deviceFingerprint, count }
        })
      )

      const devicesWithCounts = trustedSessions.map((session) => {
        const count = deviceCounts.find(
          (c) => c.fingerprint === session.deviceFingerprint
        )?.count || 0
        return {
          ...session,
          sessionCount: count,
        }
      })

      return { devices: devicesWithCounts }
    }),

  // Trust all devices with the same fingerprint
  trustDeviceByFingerprint: baseProcedure
    .use(async ({ ctx, next }) => {
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to trust devices",
        })
      }
      return next({ ctx })
    })
    .input(
      z.object({
        deviceFingerprint: z.string().min(1, "Device fingerprint is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify at least one session with this fingerprint belongs to user
      const session = await prisma.session.findFirst({
        where: {
          userId: ctx.userId,
          deviceFingerprint: input.deviceFingerprint,
        },
      })

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found",
        })
      }

      // Trust all sessions with this fingerprint
      const result = await prisma.session.updateMany({
        where: {
          userId: ctx.userId,
          deviceFingerprint: input.deviceFingerprint,
        },
        data: { isTrusted: true },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      const { getRequestMetadata } = await import("@/lib/audit-log")
      const headersList = await import("next/headers").then((m) => m.headers())
      const { ipAddress, userAgent } = getRequestMetadata(headersList)

      await createAuditLog({
        action: "DEVICE_TRUSTED",
        resource: "Device",
        resourceId: input.deviceFingerprint,
        userId: ctx.userId,
        ipAddress,
        userAgent,
        details: {
          deviceFingerprint: input.deviceFingerprint,
          deviceName: session.deviceName,
          sessionsUpdated: result.count,
        },
      })

      return { success: true, sessionsUpdated: result.count }
    }),

  // Untrust all devices with the same fingerprint
  untrustDeviceByFingerprint: baseProcedure
    .use(async ({ ctx, next }) => {
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to untrust devices",
        })
      }
      return next({ ctx })
    })
    .input(
      z.object({
        deviceFingerprint: z.string().min(1, "Device fingerprint is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify at least one session with this fingerprint belongs to user
      const session = await prisma.session.findFirst({
        where: {
          userId: ctx.userId,
          deviceFingerprint: input.deviceFingerprint,
        },
      })

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found",
        })
      }

      // Untrust all sessions with this fingerprint
      const result = await prisma.session.updateMany({
        where: {
          userId: ctx.userId,
          deviceFingerprint: input.deviceFingerprint,
        },
        data: { isTrusted: false },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      const { getRequestMetadata } = await import("@/lib/audit-log")
      const headersList = await import("next/headers").then((m) => m.headers())
      const { ipAddress, userAgent } = getRequestMetadata(headersList)

      await createAuditLog({
        action: "DEVICE_UNTRUSTED",
        resource: "Device",
        resourceId: input.deviceFingerprint,
        userId: ctx.userId,
        ipAddress,
        userAgent,
        details: {
          deviceFingerprint: input.deviceFingerprint,
          deviceName: session.deviceName,
          sessionsUpdated: result.count,
        },
      })

      return { success: true, sessionsUpdated: result.count }
    }),

  // Revoke all sessions for a specific device fingerprint
  revokeDeviceSessions: baseProcedure
    .use(async ({ ctx, next }) => {
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to revoke device sessions",
        })
      }
      return next({ ctx })
    })
    .input(
      z.object({
        deviceFingerprint: z.string().min(1, "Device fingerprint is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get current session token to prevent revoking current session
      const { cookies } = await import("next/headers")
      const cookieStore = await cookies()
      const currentSessionToken = cookieStore.get("session")?.value

      // Get sessions to revoke
      const sessionsToRevoke = await prisma.session.findMany({
        where: {
          userId: ctx.userId,
          deviceFingerprint: input.deviceFingerprint,
        },
        select: {
          id: true,
          sessionToken: true,
          deviceName: true,
        },
      })

      if (sessionsToRevoke.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No sessions found for this device",
        })
      }

      // Delete all sessions with this fingerprint (except current session if it matches)
      const sessionsToDelete = sessionsToRevoke.filter(
        (s) => s.sessionToken !== currentSessionToken
      )

      if (sessionsToDelete.length > 0) {
        await prisma.session.deleteMany({
          where: {
            id: {
              in: sessionsToDelete.map((s) => s.id),
            },
          },
        })
      }

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      const { getRequestMetadata } = await import("@/lib/audit-log")
      const headersList = await import("next/headers").then((m) => m.headers())
      const { ipAddress, userAgent } = getRequestMetadata(headersList)

      await createAuditLog({
        action: "DEVICE_SESSIONS_REVOKED",
        resource: "Device",
        resourceId: input.deviceFingerprint,
        userId: ctx.userId,
        ipAddress,
        userAgent,
        details: {
          deviceFingerprint: input.deviceFingerprint,
          deviceName: sessionsToRevoke[0]?.deviceName,
          sessionsRevoked: sessionsToDelete.length,
        },
      })

      return {
        success: true,
        sessionsRevoked: sessionsToDelete.length,
        currentSessionRevoked: sessionsToRevoke.some(
          (s) => s.sessionToken === currentSessionToken
        ),
      }
    }),

  getLoginHistory: baseProcedure
    .use(async ({ ctx, next }) => {
      // Check if user is authenticated
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to view login history",
        })
      }
      return next({ ctx })
    })
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      }).optional()
    )
    .query(async ({ input = {}, ctx }) => {
      const { page = 1, pageSize = 20 } = input

      const where = {
        userId: ctx.userId,
        action: "LOGIN_SUCCESS",
      }

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          take: pageSize,
          skip: (page - 1) * pageSize,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            ipAddress: true,
            userAgent: true,
            createdAt: true,
            status: true,
          },
        }),
        prisma.auditLog.count({ where }),
      ])

      return {
        logs,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      }
    }),

  // ========== Onboarding ==========

  getOnboardingStatus: baseProcedure
    .use(async ({ ctx, next }) => {
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to view onboarding status",
        })
      }
      return next({ ctx })
    })
    .query(async ({ ctx }) => {
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: {
          preferences: true,
          createdAt: true,
        },
      })

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        })
      }

      const preferences = (user.preferences as Record<string, unknown>) || {}
      const onboarding = (preferences.onboarding as Record<string, unknown>) || {}

      // Check if user is new (created within last 7 days and hasn't completed onboarding)
      const isNewUser = user.createdAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const hasCompletedOnboarding = onboarding.completed === true

      return {
        isNewUser,
        hasCompletedOnboarding,
        completedSteps: (onboarding.completedSteps as string[]) || [],
        skippedOnboarding: onboarding.skipped === true,
        currentStep: onboarding.currentStep as string | undefined,
      }
    }),

  updateOnboardingStatus: baseProcedure
    .use(async ({ ctx, next }) => {
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to update onboarding status",
        })
      }
      return next({ ctx })
    })
    .input(
      z.object({
        completedSteps: z.array(z.string()).optional(),
        currentStep: z.string().optional(),
        completed: z.boolean().optional(),
        skipped: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { preferences: true },
      })

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        })
      }

      const preferences = (user.preferences as Record<string, unknown>) || {}
      const onboarding = (preferences.onboarding as Record<string, unknown>) || {}

      // Update onboarding state
      const updatedOnboarding = {
        ...onboarding,
        ...(input.completedSteps !== undefined && { completedSteps: input.completedSteps }),
        ...(input.currentStep !== undefined && { currentStep: input.currentStep }),
        ...(input.completed !== undefined && { completed: input.completed }),
        ...(input.skipped !== undefined && { skipped: input.skipped }),
      }

      await prisma.user.update({
        where: { id: ctx.userId },
        data: {
          preferences: {
            ...preferences,
            onboarding: updatedOnboarding,
          } as Prisma.InputJsonValue,
        },
      })

      return { success: true }
    }),

  completeOnboardingStep: baseProcedure
    .use(async ({ ctx, next }) => {
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to complete onboarding steps",
        })
      }
      return next({ ctx })
    })
    .input(
      z.object({
        step: z.string().min(1, "Step is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { preferences: true },
      })

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        })
      }

      const preferences = (user.preferences as Record<string, unknown>) || {}
      const onboarding = (preferences.onboarding as Record<string, unknown>) || {}
      const completedSteps = (onboarding.completedSteps as string[]) || []

      // Add step if not already completed
      if (!completedSteps.includes(input.step)) {
        completedSteps.push(input.step)
      }

      await prisma.user.update({
        where: { id: ctx.userId },
        data: {
          preferences: {
            ...preferences,
            onboarding: {
              ...onboarding,
              completedSteps,
            },
          } as Prisma.InputJsonValue,
        },
      })

      return { success: true, completedSteps }
    }),
})
