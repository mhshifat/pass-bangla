import prisma from "@/lib/prisma"
import { createTRPCRouter, protectedProcedure } from "@/trpc/init"
import z from "zod"
import { TRPCError } from "@trpc/server"
import { Prisma } from "@/app/generated"

export const teamsRouter = createTRPCRouter({
  create: protectedProcedure("team.create")
    .input(
      z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Check if team already exists in the same company
      const existingTeam = await prisma.team.findFirst({
        where: { 
          name: input.name,
          ...(companyId ? { companyId: companyId } : {}),
        },
      })

      if (existingTeam) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Team with this name already exists",
        })
      }

      // Create team with companyId
      const team = await prisma.team.create({
        data: {
          name: input.name,
          description: input.description || null,
          ...(companyId ? { companyId } : {}),
        },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          members: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              role: true,
            },
          },
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "TEAM_CREATED",
        resource: "Team",
        resourceId: team.id,
        details: { name: team.name },
        userId: ctx.userId,
      })

      return {
        success: true,
        team,
      }
    }),

  list: protectedProcedure("team.view")
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input = {}, ctx }) => {
      const { page = 1, pageSize = 10, search } = input

      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Build where clause - filter teams by company
      const where: Prisma.TeamWhereInput = {}
      
      if (companyId) {
        where.companyId = companyId
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
        ]
      }

      const [teams, total] = await Promise.all([
        prisma.team.findMany({
          where,
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true,
            members: {
              select: {
                id: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
                role: true,
              },
            },
            sharedPasswords: {
              select: {
                id: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.team.count({ where }),
      ])

      // Transform teams to include member count and password count
      const transformedTeams = teams.map((team) => ({
        id: team.id,
        name: team.name,
        description: team.description,
        members: team.members.length,
        passwords: team.sharedPasswords.length,
        createdAt: team.createdAt.toISOString(),
        manager: team.members.find((m) => m.role === "MANAGER")?.user.name || "—",
      }))

      return {
        teams: transformedTeams,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      }
    }),

  update: protectedProcedure("team.edit")
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(2).optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input

      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Check if team exists and belongs to the same company
      const teamWhere: Prisma.TeamWhereInput = { id }
      if (companyId) {
        teamWhere.companyId = companyId
      }

      const existingTeam = await prisma.team.findFirst({
        where: teamWhere,
      })

      if (!existingTeam) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      // Check if name is being changed and if new name already exists in the same company
      if (data.name && data.name !== existingTeam.name) {
        const nameExistsWhere: Prisma.TeamWhereInput = { name: data.name }
        if (companyId) {
          nameExistsWhere.companyId = companyId
        }

        const nameExists = await prisma.team.findFirst({
          where: nameExistsWhere,
        })

        if (nameExists) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Team with this name already exists",
          })
        }
      }

      // Update team
      const team = await prisma.team.update({
        where: { id },
        data: {
          ...data,
          description: data.description !== undefined ? (data.description || null) : undefined,
        },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      const changedFields = Object.keys(data).filter(key => data[key as keyof typeof data] !== undefined)
      await createAuditLog({
        action: "TEAM_UPDATED",
        resource: "Team",
        resourceId: team.id,
        details: { name: team.name, changedFields },
        userId: ctx.userId,
      })

      return {
        success: true,
        team,
      }
    }),

  delete: protectedProcedure("team.delete")
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Check if team exists and belongs to the same company
      const teamWhere: Prisma.TeamWhereInput = { id: input.id }
      if (companyId) {
        teamWhere.companyId = companyId
      }

      const existingTeam = await prisma.team.findFirst({
        where: teamWhere,
        include: {
          members: true,
        },
      })

      if (!existingTeam) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      // Create audit log before deletion
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "TEAM_DELETED",
        resource: "Team",
        resourceId: input.id,
        details: { name: existingTeam.name },
        userId: ctx.userId,
      })

      // Delete team (cascade will handle members and shared passwords)
      await prisma.team.delete({
        where: { id: input.id },
      })

      return {
        success: true,
      }
    }),

  getById: protectedProcedure("team.view")
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Filter by companyId
      const teamWhere: Prisma.TeamWhereInput = { id: input.id }
      if (companyId) {
        teamWhere.companyId = companyId
      }

      const team = await prisma.team.findFirst({
        where: teamWhere,
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          members: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                  // Note: Email is intentionally excluded from this response
                  // Only team managers can see member emails via a separate endpoint if needed
                },
              },
              role: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
          sharedPasswords: {
            select: {
              id: true,
              password: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      })

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      return { team }
    }),

  stats: protectedProcedure("team.view")
    .query(async ({ ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Build where clauses with company filter
      const teamWhere: Prisma.TeamWhereInput = {}
      const memberWhere: Prisma.TeamMemberWhereInput = {}
      
      if (companyId) {
        teamWhere.companyId = companyId
        memberWhere.user = {
          companyId: companyId,
        }
      }

      const [total, totalMembers, totalPasswords] = await Promise.all([
        prisma.team.count({ where: teamWhere }),
        prisma.teamMember.count({ where: memberWhere }),
        prisma.passwordShare.count({
          where: {
            teamId: { not: null },
            ...(companyId ? {
              team: {
                members: {
                  some: {
                    user: {
                      companyId: companyId,
                    },
                  },
                },
              },
            } : {}),
          },
        }),
      ])

      // Calculate average team size
      const teamsWithMembers = await prisma.team.findMany({
        where: teamWhere,
        select: {
          members: {
            select: {
              id: true,
            },
          },
        },
      })

      const avgTeamSize =
        teamsWithMembers.length > 0
          ? Math.round(
              teamsWithMembers.reduce((sum, team) => sum + team.members.length, 0) /
                teamsWithMembers.length
            )
          : 0

      return {
        total,
        totalMembers,
        totalPasswords,
        avgTeamSize,
      }
    }),

  addMember: protectedProcedure("team.edit")
    .input(
      z.object({
        teamId: z.string(),
        userId: z.string(),
        role: z.enum(["MANAGER", "MEMBER"]).default("MEMBER"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Check if team exists and belongs to the same company
      const teamWhere: Prisma.TeamWhereInput = { id: input.teamId }
      if (companyId) {
        teamWhere.companyId = companyId
      }

      const team = await prisma.team.findFirst({
        where: teamWhere,
      })

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      // Check if user exists and belongs to the same company
      const userWhere: Prisma.UserWhereInput = { id: input.userId }
      if (companyId) {
        userWhere.companyId = companyId
      }

      const user = await prisma.user.findFirst({
        where: userWhere,
      })

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found or does not belong to your company",
        })
      }

      // Check if user is already a member
      const existingMember = await prisma.teamMember.findUnique({
        where: {
          teamId_userId: {
            teamId: input.teamId,
            userId: input.userId,
          },
        },
      })

      if (existingMember) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User is already a member of this team",
        })
      }

      // Add member
      const member = await prisma.teamMember.create({
        data: {
          teamId: input.teamId,
          userId: input.userId,
          role: input.role,
        },
        select: {
          id: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          role: true,
          createdAt: true,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "TEAM_MEMBER_ADDED",
        resource: "Team",
        resourceId: input.teamId,
        details: { userId: input.userId, userName: member.user.name, role: input.role },
        userId: ctx.userId,
      })

      return {
        success: true,
        member,
      }
    }),

  removeMember: protectedProcedure("team.edit")
    .input(
      z.object({
        teamId: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Check if member exists and belongs to the same company
      const memberWhere: Prisma.TeamMemberWhereInput = {
        teamId: input.teamId,
        userId: input.userId,
      }
      
      if (companyId) {
        memberWhere.team = {
          companyId: companyId,
        }
        memberWhere.user = {
          companyId: companyId,
        }
      }

      const member = await prisma.teamMember.findFirst({
        where: memberWhere,
      })

      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found",
        })
      }

      // Remove member
      await prisma.teamMember.delete({
        where: {
          teamId_userId: {
            teamId: input.teamId,
            userId: input.userId,
          },
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "TEAM_MEMBER_REMOVED",
        resource: "Team",
        resourceId: input.teamId,
        details: { userId: input.userId },
        userId: ctx.userId,
      })

      return {
        success: true,
      }
    }),

  updateMemberRole: protectedProcedure("team.edit")
    .input(
      z.object({
        teamId: z.string(),
        userId: z.string(),
        role: z.enum(["MANAGER", "MEMBER"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Check if member exists and belongs to the same company
      const memberWhere: Prisma.TeamMemberWhereInput = {
        teamId: input.teamId,
        userId: input.userId,
      }
      
      if (companyId) {
        memberWhere.team = {
          companyId: companyId,
        }
        memberWhere.user = {
          companyId: companyId,
        }
      }

      const member = await prisma.teamMember.findFirst({
        where: memberWhere,
      })

      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found",
        })
      }

      // Update member role
      const updatedMember = await prisma.teamMember.update({
        where: {
          teamId_userId: {
            teamId: input.teamId,
            userId: input.userId,
          },
        },
        data: {
          role: input.role,
        },
        select: {
          id: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          role: true,
          createdAt: true,
        },
      })

      return {
        success: true,
        member: updatedMember,
      }
    }),

  getAvailableUsers: protectedProcedure("team.edit")
    .input(
      z.object({
        teamId: z.string(),
        search: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Verify team belongs to same company
      const teamWhere: Prisma.TeamWhereInput = { id: input.teamId }
      if (companyId) {
        teamWhere.companyId = companyId
      }

      const team = await prisma.team.findFirst({
        where: teamWhere,
      })

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      // Get current team members
      const teamMembers = await prisma.teamMember.findMany({
        where: { teamId: input.teamId },
        select: { userId: true },
      })

      const memberUserIds = teamMembers.map((m) => m.userId)

      // Exclude current logged-in user and team members
      const excludedUserIds = [...memberUserIds]
      if (ctx.userId) {
        excludedUserIds.push(ctx.userId)
      }

      // Get all users from same company except those already in the team and the current logged-in user
      const where: Prisma.UserWhereInput = {
        id: { notIn: excludedUserIds },
        isActive: true,
      }
      
      if (companyId) {
        where.companyId = companyId
      }

      if (input.search) {
        where.OR = [
          { name: { contains: input.search, mode: "insensitive" as const } },
          { email: { contains: input.search, mode: "insensitive" as const } },
        ]
      }

      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
        orderBy: {
          name: "asc",
        },
        take: 50, // Limit results
      })

      return { users }
    }),

  getTeamPasswords: protectedProcedure("team.view")
    .input(
      z.object({
        teamId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Check if team exists and belongs to the same company
      const teamWhere: Prisma.TeamWhereInput = { id: input.teamId }
      if (companyId) {
        teamWhere.companyId = companyId
      }

      const team = await prisma.team.findFirst({
        where: teamWhere,
      })

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      // Get passwords shared with this team
      const passwordShares = await prisma.passwordShare.findMany({
        where: {
          teamId: input.teamId,
        },
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          password: {
            select: {
              id: true,
              name: true,
              username: true,
              url: true,
              strength: true,
              owner: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      return {
        passwords: passwordShares.map((share) => ({
          id: share.id,
          passwordId: share.password.id,
          name: share.password.name,
          username: share.password.username,
          url: share.password.url,
          strength: share.password.strength,
          owner: share.password.owner,
          createdAt: share.createdAt.toISOString(),
          expiresAt: share.expiresAt?.toISOString() || null,
        })),
      }
    }),

  getAvailablePasswordsToShare: protectedProcedure("password.share")
    .input(
      z.object({
        teamId: z.string(),
        search: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Get passwords already shared with this team
      const existingShares = await prisma.passwordShare.findMany({
        where: {
          teamId: input.teamId,
        },
        select: {
          passwordId: true,
        },
      })

      const sharedPasswordIds = existingShares.map((s) => s.passwordId)

      // Get passwords owned by current user that aren't already shared with this team
      const where = {
        ownerId: ctx.userId,
        id: { notIn: sharedPasswordIds },
        ...(input.search
          ? {
              OR: [
                { name: { contains: input.search, mode: "insensitive" as const } },
                { username: { contains: input.search, mode: "insensitive" as const } },
                { url: { contains: input.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      }

      const passwords = await prisma.password.findMany({
        where,
        select: {
          id: true,
          name: true,
          username: true,
          url: true,
          strength: true,
        },
        orderBy: {
          name: "asc",
        },
        take: 50,
      })

      return { passwords }
    }),

  sharePasswordWithTeam: protectedProcedure("password.share")
    .input(
      z.object({
        passwordId: z.string(),
        teamId: z.string(),
        expiresAt: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if password exists and is owned by current user
      const password = await prisma.password.findUnique({
        where: { id: input.passwordId },
        select: {
          id: true,
          ownerId: true,
        },
      })

      if (!password) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password not found",
        })
      }

      // Check if user owns the password
      if (password.ownerId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only share passwords you own",
        })
      }

      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Check if team exists and belongs to the same company
      const teamWhere: Prisma.TeamWhereInput = { id: input.teamId }
      if (companyId) {
        teamWhere.companyId = companyId
      }

      const team = await prisma.team.findFirst({
        where: teamWhere,
      })

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      // Check if password is already shared with this team
      const existingShare = await prisma.passwordShare.findFirst({
        where: {
          passwordId: input.passwordId,
          teamId: input.teamId,
        },
      })

      if (existingShare) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Password is already shared with this team",
        })
      }

      // Get password name for audit log
      const passwordForLog = await prisma.password.findUnique({
        where: { id: input.passwordId },
        select: { name: true },
      })

      // Create password share (default permission is READ)
      const share = await prisma.passwordShare.create({
        data: {
          passwordId: input.passwordId,
          teamId: input.teamId,
          permission: "READ", // Default permission
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
        select: {
          id: true,
          password: {
            select: {
              id: true,
              name: true,
            },
          },
          permission: true,
          createdAt: true,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "PASSWORD_SHARED",
        resource: "Password",
        resourceId: input.passwordId,
        details: {
          passwordName: passwordForLog?.name,
          teamId: input.teamId,
          teamName: team.name,
          expiresAt: input.expiresAt || null,
        },
        userId: ctx.userId,
      })

      return {
        success: true,
        share,
      }
    }),

  updateTeamPasswordShare: protectedProcedure("password.share")
    .input(
      z.object({
        shareId: z.string(),
        expiresAt: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if share exists
      const share = await prisma.passwordShare.findUnique({
        where: { id: input.shareId },
        include: {
          password: {
            select: {
              ownerId: true,
            },
          },
        },
      })

      if (!share) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password share not found",
        })
      }

      // Check if user owns the password
      if (share.password.ownerId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only modify shares for passwords you own",
        })
      }

      // Update share expiration only
      const updatedShare = await prisma.passwordShare.update({
        where: { id: input.shareId },
        data: {
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
        select: {
          id: true,
          expiresAt: true,
        },
      })

      return {
        success: true,
        share: updatedShare,
      }
    }),

  removeTeamPasswordShare: protectedProcedure("password.share")
    .input(
      z.object({
        shareId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if share exists
      const share = await prisma.passwordShare.findUnique({
        where: { id: input.shareId },
        include: {
          password: {
            select: {
              ownerId: true,
            },
          },
        },
      })

      if (!share) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password share not found",
        })
      }

      // Check if user owns the password
      if (share.password.ownerId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only remove shares for passwords you own",
        })
      }

      // Get share info for audit log
      const shareForLog = await prisma.passwordShare.findUnique({
        where: { id: input.shareId },
        include: {
          password: { select: { id: true, name: true } },
          team: { select: { id: true, name: true } },
        },
      })

      // Delete share
      await prisma.passwordShare.delete({
        where: { id: input.shareId },
      })

      // Create audit log
      if (shareForLog) {
        const { createAuditLog } = await import("@/lib/audit-log")
        await createAuditLog({
          action: "PASSWORD_SHARE_REMOVED",
          resource: "Password",
          resourceId: shareForLog.passwordId,
          details: {
            passwordName: shareForLog.password.name,
            teamId: shareForLog.teamId,
            teamName: shareForLog.team?.name || null,
          },
          userId: ctx.userId,
        })
      }

      return {
        success: true,
      }
    }),
})

