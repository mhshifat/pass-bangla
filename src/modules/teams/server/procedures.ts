import prisma from "@/lib/prisma"
import { createTRPCRouter, protectedProcedure } from "@/trpc/init"
import z from "zod"
import { TRPCError } from "@trpc/server"
import { Prisma } from "@/app/generated"

const idSchema = z.string().min(1).max(100)
const MAX_LIST = 500

export const teamsRouter = createTRPCRouter({
  create: protectedProcedure("team.create")
    .input(
      z.object({
        name: z.string().min(2, "Name must be at least 2 characters").max(100),
        description: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Check if team already exists in the same company
      const existingTeam = await prisma.team.findFirst({
        where: {
          name: input.name,
          companyId,
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
        search: z.string().max(100).optional(),
      }).optional()
    )
    .query(async ({ input = {}, ctx }) => {
      const { page = 1, pageSize = 10, search } = input

      // Build where clause - filter teams by company
      const where: Prisma.TeamWhereInput = { companyId: ctx.companyId }

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
            _count: {
              select: { members: true, sharedPasswords: true },
            },
            // Only the manager is needed for display; counts come from _count
            members: {
              where: { role: "MANAGER" },
              take: 1,
              select: {
                user: {
                  select: {
                    name: true,
                  },
                },
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
        members: team._count.members,
        passwords: team._count.sharedPasswords,
        createdAt: team.createdAt.toISOString(),
        manager: team.members[0]?.user.name || "—",
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
        id: idSchema,
        name: z.string().min(2).max(100).optional(),
        description: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input

      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Check if team exists and belongs to the same company
      const existingTeam = await prisma.team.findFirst({
        where: { id, companyId },
      })

      if (!existingTeam) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      // Check if name is being changed and if new name already exists in the same company
      if (data.name && data.name !== existingTeam.name) {
        const nameExists = await prisma.team.findFirst({
          where: { name: data.name, companyId },
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
        where: { id: existingTeam.id },
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
        id: idSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if team exists and belongs to the same company
      const existingTeam = await prisma.team.findFirst({
        where: { id: input.id, companyId: ctx.companyId },
        select: { id: true, name: true },
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
        id: idSchema,
      })
    )
    .query(async ({ input, ctx }) => {
      const team = await prisma.team.findFirst({
        where: { id: input.id, companyId: ctx.companyId },
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
            take: MAX_LIST,
          },
          sharedPasswords: {
            take: MAX_LIST,
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
      // Every count is scoped to the caller's company teams
      const teamWhere: Prisma.TeamWhereInput = { companyId: ctx.companyId }

      const [total, totalMembers, totalPasswords, teamMemberRows] = await Promise.all([
        prisma.team.count({ where: teamWhere }),
        prisma.teamMember.count({ where: { team: teamWhere, user: { companyId: ctx.companyId } } }),
        prisma.passwordShare.count({ where: { team: teamWhere } }),
        // Members across the same teams, for the average team size
        prisma.teamMember.count({ where: { team: teamWhere } }),
      ])

      const avgTeamSize = total > 0 ? Math.round(teamMemberRows / total) : 0

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
        teamId: idSchema,
        userId: idSchema,
        role: z.enum(["MANAGER", "MEMBER"]).default("MEMBER"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.companyId

      // Team and user must both belong to the caller's company
      const [team, user] = await Promise.all([
        prisma.team.findFirst({
          where: { id: input.teamId, companyId },
          select: { id: true },
        }),
        prisma.user.findFirst({
          where: { id: input.userId, companyId },
          select: { id: true },
        }),
      ])

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found or does not belong to your company",
        })
      }

      // Add member; the unique (teamId, userId) pair rejects duplicates
      const member = await prisma.teamMember
        .create({
          data: {
            teamId: team.id,
            userId: user.id,
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
        .catch((error: { code?: string }) => {
          if (error?.code === "P2002") {
            throw new TRPCError({
              code: "CONFLICT",
              message: "User is already a member of this team",
            })
          }
          throw error
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
        teamId: idSchema,
        userId: idSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.companyId

      // Member must belong to a team and a user of the caller's company
      const member = await prisma.teamMember.findFirst({
        where: {
          teamId: input.teamId,
          userId: input.userId,
          team: { companyId },
          user: { companyId },
        },
        select: { id: true },
      })

      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found",
        })
      }

      // Remove member
      await prisma.teamMember.delete({
        where: { id: member.id },
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
        teamId: idSchema,
        userId: idSchema,
        role: z.enum(["MANAGER", "MEMBER"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.companyId

      // Member must belong to a team and a user of the caller's company
      const member = await prisma.teamMember.findFirst({
        where: {
          teamId: input.teamId,
          userId: input.userId,
          team: { companyId },
          user: { companyId },
        },
        select: { id: true, role: true },
      })

      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found",
        })
      }

      // Update member role
      const updatedMember = await prisma.teamMember.update({
        where: { id: member.id },
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

      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "TEAM_MEMBER_ROLE_CHANGED",
        resource: "Team",
        resourceId: input.teamId,
        details: { userId: input.userId, from: member.role, to: input.role },
        userId: ctx.userId,
      })

      return {
        success: true,
        member: updatedMember,
      }
    }),

  getAvailableUsers: protectedProcedure("team.edit")
    .input(
      z.object({
        teamId: idSchema,
        search: z.string().max(100).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const companyId = ctx.companyId

      // Verify team belongs to same company
      const team = await prisma.team.findFirst({
        where: { id: input.teamId, companyId },
        select: { id: true },
      })

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      // Active users of the same company who are not in the team (the caller is excluded too)
      const where: Prisma.UserWhereInput = {
        id: { not: ctx.userId },
        isActive: true,
        companyId,
        teamMemberships: { none: { teamId: team.id } },
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
        teamId: idSchema,
      })
    )
    .query(async ({ input, ctx }) => {
      // Check if team exists and belongs to the same company
      const team = await prisma.team.findFirst({
        where: { id: input.teamId, companyId: ctx.companyId },
        select: { id: true },
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
          teamId: team.id,
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
        take: MAX_LIST,
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
        teamId: idSchema,
        search: z.string().max(100).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const team = await prisma.team.findFirst({
        where: { id: input.teamId, companyId: ctx.companyId },
        select: { id: true },
      })

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      // Passwords owned by the current user that aren't already shared with this team
      const where: Prisma.PasswordWhereInput = {
        ownerId: ctx.userId,
        sharedWith: { none: { teamId: team.id } },
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
        passwordId: idSchema,
        teamId: idSchema,
        expiresAt: z.string().max(40).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid expiration date",
        })
      }

      // The password must be owned by the caller; the team must be in the caller's company
      const [password, team] = await Promise.all([
        prisma.password.findFirst({
          where: { id: input.passwordId, ownerId: ctx.userId },
          select: { id: true, name: true },
        }),
        prisma.team.findFirst({
          where: { id: input.teamId, companyId: ctx.companyId },
          select: { id: true, name: true },
        }),
      ])

      if (!password) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only share passwords you own",
        })
      }

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      // Check if password is already shared with this team
      const existingShare = await prisma.passwordShare.findFirst({
        where: {
          passwordId: password.id,
          teamId: team.id,
        },
        select: { id: true },
      })

      if (existingShare) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Password is already shared with this team",
        })
      }

      // Create password share (default permission is READ)
      const share = await prisma.passwordShare.create({
        data: {
          passwordId: password.id,
          teamId: team.id,
          permission: "READ", // Default permission
          expiresAt,
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
        resourceId: password.id,
        details: {
          passwordName: password.name,
          teamId: team.id,
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
        shareId: idSchema,
        expiresAt: z.string().max(40).optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid expiration date",
        })
      }

      // Only team shares of passwords the caller owns, for teams in the caller's company
      const share = await prisma.passwordShare.findFirst({
        where: {
          id: input.shareId,
          teamId: { not: null },
          team: { companyId: ctx.companyId },
          password: { ownerId: ctx.userId },
        },
        select: { id: true },
      })

      if (!share) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password share not found",
        })
      }

      // Update share expiration only
      const updatedShare = await prisma.passwordShare.update({
        where: { id: share.id },
        data: {
          expiresAt,
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
        shareId: idSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only team shares of passwords the caller owns, for teams in the caller's company
      const share = await prisma.passwordShare.findFirst({
        where: {
          id: input.shareId,
          teamId: { not: null },
          team: { companyId: ctx.companyId },
          password: { ownerId: ctx.userId },
        },
        select: {
          id: true,
          passwordId: true,
          teamId: true,
          password: { select: { name: true } },
          team: { select: { name: true } },
        },
      })

      if (!share) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password share not found",
        })
      }

      // Delete share
      await prisma.passwordShare.delete({
        where: { id: share.id },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "PASSWORD_SHARE_REMOVED",
        resource: "Password",
        resourceId: share.passwordId,
        details: {
          passwordName: share.password.name,
          teamId: share.teamId,
          teamName: share.team?.name || null,
        },
        userId: ctx.userId,
      })

      return {
        success: true,
      }
    }),
})
