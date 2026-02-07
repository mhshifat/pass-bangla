import prisma from "@/lib/prisma"
import { createTRPCRouter, protectedProcedure } from "@/trpc/init"
import z from "zod"
import { Prisma } from "@/app/generated"

export const insightsRouter = createTRPCRouter({
  /**
   * Get password health score
   * Calculates overall password health based on strength, breaches, expiration, etc.
   */
  passwordHealthScore: protectedProcedure("password.view")
    .input(
      z.object({
        dateRange: z
          .object({
            start: z.date().optional(),
            end: z.date().optional(),
          })
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Use cached companyId and userTeams from context (already fetched)
      const companyId = ctx.companyId
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

      // Apply date range if provided
      if (input.dateRange?.start || input.dateRange?.end) {
        passwordWhere.createdAt = {}
        if (input.dateRange.start) {
          passwordWhere.createdAt.gte = input.dateRange.start
        }
        if (input.dateRange.end) {
          passwordWhere.createdAt.lte = input.dateRange.end
        }
      }

      // Get password statistics
      const [
        totalPasswords,
        strongPasswords,
        mediumPasswords,
        weakPasswords,
        expiredPasswords,
        expiringPasswords,
        breachedPasswords,
        passwordsWithMFA,
        passwordsWithoutRotation,
      ] = await Promise.all([
        prisma.password.count({ where: passwordWhere }),
        prisma.password.count({
          where: { ...passwordWhere, strength: "STRONG" },
        }),
        prisma.password.count({
          where: { ...passwordWhere, strength: "MEDIUM" },
        }),
        prisma.password.count({
          where: { ...passwordWhere, strength: "WEAK" },
        }),
        prisma.password.count({
          where: {
            ...passwordWhere,
            expiresAt: { not: null, lt: new Date() },
          },
        }),
        prisma.password.count({
          where: {
            ...passwordWhere,
            expiresAt: {
              not: null,
              gte: new Date(),
              lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Next 30 days
            },
          },
        }),
        prisma.passwordBreach.count({
          where: {
            password: passwordWhere,
            isBreached: true,
            resolved: false,
          },
        }),
        prisma.password.count({
          where: { ...passwordWhere, hasTotp: true },
        }),
        prisma.password.count({
          where: {
            ...passwordWhere,
            rotationPolicyId: null,
          },
        }),
      ])

      // Calculate health score (0-100)
      let score = 100

      // Deduct points for weak passwords (30 points max)
      if (totalPasswords > 0) {
        const weakPercentage = (weakPasswords / totalPasswords) * 100
        score -= Math.min(30, weakPercentage * 0.3)
      }

      // Deduct points for breached passwords (25 points max)
      if (totalPasswords > 0) {
        const breachedPercentage = (breachedPasswords / totalPasswords) * 100
        score -= Math.min(25, breachedPercentage * 0.25)
      }

      // Deduct points for expired passwords (20 points max)
      if (totalPasswords > 0) {
        const expiredPercentage = (expiredPasswords / totalPasswords) * 100
        score -= Math.min(20, expiredPercentage * 0.2)
      }

      // Deduct points for passwords without rotation policy (15 points max)
      if (totalPasswords > 0) {
        const noRotationPercentage =
          (passwordsWithoutRotation / totalPasswords) * 100
        score -= Math.min(15, noRotationPercentage * 0.15)
      }

      // Deduct points for passwords without MFA (10 points max)
      if (totalPasswords > 0) {
        const noMFAPercentage =
          ((totalPasswords - passwordsWithMFA) / totalPasswords) * 100
        score -= Math.min(10, noMFAPercentage * 0.1)
      }

      score = Math.max(0, Math.round(score))

      // Determine health status
      let status: "excellent" | "good" | "fair" | "poor" = "excellent"
      if (score >= 90) {
        status = "excellent"
      } else if (score >= 75) {
        status = "good"
      } else if (score >= 50) {
        status = "fair"
      } else {
        status = "poor"
      }

      return {
        score,
        status,
        totalPasswords,
        strongPasswords,
        mediumPasswords,
        weakPasswords,
        expiredPasswords,
        expiringPasswords,
        breachedPasswords,
        passwordsWithMFA,
        passwordsWithoutRotation,
        breakdown: {
          strength: {
            strong: strongPasswords,
            medium: mediumPasswords,
            weak: weakPasswords,
          },
          security: {
            breached: breachedPasswords,
            withMFA: passwordsWithMFA,
            withoutRotation: passwordsWithoutRotation,
          },
          expiration: {
            expired: expiredPasswords,
            expiring: expiringPasswords,
          },
        },
      }
    }),

  /**
   * Get security posture metrics
   * Overall security health of the organization
   */
  securityPosture: protectedProcedure(["password.view", "audit.view"])
    .input(
      z.object({
        dateRange: z
          .object({
            start: z.date().optional(),
            end: z.date().optional(),
          })
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const hasUserView = ctx.permissions.includes("user.view")
      const hasAuditView = ctx.permissions.includes("audit.view")

      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const startDate = input.dateRange?.start || thirtyDaysAgo
      const endDate = input.dateRange?.end || now

      // Build audit log where clause with company filtering
      const auditWhere: Prisma.AuditLogWhereInput = {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      }

      if (companyId) {
        auditWhere.user = { companyId }
      }

      // Get security metrics
      const [
        totalUsers,
        usersWithMFA,
        activeUsers,
        failedLogins,
        successfulLogins,
        threatEvents,
        resolvedThreats,
        passwordBreaches,
        resolvedBreaches,
        suspiciousIPs,
      ] = await Promise.all([
        // User metrics
        hasUserView
          ? prisma.user.count({
              where: companyId ? { companyId } : undefined,
            })
          : Promise.resolve(0),
        hasUserView
          ? prisma.user.count({
              where: {
                ...(companyId ? { companyId } : {}),
                mfaEnabled: true,
                isActive: true,
              },
            })
          : Promise.resolve(0),
        hasUserView
          ? prisma.user.count({
              where: {
                ...(companyId ? { companyId } : {}),
                isActive: true,
                lastLoginAt: { gte: thirtyDaysAgo },
              },
            })
          : Promise.resolve(0),
        // Login metrics
        hasAuditView
          ? prisma.auditLog.count({
              where: {
                ...auditWhere,
                action: "LOGIN_FAILED",
              },
            })
          : Promise.resolve(0),
        hasAuditView
          ? prisma.auditLog.count({
              where: {
                ...auditWhere,
                action: "LOGIN_SUCCESS",
              },
            })
          : Promise.resolve(0),
        // Threat events
        hasAuditView
          ? prisma.threatEvent.count({
              where: {
                ...(companyId ? { companyId } : {}),
                createdAt: { gte: startDate, lte: endDate },
              },
            })
          : Promise.resolve(0),
        hasAuditView
          ? prisma.threatEvent.count({
              where: {
                ...(companyId ? { companyId } : {}),
                createdAt: { gte: startDate, lte: endDate },
                isResolved: true,
              },
            })
          : Promise.resolve(0),
        // Password breaches
        prisma.passwordBreach.count({
          where: {
            ...(companyId
              ? {
                  password: {
                    owner: {
                      companyId,
                    },
                  },
                }
              : {}),
            isBreached: true,
            checkedAt: { gte: startDate, lte: endDate },
          },
        }),
        prisma.passwordBreach.count({
          where: {
            ...(companyId
              ? {
                  password: {
                    owner: {
                      companyId,
                    },
                  },
                }
              : {}),
            isBreached: true,
            resolved: true,
            checkedAt: { gte: startDate, lte: endDate },
          },
        }),
        // Suspicious IPs (IPs with >5 failed logins)
        hasAuditView
          ? prisma.auditLog.groupBy({
              by: ["ipAddress"],
              where: {
                ...auditWhere,
                action: "LOGIN_FAILED",
                ipAddress: { not: null },
              },
              _count: true,
              having: {
                ipAddress: {
                  _count: {
                    gt: 5,
                  },
                },
              },
            })
          : Promise.resolve([]),
      ])

      // Calculate security score (0-100)
      let score = 100

      // MFA adoption (20 points)
      if (totalUsers > 0) {
        const mfaPercentage = (usersWithMFA / totalUsers) * 100
        if (mfaPercentage < 50) {
          score -= 20
        } else if (mfaPercentage < 75) {
          score -= 10
        } else if (mfaPercentage < 90) {
          score -= 5
        }
      }

      // Failed login ratio (25 points)
      const totalLogins = failedLogins + successfulLogins
      if (totalLogins > 0) {
        const failureRate = (failedLogins / totalLogins) * 100
        if (failureRate > 20) {
          score -= 25
        } else if (failureRate > 10) {
          score -= 15
        } else if (failureRate > 5) {
          score -= 5
        }
      }

      // Threat resolution (20 points)
      if (threatEvents > 0) {
        const resolutionRate = (resolvedThreats / threatEvents) * 100
        if (resolutionRate < 50) {
          score -= 20
        } else if (resolutionRate < 75) {
          score -= 10
        } else if (resolutionRate < 90) {
          score -= 5
        }
      }

      // Breach resolution (20 points)
      if (passwordBreaches > 0) {
        const breachResolutionRate = (resolvedBreaches / passwordBreaches) * 100
        if (breachResolutionRate < 50) {
          score -= 20
        } else if (breachResolutionRate < 75) {
          score -= 10
        } else if (breachResolutionRate < 90) {
          score -= 5
        }
      }

      // Suspicious activity (15 points)
      if (suspiciousIPs.length > 5) {
        score -= 15
      } else if (suspiciousIPs.length > 2) {
        score -= 10
      } else if (suspiciousIPs.length > 0) {
        score -= 5
      }

      score = Math.max(0, Math.round(score))

      // Determine posture status
      let status: "excellent" | "good" | "fair" | "poor" = "excellent"
      if (score >= 85) {
        status = "excellent"
      } else if (score >= 70) {
        status = "good"
      } else if (score >= 50) {
        status = "fair"
      } else {
        status = "poor"
      }

      return {
        score,
        status,
        metrics: {
          users: {
            total: totalUsers,
            withMFA: usersWithMFA,
            active: activeUsers,
            mfaAdoptionRate:
              totalUsers > 0 ? (usersWithMFA / totalUsers) * 100 : 0,
          },
          authentication: {
            successfulLogins,
            failedLogins,
            failureRate:
              totalLogins > 0 ? (failedLogins / totalLogins) * 100 : 0,
          },
          threats: {
            total: threatEvents,
            resolved: resolvedThreats,
            unresolved: threatEvents - resolvedThreats,
            resolutionRate:
              threatEvents > 0 ? (resolvedThreats / threatEvents) * 100 : 0,
          },
          breaches: {
            total: passwordBreaches,
            resolved: resolvedBreaches,
            unresolved: passwordBreaches - resolvedBreaches,
            resolutionRate:
              passwordBreaches > 0
                ? (resolvedBreaches / passwordBreaches) * 100
                : 0,
          },
          suspiciousActivity: {
            suspiciousIPs: suspiciousIPs.length,
            ipAddresses: suspiciousIPs.map((ip) => ip.ipAddress).filter(Boolean),
          },
        },
      }
    }),

  /**
   * Get user engagement analytics
   * Track user activity, login patterns, feature usage
   */
  userEngagement: protectedProcedure(["user.view", "audit.view"])
    .input(
      z.object({
        dateRange: z
          .object({
            start: z.date().optional(),
            end: z.date().optional(),
          })
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const startDate = input.dateRange?.start || thirtyDaysAgo
      const endDate = input.dateRange?.end || now

      // Build audit log where clause
      const auditWhere: Prisma.AuditLogWhereInput = {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      }

      if (companyId) {
        auditWhere.user = { companyId }
      }

      // Get engagement metrics
      const [
        totalUsers,
        activeUsers,
        dailyActiveUsers,
        weeklyActiveUsers,
        loginCount,
        passwordActions,
        reportActions,
        teamActions,
        mostActiveUsers,
        activityByDay,
        activityByHour,
      ] = await Promise.all([
        // User counts
        prisma.user.count({
          where: companyId ? { companyId } : undefined,
        }),
        prisma.user.count({
          where: {
            ...(companyId ? { companyId } : {}),
            lastLoginAt: { gte: startDate },
          },
        }),
        // Daily active users (last 24 hours)
        prisma.user.count({
          where: {
            ...(companyId ? { companyId } : {}),
            lastLoginAt: {
              gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            },
          },
        }),
        // Weekly active users (last 7 days)
        prisma.user.count({
          where: {
            ...(companyId ? { companyId } : {}),
            lastLoginAt: {
              gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),
        // Login actions
        prisma.auditLog.count({
          where: {
            ...auditWhere,
            action: "LOGIN_SUCCESS",
          },
        }),
        // Password-related actions
        prisma.auditLog.count({
          where: {
            ...auditWhere,
            action: {
              in: [
                "PASSWORD_CREATED",
                "PASSWORD_UPDATED",
                "PASSWORD_VIEWED",
                "PASSWORD_SHARED",
                "PASSWORD_DELETED",
              ],
            },
          },
        }),
        // Report actions
        prisma.auditLog.count({
          where: {
            ...auditWhere,
            action: {
              in: ["REPORT_GENERATED", "REPORT_DOWNLOADED"],
            },
          },
        }),
        // Team actions
        prisma.auditLog.count({
          where: {
            ...auditWhere,
            action: {
              in: [
                "TEAM_CREATED",
                "TEAM_MEMBER_ADDED",
                "TEAM_MEMBER_REMOVED",
                "TEAM_UPDATED",
              ],
            },
          },
        }),
        // Most active users
        prisma.auditLog.groupBy({
          by: ["userId"],
          where: auditWhere,
          _count: true,
          orderBy: {
            _count: {
              userId: "desc",
            },
          },
          take: 10,
        }),
        // Activity by day
        companyId
          ? prisma.$queryRaw<
              Array<{ date: string; count: bigint }>
            >`
              SELECT DATE_TRUNC('day', "createdAt")::date::text as date, COUNT(*)::int as count
              FROM "AuditLog"
              WHERE "createdAt" >= ${startDate}
                AND "createdAt" <= ${endDate}
                AND "userId" IN (SELECT id FROM "User" WHERE "companyId" = ${companyId})
              GROUP BY DATE_TRUNC('day', "createdAt")
              ORDER BY date ASC
            `
          : prisma.$queryRaw<
              Array<{ date: string; count: bigint }>
            >`
              SELECT DATE_TRUNC('day', "createdAt")::date::text as date, COUNT(*)::int as count
              FROM "AuditLog"
              WHERE "createdAt" >= ${startDate}
                AND "createdAt" <= ${endDate}
              GROUP BY DATE_TRUNC('day', "createdAt")
              ORDER BY date ASC
            `,
        // Activity by hour
        companyId
          ? prisma.$queryRaw<
              Array<{ hour: number; count: bigint }>
            >`
              SELECT EXTRACT(HOUR FROM "createdAt")::int as hour, COUNT(*)::int as count
              FROM "AuditLog"
              WHERE "createdAt" >= ${startDate}
                AND "createdAt" <= ${endDate}
                AND "userId" IN (SELECT id FROM "User" WHERE "companyId" = ${companyId})
              GROUP BY EXTRACT(HOUR FROM "createdAt")
              ORDER BY hour ASC
            `
          : prisma.$queryRaw<
              Array<{ hour: number; count: bigint }>
            >`
              SELECT EXTRACT(HOUR FROM "createdAt")::int as hour, COUNT(*)::int as count
              FROM "AuditLog"
              WHERE "createdAt" >= ${startDate}
                AND "createdAt" <= ${endDate}
              GROUP BY EXTRACT(HOUR FROM "createdAt")
              ORDER BY hour ASC
            `,
      ])

      // Get user names for most active users (filtered by company)
      const userIds = mostActiveUsers
        .map((u) => u.userId)
        .filter((id): id is string => id !== null)
      const userWhere: Prisma.UserWhereInput = { id: { in: userIds } }
      if (companyId) {
        userWhere.companyId = companyId
      }
      const users =
        userIds.length > 0
          ? await prisma.user.findMany({
              where: userWhere,
              select: { id: true, name: true, email: true },
            })
          : []
      const userMap = new Map(users.map((u) => [u.id, u]))

      return {
        overview: {
          totalUsers,
          activeUsers,
          dailyActiveUsers,
          weeklyActiveUsers,
          engagementRate:
            totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0,
        },
        activity: {
          logins: loginCount,
          passwordActions,
          reportActions,
          teamActions,
          totalActions:
            loginCount + passwordActions + reportActions + teamActions,
        },
        mostActiveUsers: mostActiveUsers
          .map((u) => ({
            userId: u.userId,
            userName: userMap.get(u.userId || "")?.name || "Unknown",
            userEmail: userMap.get(u.userId || "")?.email || "N/A",
            actionCount: u._count.userId || 0,
          }))
          .filter((u) => u.userId),
        activityByDay: activityByDay.map((item) => ({
          date: item.date,
          count: Number(item.count),
        })),
        activityByHour: activityByHour.map((item) => ({
          hour: Number(item.hour),
          count: Number(item.count),
        })),
      }
    }),

  /**
   * Get team collaboration insights
   * Track team sharing, collaboration patterns
   */
  teamCollaboration: protectedProcedure(["team.view", "password.view"])
    .input(
      z.object({
        dateRange: z
          .object({
            start: z.date().optional(),
            end: z.date().optional(),
          })
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const startDate = input.dateRange?.start || thirtyDaysAgo
      const endDate = input.dateRange?.end || now

      // Get collaboration metrics
      const [
        totalTeams,
        activeTeams,
        totalShares,
        activeShares,
        sharedPasswords,
        teamMembers,
        sharesByTeam,
        topCollaborators,
      ] = await Promise.all([
        // Team counts - filter by company through members
        companyId
          ? prisma.team.count({
              where: {
                members: {
                  some: {
                    user: {
                      companyId,
                    },
                  },
                },
              },
            })
          : prisma.team.count(),
        // Active teams - filter by company through members
        companyId
          ? prisma.team.count({
              where: {
                members: {
                  some: {
                    user: {
                      companyId,
                    },
                  },
                },
                updatedAt: { gte: startDate },
              },
            })
          : prisma.team.count({
              where: {
                updatedAt: { gte: startDate },
              },
            }),
        // Password shares
        prisma.passwordShare.count({
          where: {
            ...(companyId
              ? {
                  password: {
                    owner: { companyId },
                  },
                }
              : {}),
          },
        }),
        prisma.passwordShare.count({
          where: {
            ...(companyId
              ? {
                  password: {
                    owner: { companyId },
                  },
                }
              : {}),
            createdAt: { gte: startDate, lte: endDate },
          },
        }),
        // Shared passwords count
        prisma.password.count({
          where: {
            ...(companyId ? { owner: { companyId } } : {}),
            sharedWith: {
              some: {},
            },
          },
        }),
        // Team members - filter by company through user
        companyId
          ? prisma.teamMember.count({
              where: {
                user: {
                  companyId,
                },
              },
            })
          : prisma.teamMember.count(),
        // Shares by team
        prisma.passwordShare.groupBy({
          by: ["teamId"],
          where: {
            ...(companyId
              ? {
                  password: {
                    owner: { companyId },
                  },
                }
              : {}),
            createdAt: { gte: startDate, lte: endDate },
          },
          _count: true,
          orderBy: {
            _count: {
              teamId: "desc",
            },
          },
          take: 10,
        }),
        // Top collaborators (users who share most)
        prisma.auditLog.groupBy({
          by: ["userId"],
          where: {
            ...(companyId
              ? {
                  user: { companyId },
                }
              : {}),
            action: "PASSWORD_SHARED",
            createdAt: { gte: startDate, lte: endDate },
          },
          _count: true,
          orderBy: {
            _count: {
              userId: "desc",
            },
          },
          take: 10,
        }),
      ])

      // Get team names for shares by team (filtered by company)
      const teamIds = sharesByTeam
        .map((s) => s.teamId)
        .filter((id): id is string => id !== null)
      const teamWhere: Prisma.TeamWhereInput = { id: { in: teamIds } }
      if (companyId) {
        teamWhere.companyId = companyId
      }
      const teams =
        teamIds.length > 0
          ? await prisma.team.findMany({
              where: teamWhere,
              select: { id: true, name: true },
            })
          : []
      const teamMap = new Map(teams.map((t) => [t.id, t]))

      // Get user names for top collaborators (filtered by company)
      const collaboratorIds = topCollaborators
        .map((c) => c.userId)
        .filter((id): id is string => id !== null)
      const collaboratorWhere: Prisma.UserWhereInput = { id: { in: collaboratorIds } }
      if (companyId) {
        collaboratorWhere.companyId = companyId
      }
      const collaborators =
        collaboratorIds.length > 0
          ? await prisma.user.findMany({
              where: collaboratorWhere,
              select: { id: true, name: true, email: true },
            })
          : []
      const collaboratorMap = new Map(
        collaborators.map((u) => [u.id, u])
      )

      return {
        overview: {
          totalTeams,
          activeTeams,
          totalShares,
          activeShares,
          sharedPasswords,
          teamMembers,
          averageMembersPerTeam:
            totalTeams > 0 ? teamMembers / totalTeams : 0,
          collaborationRate:
            totalTeams > 0 ? (activeTeams / totalTeams) * 100 : 0,
        },
        sharesByTeam: sharesByTeam
          .map((s) => ({
            teamId: s.teamId,
            teamName: teamMap.get(s.teamId || "")?.name || "Unknown Team",
            shareCount: s._count.teamId || 0,
          }))
          .filter((s) => s.teamId),
        topCollaborators: topCollaborators
          .map((c) => ({
            userId: c.userId,
            userName:
              collaboratorMap.get(c.userId || "")?.name || "Unknown",
            userEmail:
              collaboratorMap.get(c.userId || "")?.email || "N/A",
            shareCount: c._count.userId || 0,
          }))
          .filter((c) => c.userId),
      }
    }),

  /**
   * Get trend analysis
   * Track trends over time for various metrics
   */
  trends: protectedProcedure("password.view")
    .input(
      z.object({
        metric: z.enum([
          "passwords",
          "users",
          "logins",
          "security_events",
          "collaboration",
        ]),
        period: z.enum(["7d", "30d", "90d", "1y"]).default("30d"),
      })
    )
    .query(async ({ ctx, input }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const now = new Date()
      let startDate: Date
      switch (input.period) {
        case "7d":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case "30d":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case "90d":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        case "1y":
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
          break
      }

      const hasUserView = ctx.permissions.includes("user.view")
      const hasAuditView = ctx.permissions.includes("audit.view")
      const hasTeamView = ctx.permissions.includes("team.view")

      // Build queries based on metric
      switch (input.metric) {
        case "passwords": {
          // Use cached userTeams from context (already fetched, no extra query needed)
          const teamIds = ctx.userTeams

          const passwordWhere: Prisma.PasswordWhereInput = {
            OR: [
              { ownerId: ctx.userId },
              ...(teamIds.length > 0
                ? [
                    {
                      sharedWith: {
                        some: {
                          teamId: { in: teamIds },
                        },
                      },
                    },
                  ]
                : []),
            ],
            createdAt: { gte: startDate, lte: now },
          }

          const trends = companyId
            ? await prisma.$queryRaw<
                Array<{ date: string; count: bigint }>
              >`
                SELECT DATE_TRUNC('day', "createdAt")::date::text as date, COUNT(*)::int as count
                FROM "Password"
                WHERE "createdAt" >= ${startDate}
                  AND "createdAt" <= ${now}
                  AND "ownerId" IN (SELECT id FROM "User" WHERE "companyId" = ${companyId})
                GROUP BY DATE_TRUNC('day', "createdAt")
                ORDER BY date ASC
              `
            : await prisma.$queryRaw<
                Array<{ date: string; count: bigint }>
              >`
                SELECT DATE_TRUNC('day', "createdAt")::date::text as date, COUNT(*)::int as count
                FROM "Password"
                WHERE "createdAt" >= ${startDate}
                  AND "createdAt" <= ${now}
                GROUP BY DATE_TRUNC('day', "createdAt")
                ORDER BY date ASC
              `

          return {
            metric: input.metric,
            period: input.period,
            data: trends.map((t) => ({
              date: t.date,
              value: Number(t.count),
            })),
          }
        }

        case "users": {
          if (!hasUserView) {
            return { metric: input.metric, period: input.period, data: [] }
          }

          const trends = companyId
            ? await prisma.$queryRaw<
                Array<{ date: string; count: bigint }>
              >`
                SELECT DATE_TRUNC('day', "createdAt")::date::text as date, COUNT(*)::int as count
                FROM "User"
                WHERE "createdAt" >= ${startDate}
                  AND "createdAt" <= ${now}
                  AND "companyId" = ${companyId}
                GROUP BY DATE_TRUNC('day', "createdAt")
                ORDER BY date ASC
              `
            : await prisma.$queryRaw<
                Array<{ date: string; count: bigint }>
              >`
                SELECT DATE_TRUNC('day', "createdAt")::date::text as date, COUNT(*)::int as count
                FROM "User"
                WHERE "createdAt" >= ${startDate}
                  AND "createdAt" <= ${now}
                GROUP BY DATE_TRUNC('day', "createdAt")
                ORDER BY date ASC
              `

          return {
            metric: input.metric,
            period: input.period,
            data: trends.map((t) => ({
              date: t.date,
              value: Number(t.count),
            })),
          }
        }

        case "logins": {
          if (!hasAuditView) {
            return { metric: input.metric, period: input.period, data: [] }
          }

          const auditWhere: Prisma.AuditLogWhereInput = {
            action: "LOGIN_SUCCESS",
            createdAt: { gte: startDate, lte: now },
          }

          if (companyId) {
            auditWhere.user = { companyId }
          }

          const trends = companyId
            ? await prisma.$queryRaw<
                Array<{ date: string; count: bigint }>
              >`
                SELECT DATE_TRUNC('day', "createdAt")::date::text as date, COUNT(*)::int as count
                FROM "AuditLog"
                WHERE action = 'LOGIN_SUCCESS'
                  AND "createdAt" >= ${startDate}
                  AND "createdAt" <= ${now}
                  AND "userId" IN (SELECT id FROM "User" WHERE "companyId" = ${companyId})
                GROUP BY DATE_TRUNC('day', "createdAt")
                ORDER BY date ASC
              `
            : await prisma.$queryRaw<
                Array<{ date: string; count: bigint }>
              >`
                SELECT DATE_TRUNC('day', "createdAt")::date::text as date, COUNT(*)::int as count
                FROM "AuditLog"
                WHERE action = 'LOGIN_SUCCESS'
                  AND "createdAt" >= ${startDate}
                  AND "createdAt" <= ${now}
                GROUP BY DATE_TRUNC('day', "createdAt")
                ORDER BY date ASC
              `

          return {
            metric: input.metric,
            period: input.period,
            data: trends.map((t) => ({
              date: t.date,
              value: Number(t.count),
            })),
          }
        }

        case "security_events": {
          if (!hasAuditView) {
            return { metric: input.metric, period: input.period, data: [] }
          }

          const trends = companyId
            ? await prisma.$queryRaw<
                Array<{ date: string; count: bigint }>
              >`
                SELECT DATE_TRUNC('day', "createdAt")::date::text as date, COUNT(*)::int as count
                FROM "ThreatEvent"
                WHERE "createdAt" >= ${startDate}
                  AND "createdAt" <= ${now}
                  AND "companyId" = ${companyId}
                GROUP BY DATE_TRUNC('day', "createdAt")
                ORDER BY date ASC
              `
            : await prisma.$queryRaw<
                Array<{ date: string; count: bigint }>
              >`
                SELECT DATE_TRUNC('day', "createdAt")::date::text as date, COUNT(*)::int as count
                FROM "ThreatEvent"
                WHERE "createdAt" >= ${startDate}
                  AND "createdAt" <= ${now}
                GROUP BY DATE_TRUNC('day', "createdAt")
                ORDER BY date ASC
              `

          return {
            metric: input.metric,
            period: input.period,
            data: trends.map((t) => ({
              date: t.date,
              value: Number(t.count),
            })),
          }
        }

        case "collaboration": {
          if (!hasTeamView) {
            return { metric: input.metric, period: input.period, data: [] }
          }

          const trends = companyId
            ? await prisma.$queryRaw<
                Array<{ date: string; count: bigint }>
              >`
                SELECT DATE_TRUNC('day', "createdAt")::date::text as date, COUNT(*)::int as count
                FROM "PasswordShare"
                WHERE "createdAt" >= ${startDate}
                  AND "createdAt" <= ${now}
                  AND "passwordId" IN (SELECT id FROM "Password" WHERE "ownerId" IN (SELECT id FROM "User" WHERE "companyId" = ${companyId}))
                GROUP BY DATE_TRUNC('day', "createdAt")
                ORDER BY date ASC
              `
            : await prisma.$queryRaw<
                Array<{ date: string; count: bigint }>
              >`
                SELECT DATE_TRUNC('day', "createdAt")::date::text as date, COUNT(*)::int as count
                FROM "PasswordShare"
                WHERE "createdAt" >= ${startDate}
                  AND "createdAt" <= ${now}
                GROUP BY DATE_TRUNC('day', "createdAt")
                ORDER BY date ASC
              `

          return {
            metric: input.metric,
            period: input.period,
            data: trends.map((t) => ({
              date: t.date,
              value: Number(t.count),
            })),
          }
        }

        default:
          return { metric: input.metric, period: input.period, data: [] }
      }
    }),
})

