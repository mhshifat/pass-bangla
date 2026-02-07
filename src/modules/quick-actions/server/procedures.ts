import prisma from "@/lib/prisma"
import { createTRPCRouter, protectedProcedure } from "@/trpc/init"
import z from "zod"
import { Prisma } from "@/app/generated"

export const quickActionsRouter = createTRPCRouter({
  /**
   * Get recent passwords (last accessed)
   * Based on audit logs of PASSWORD_VIEWED actions
   */
  recentPasswords: protectedProcedure("password.view")
    .input(
      z.object({
        limit: z.number().min(1).max(20).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      // Use cached userTeams from context (already fetched, no extra query needed)
      const teamIds = ctx.userTeams

      // Build password where clause
      const passwordWhere: Prisma.PasswordWhereInput = {
        OR: [
          { ownerId: ctx.userId },
          ...(teamIds.length > 0
            ? [
                {
                  sharedWith: {
                    some: {
                      teamId: { in: teamIds },
                      OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: new Date() } },
                      ],
                    },
                  },
                },
              ]
            : []),
        ],
      }

      // Get recent password views from audit logs
      const recentViews = await prisma.auditLog.findMany({
        where: {
          userId: ctx.userId,
          action: "PASSWORD_VIEWED",
          resourceId: { not: null },
        },
        select: {
          resourceId: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: input.limit * 2, // Get more to account for duplicates
        distinct: ["resourceId"],
      })

      const passwordIds = recentViews
        .map((view) => view.resourceId)
        .filter((id): id is string => id !== null)
        .slice(0, input.limit)

      if (passwordIds.length === 0) {
        return []
      }

      // Fetch password details
      const passwords = await prisma.password.findMany({
        where: {
          id: { in: passwordIds },
          ...passwordWhere,
        },
        select: {
          id: true,
          name: true,
          username: true,
          url: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
      })

      // Sort by most recent view
      const viewMap = new Map(
        recentViews.map((view) => [view.resourceId, view.createdAt])
      )
      passwords.sort((a, b) => {
        const aTime = viewMap.get(a.id)?.getTime() || 0
        const bTime = viewMap.get(b.id)?.getTime() || 0
        return bTime - aTime
      })

      return passwords.slice(0, input.limit)
    }),

  /**
   * Search passwords quickly
   * Fast search for command palette
   */
  searchPasswords: protectedProcedure("password.view")
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(20).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      // Use cached userTeams from context (already fetched, no extra query needed)
      const teamIds = ctx.userTeams

      // Build password where clause
      const passwordWhere: Prisma.PasswordWhereInput = {
        AND: [
          {
            OR: [
              { ownerId: ctx.userId },
              ...(teamIds.length > 0
                ? [
                    {
                      sharedWith: {
                        some: {
                          teamId: { in: teamIds },
                          OR: [
                            { expiresAt: null },
                            { expiresAt: { gt: new Date() } },
                          ],
                        },
                      },
                    },
                  ]
                : []),
            ],
          },
          {
            OR: [
              { name: { contains: input.query, mode: "insensitive" } },
              { username: { contains: input.query, mode: "insensitive" } },
              { url: { contains: input.query, mode: "insensitive" } },
              {
                tags: {
                  some: {
                    tag: {
                      name: { contains: input.query, mode: "insensitive" },
                    },
                  },
                },
              },
            ],
          },
        ],
      }

      const passwords = await prisma.password.findMany({
        where: passwordWhere,
        select: {
          id: true,
          name: true,
          username: true,
          url: true,
        },
        orderBy: [
          { isFavorite: "desc" },
          { updatedAt: "desc" },
        ],
        take: input.limit,
      })

      return passwords
    }),
})

