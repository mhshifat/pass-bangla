import prisma from "@/lib/prisma"
import { createTRPCRouter, protectedProcedure } from "@/trpc/init"
import z from "zod"
import { TRPCError } from "@trpc/server"
import { Prisma } from "@/app/generated"

export const passwordRotationRouter = createTRPCRouter({
  // Rotation Policies
  listPolicies: protectedProcedure("password.view")
    .query(async ({ ctx }) => {
      // Build where clause for policies accessible to user
      // Show policies owned by user OR policies from the same company
      const where: Prisma.PasswordRotationPolicyWhereInput = ctx.companyId
        ? { OR: [{ ownerId: ctx.userId }, { companyId: ctx.companyId }] }
        : { ownerId: ctx.userId }

      const policies = await prisma.passwordRotationPolicy.findMany({
        where,
        include: {
          _count: {
            select: {
              passwords: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      return policies
    }),

  getPolicy: protectedProcedure("password.view")
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const policy = await prisma.passwordRotationPolicy.findFirst({
        where: {
          id: input.id,
          ownerId: ctx.userId,
        },
        include: {
          _count: {
            select: {
              passwords: true,
              rotations: true,
            },
          },
        },
      })

      if (!policy) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Rotation policy not found",
        })
      }

      return policy
    }),

  createPolicy: protectedProcedure("password.edit")
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        description: z.string().optional(),
        rotationDays: z.number().min(1, "Rotation days must be at least 1"),
        reminderDays: z.number().min(0, "Reminder days must be at least 0"),
        autoRotate: z.boolean().default(false),
        requireApproval: z.boolean().default(false),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.reminderDays >= input.rotationDays) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Reminder days must be less than rotation days",
        })
      }

      const policy = await prisma.passwordRotationPolicy.create({
        data: {
          ...input,
          ownerId: ctx.userId,
          companyId: ctx.companyId || null,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "ROTATION_POLICY_CREATED",
        resource: "PasswordRotationPolicy",
        resourceId: policy.id,
        details: {
          name: policy.name,
          rotationDays: policy.rotationDays,
        },
        userId: ctx.userId,
      })

      return policy
    }),

  updatePolicy: protectedProcedure("password.edit")
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1, "Name is required").optional(),
        description: z.string().optional(),
        rotationDays: z.number().min(1, "Rotation days must be at least 1").optional(),
        reminderDays: z.number().min(0, "Reminder days must be at least 0").optional(),
        autoRotate: z.boolean().optional(),
        requireApproval: z.boolean().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input

      // Verify ownership
      const existing = await prisma.passwordRotationPolicy.findFirst({
        where: {
          id,
          ownerId: ctx.userId,
        },
      })

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Rotation policy not found",
        })
      }

      // Validate reminder days if rotation days are being updated
      if (updateData.reminderDays !== undefined && updateData.rotationDays !== undefined) {
        if (updateData.reminderDays >= updateData.rotationDays) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Reminder days must be less than rotation days",
          })
        }
      } else if (updateData.reminderDays !== undefined) {
        if (updateData.reminderDays >= existing.rotationDays) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Reminder days must be less than rotation days",
          })
        }
      } else if (updateData.rotationDays !== undefined) {
        if (existing.reminderDays >= updateData.rotationDays) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Reminder days must be less than rotation days",
          })
        }
      }

      const policy = await prisma.passwordRotationPolicy.update({
        where: { id },
        data: updateData,
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "ROTATION_POLICY_UPDATED",
        resource: "PasswordRotationPolicy",
        resourceId: policy.id,
        details: {
          name: policy.name,
        },
        userId: ctx.userId,
      })

      return policy
    }),

  deletePolicy: protectedProcedure("password.edit")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Verify ownership
      const policy = await prisma.passwordRotationPolicy.findFirst({
        where: {
          id: input.id,
          ownerId: ctx.userId,
        },
        include: {
          _count: {
            select: {
              passwords: true,
            },
          },
        },
      })

      if (!policy) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Rotation policy not found",
        })
      }

      // Remove policy from passwords
      await prisma.password.updateMany({
        where: {
          rotationPolicyId: input.id,
        },
        data: {
          rotationPolicyId: null,
        },
      })

      // Delete policy
      await prisma.passwordRotationPolicy.delete({
        where: { id: input.id },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "ROTATION_POLICY_DELETED",
        resource: "PasswordRotationPolicy",
        resourceId: input.id,
        details: {
          name: policy.name,
        },
        userId: ctx.userId,
      })

      return { success: true }
    }),

  assignPolicy: protectedProcedure("password.edit")
    .input(
      z.object({
        passwordId: z.string(),
        policyId: z.string().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify password ownership
      const password = await prisma.password.findFirst({
        where: {
          id: input.passwordId,
          ownerId: ctx.userId,
        },
      })

      if (!password) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password not found",
        })
      }

      // Verify policy ownership if policy is provided
      if (input.policyId) {
        const policy = await prisma.passwordRotationPolicy.findFirst({
          where: {
            id: input.policyId,
            ownerId: ctx.userId,
          },
        })

        if (!policy) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Rotation policy not found",
          })
        }
      }

      const updated = await prisma.password.update({
        where: { id: input.passwordId },
        data: {
          rotationPolicyId: input.policyId,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: input.policyId ? "ROTATION_POLICY_ASSIGNED" : "ROTATION_POLICY_REMOVED",
        resource: "Password",
        resourceId: input.passwordId,
        details: {
          passwordName: password.name,
          policyId: input.policyId,
        },
        userId: ctx.userId,
      })

      return updated
    }),

  // Rotation Reminders
  getReminders: protectedProcedure("password.view")
    .input(
      z.object({
        daysAhead: z.number().default(30), // Get reminders for next N days
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const daysAhead = input?.daysAhead || 30
      const now = new Date()
      const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

      // Get all passwords with rotation policies
      const passwords = await prisma.password.findMany({
        where: {
          ownerId: ctx.userId,
          rotationPolicyId: { not: null },
          rotationPolicy: {
            isActive: true,
          },
        },
        include: {
          rotationPolicy: true,
          rotations: {
            where: {
              status: "COMPLETED",
            },
            orderBy: {
              rotatedAt: "desc",
            },
            take: 1,
          },
        },
      })

      const reminders = []

      for (const password of passwords) {
        if (!password.rotationPolicy) continue

        // Calculate next rotation date
        let lastRotationDate: Date
        if (password.rotations.length > 0) {
          lastRotationDate = password.rotations[0].rotatedAt
        } else {
          // Use password creation date if no rotation history
          lastRotationDate = password.createdAt
        }

        const nextRotationDate = new Date(
          lastRotationDate.getTime() + password.rotationPolicy.rotationDays * 24 * 60 * 60 * 1000
        )

        // Calculate reminder date
        const reminderDate = new Date(
          nextRotationDate.getTime() - password.rotationPolicy.reminderDays * 24 * 60 * 60 * 1000
        )

        // Calculate days until reminder
        const daysUntilReminder = Math.ceil((reminderDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        const daysUntilRotation = Math.ceil((nextRotationDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))

        // Only show reminders if:
        // 1. Reminder date is in the future (not in the past)
        // 2. Reminder date is within the specified days ahead
        // 3. The password hasn't been rotated very recently (within the last 24 hours) to avoid showing immediately after rotation
        //    This ensures that after auto-rotation, the reminder disappears until the next reminder window
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const wasRecentlyRotated = password.rotations.length > 0 && password.rotations[0].rotatedAt > oneDayAgo

        // Also check if daysUntilReminder is negative (reminder already passed) or if rotation is due/past due
        // If rotation was just completed, daysUntilRotation should be positive and large, so we exclude it
        if (reminderDate <= futureDate && reminderDate >= now && !wasRecentlyRotated && daysUntilReminder >= 0) {
          reminders.push({
            passwordId: password.id,
            passwordName: password.name,
            passwordUsername: password.username,
            policyId: password.rotationPolicy.id,
            policyName: password.rotationPolicy.name,
            nextRotationDate,
            reminderDate,
            daysUntilRotation,
            daysUntilReminder,
          })
        }
      }

      // Sort by reminder date
      reminders.sort((a, b) => a.reminderDate.getTime() - b.reminderDate.getTime())

      return reminders
    }),

  // Rotation History
  getRotationHistory: protectedProcedure("password.view")
    .input(
      z.object({
        passwordId: z.string().optional(),
        policyId: z.string().optional(),
        status: z.enum(["COMPLETED", "PENDING", "FAILED", "CANCELLED"]).optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const { passwordId, policyId, status, page = 1, pageSize = 20 } = input

      const where: Prisma.PasswordRotationWhereInput = {
        password: {
          ownerId: ctx.userId,
        },
      }

      if (passwordId) {
        where.passwordId = passwordId
      }

      if (policyId) {
        where.policyId = policyId
      }

      if (status) {
        where.status = status
      }

      const [rotations, total] = await Promise.all([
        prisma.passwordRotation.findMany({
          where,
          include: {
            password: {
              select: {
                id: true,
                name: true,
                username: true,
                url: true,
              },
            },
            policy: {
              select: {
                id: true,
                name: true,
              },
            },
            rotatedByUser: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            rotatedAt: "desc",
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.passwordRotation.count({ where }),
      ])

      return {
        rotations,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      }
    }),

  // Schedule Rotation
  scheduleRotation: protectedProcedure("password.edit")
    .input(
      z.object({
        passwordId: z.string(),
        scheduledFor: z.string(), // ISO date string
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify password ownership
      const password = await prisma.password.findFirst({
        where: {
          id: input.passwordId,
          ownerId: ctx.userId,
        },
        include: {
          rotationPolicy: true,
        },
      })

      if (!password) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password not found",
        })
      }

      const scheduledDate = new Date(input.scheduledFor)

      // Create scheduled rotation
      const rotation = await prisma.passwordRotation.create({
        data: {
          passwordId: input.passwordId,
          policyId: password.rotationPolicyId,
          rotationType: password.rotationPolicyId ? "POLICY" : "SCHEDULED",
          newPassword: password.password, // Will be updated when rotation is completed
          rotatedBy: ctx.userId,
          scheduledFor: scheduledDate,
          status: "PENDING",
          notes: input.notes,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "PASSWORD_ROTATION_SCHEDULED",
        resource: "Password",
        resourceId: input.passwordId,
        details: {
          passwordName: password.name,
          scheduledFor: scheduledDate.toISOString(),
        },
        userId: ctx.userId,
      })

      return rotation
    }),

  // Complete Rotation
  completeRotation: protectedProcedure("password.edit")
    .input(
      z.object({
        rotationId: z.string(),
        newPassword: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get rotation
      const rotation = await prisma.passwordRotation.findFirst({
        where: {
          id: input.rotationId,
          password: {
            ownerId: ctx.userId,
          },
        },
        include: {
          password: true,
        },
      })

      if (!rotation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Rotation not found",
        })
      }

      if (rotation.status !== "PENDING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Rotation is not pending",
        })
      }

      // Encrypt new password using user-specific key (new method)
      const { encryptPasswordWithUserKey } = await import("@/lib/server-crypto-migration")
      const encryptedPassword = encryptPasswordWithUserKey(input.newPassword, ctx.userId)

      // Save old password to rotation record
      const oldPassword = rotation.password.password

      // Update password
      await prisma.password.update({
        where: { id: rotation.passwordId },
        data: {
          password: encryptedPassword,
        },
      })

      // Update rotation
      const updated = await prisma.passwordRotation.update({
        where: { id: input.rotationId },
        data: {
          oldPassword,
          newPassword: encryptedPassword,
          status: "COMPLETED",
          completedAt: new Date(),
          notes: input.notes,
        },
      })

      // Save to password history
      const { savePasswordHistory } = await import("@/lib/password-history")
      await savePasswordHistory(
        rotation.passwordId,
        {
          name: rotation.password.name,
          username: rotation.password.username,
          password: encryptedPassword,
          url: rotation.password.url,
          notes: rotation.password.notes,
          folderId: rotation.password.folderId,
          strength: rotation.password.strength,
          hasTotp: rotation.password.hasTotp,
          totpSecret: rotation.password.totpSecret,
          expiresAt: rotation.password.expiresAt,
        },
        ctx.userId,
        "UPDATE"
      )

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "PASSWORD_ROTATED",
        resource: "Password",
        resourceId: rotation.passwordId,
        details: {
          passwordName: rotation.password.name,
          rotationType: rotation.rotationType,
        },
        userId: ctx.userId,
      })

      return updated
    }),

  // Auto Rotate Password (from reminder)
  autoRotatePassword: protectedProcedure("password.edit")
    .input(
      z.object({
        passwordId: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify password ownership
      const password = await prisma.password.findFirst({
        where: {
          id: input.passwordId,
          ownerId: ctx.userId,
        },
        include: {
          rotationPolicy: true,
        },
      })

      if (!password) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password not found",
        })
      }

      // Generate a strong password (16 characters)
      const generateStrongPassword = (length: number = 16): string => {
        const lowercase = "abcdefghijklmnopqrstuvwxyz"
        const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        const numbers = "0123456789"
        const special = "!@#$%^&*()_+-=[]{}|;:,.<>?"
        const allChars = lowercase + uppercase + numbers + special

        let newPassword = ""

        // Ensure at least one of each type
        newPassword += lowercase[Math.floor(Math.random() * lowercase.length)]
        newPassword += uppercase[Math.floor(Math.random() * uppercase.length)]
        newPassword += numbers[Math.floor(Math.random() * numbers.length)]
        newPassword += special[Math.floor(Math.random() * special.length)]

        // Fill the rest randomly
        for (let i = newPassword.length; i < length; i++) {
          newPassword += allChars[Math.floor(Math.random() * allChars.length)]
        }

        // Shuffle the password to avoid predictable pattern
        newPassword = newPassword
          .split("")
          .sort(() => Math.random() - 0.5)
          .join("")

        return newPassword
      }

      const newPassword = generateStrongPassword(16)

      // Encrypt new password using user-specific key (new method)
      const { encryptPasswordWithUserKey } = await import("@/lib/server-crypto-migration")
      const encryptedPassword = encryptPasswordWithUserKey(newPassword, ctx.userId)

      // Save old password
      const oldPassword = password.password

      // Check if there's an existing pending rotation
      let rotation = await prisma.passwordRotation.findFirst({
        where: {
          passwordId: input.passwordId,
          status: "PENDING",
        },
      })

      if (!rotation) {
        // Create a new rotation record
        rotation = await prisma.passwordRotation.create({
          data: {
            passwordId: input.passwordId,
            policyId: password.rotationPolicyId,
            rotationType: password.rotationPolicyId ? "POLICY" : "MANUAL",
            oldPassword: oldPassword,
            newPassword: encryptedPassword,
            rotatedBy: ctx.userId,
            rotatedAt: new Date(),
            status: "COMPLETED",
            completedAt: new Date(),
            notes: input.notes || "Auto-rotated from reminders",
          },
        })
      } else {
        // Update existing rotation
        rotation = await prisma.passwordRotation.update({
          where: { id: rotation.id },
          data: {
            oldPassword,
            newPassword: encryptedPassword,
            status: "COMPLETED",
            completedAt: new Date(),
            rotatedAt: new Date(),
            notes: input.notes || rotation.notes || "Auto-rotated from reminders",
          },
        })
      }

      // Update password with new encrypted password
      // Calculate new strength
      let strength: "STRONG" | "MEDIUM" | "WEAK" = "MEDIUM"
      if (newPassword.length >= 16 && /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) && /[0-9]/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword)) {
        strength = "STRONG"
      } else if (newPassword.length < 8) {
        strength = "WEAK"
      }

      const updatedPassword = await prisma.password.update({
        where: { id: input.passwordId },
        data: {
          password: encryptedPassword,
          strength,
        },
        select: {
          name: true,
          username: true,
          url: true,
          notes: true,
          folderId: true,
          hasTotp: true,
          totpSecret: true,
          expiresAt: true,
        },
      })

      // Save to password history
      const { savePasswordHistory } = await import("@/lib/password-history")
      await savePasswordHistory(
        input.passwordId,
        {
          name: updatedPassword.name,
          username: updatedPassword.username,
          password: encryptedPassword,
          url: updatedPassword.url,
          notes: updatedPassword.notes,
          folderId: updatedPassword.folderId,
          strength,
          hasTotp: updatedPassword.hasTotp,
          totpSecret: updatedPassword.totpSecret,
          expiresAt: updatedPassword.expiresAt,
        },
        ctx.userId,
        "UPDATE"
      )

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "PASSWORD_AUTO_ROTATED",
        resource: "Password",
        resourceId: input.passwordId,
        details: {
          passwordName: password.name,
          rotationType: rotation.rotationType,
        },
        userId: ctx.userId,
      })

      return {
        success: true,
        rotation,
        newPassword, // Return unencrypted password for display (one-time)
      }
    }),

  // Cancel Scheduled Rotation
  cancelRotation: protectedProcedure("password.edit")
    .input(z.object({ rotationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Get rotation
      const rotation = await prisma.passwordRotation.findFirst({
        where: {
          id: input.rotationId,
          password: {
            ownerId: ctx.userId,
          },
        },
      })

      if (!rotation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Rotation not found",
        })
      }

      if (rotation.status !== "PENDING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending rotations can be cancelled",
        })
      }

      const updated = await prisma.passwordRotation.update({
        where: { id: input.rotationId },
        data: {
          status: "CANCELLED",
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "PASSWORD_ROTATION_CANCELLED",
        resource: "Password",
        resourceId: rotation.passwordId,
        details: {
          rotationId: input.rotationId,
        },
        userId: ctx.userId,
      })

      return updated
    }),
})

