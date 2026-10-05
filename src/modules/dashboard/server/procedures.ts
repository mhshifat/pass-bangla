import prisma from "@/lib/prisma"
import { createTRPCRouter, protectedProcedure } from "@/trpc/init"
import z from "zod"
import { Prisma } from "@/app/generated"
import { getSettings, readUserSetting, writeSettings } from "@/lib/settings-cache"

type DashboardCtx = { userId: string; userTeams: string[] }

// The dashboard cards each call their own procedure in the same request; shared
// aggregates are computed once per request context.
const requestMemo = new WeakMap<object, Map<string, Promise<unknown>>>()

function once<T>(ctx: object, key: string, load: () => Promise<T>): Promise<T> {
  let entries = requestMemo.get(ctx)
  if (!entries) {
    entries = new Map()
    requestMemo.set(ctx, entries)
  }
  let value = entries.get(key) as Promise<T> | undefined
  if (!value) {
    value = load()
    entries.set(key, value)
  }
  return value
}

// Passwords the user owns or can reach through a team share that has not expired
function accessiblePasswordWhere(ctx: DashboardCtx, now: Date): Prisma.PasswordWhereInput {
  return {
    OR: [
      { ownerId: ctx.userId },
      ...(ctx.userTeams.length > 0
        ? [
            {
              sharedWith: {
                some: {
                  teamId: { in: ctx.userTeams },
                  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
              },
            },
          ]
        : []),
    ],
  }
}

function getStrengthCounts(ctx: DashboardCtx) {
  return once(ctx, "strength", async () => {
    const groups = await prisma.password.groupBy({
      by: ["strength"],
      where: accessiblePasswordWhere(ctx, new Date()),
      _count: { _all: true },
    })
    const count = (strength: string) =>
      groups.find((group) => group.strength === strength)?._count._all ?? 0
    return {
      total: groups.reduce((sum, group) => sum + group._count._all, 0),
      weak: count("WEAK"),
      medium: count("MEDIUM"),
      strong: count("STRONG"),
    }
  })
}

// One scan of the company's users instead of one count per figure
function getCompanyUserCounts(ctx: object, companyId: string) {
  return once(ctx, `users:${companyId}`, async () => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const rows = await prisma.$queryRaw<
      Array<{ total: number; active: number; mfa: number; recent: number }>
    >`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "isActive")::int AS active,
        COUNT(*) FILTER (WHERE "isActive" AND "mfaEnabled")::int AS mfa,
        COUNT(*) FILTER (WHERE "isActive" AND "lastLoginAt" >= ${since})::int AS recent
      FROM "User"
      WHERE "companyId" = ${companyId}
    `
    return rows[0] ?? { total: 0, active: 0, mfa: 0, recent: 0 }
  })
}

// Accessible passwords with no PASSWORD_VIEWED entry by anyone in the company since `since`
async function countUnusedPasswords(
  ctx: DashboardCtx,
  companyId: string,
  now: Date,
  since: Date
): Promise<number> {
  const teamShare =
    ctx.userTeams.length > 0
      ? Prisma.sql`OR EXISTS (
          SELECT 1 FROM "PasswordShare" ps
          WHERE ps."passwordId" = p.id
            AND ps."teamId" IN (${Prisma.join(ctx.userTeams)})
            AND (ps."expiresAt" IS NULL OR ps."expiresAt" > ${now})
        )`
      : Prisma.empty
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM "Password" p
    WHERE (p."ownerId" = ${ctx.userId} ${teamShare})
      AND NOT EXISTS (
        SELECT 1 FROM "AuditLog" al
        INNER JOIN "User" u ON u.id = al."userId"
        WHERE al."resourceId" = p.id
          AND al.action = 'PASSWORD_VIEWED'
          AND al."createdAt" >= ${since}
          AND u."companyId" = ${companyId}
      )
  `
  return rows[0]?.count ?? 0
}

// Own passwords whose rotation reminder date (last completed rotation or creation
// + rotationDays - reminderDays) falls inside the window
async function countUpcomingRotations(
  userId: string,
  companyId: string,
  now: Date,
  until: Date
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM "Password" p
    INNER JOIN "PasswordRotationPolicy" rp ON rp.id = p."rotationPolicyId"
    INNER JOIN "User" u ON u.id = p."ownerId"
    WHERE p."ownerId" = ${userId}
      AND u."companyId" = ${companyId}
      AND rp."isActive" = true
      AND (
        COALESCE(
          (SELECT MAX(r."rotatedAt") FROM "PasswordRotation" r
           WHERE r."passwordId" = p.id AND r.status = 'COMPLETED'),
          p."createdAt"
        ) + (rp."rotationDays" - rp."reminderDays") * INTERVAL '1 day'
      ) BETWEEN ${now} AND ${until}
  `
  return rows[0]?.count ?? 0
}

export const dashboardRouter = createTRPCRouter({
  stats: protectedProcedure("password.view")
    .query(async ({ ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // If no company found, return zeros to prevent data leakage
      if (!companyId) {
        return {
          users: {
            total: 0,
            change: "+0%",
            changeType: "neutral" as const,
          },
          passwords: {
            total: 0,
            change: "+0%",
            changeType: "neutral" as const,
          },
          teams: {
            total: 0,
            change: "+0",
            changeType: "neutral" as const,
          },
          securityEvents: {
            total: 0,
            change: "+0%",
            changeType: "neutral" as const,
          },
        }
      }

      // Check permissions for different stats
      const hasUserView = ctx.permissions.includes("user.view")
      const hasTeamView = ctx.permissions.includes("team.view")
      const hasAuditView = ctx.permissions.includes("audit.view")

      const auditLogWhere: Prisma.AuditLogWhereInput = {
        action: {
          in: ["LOGIN_FAILED", "PASSWORD_VIEWED", "PASSWORD_SHARED", "PASSWORD_DELETED"],
        },
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
        user: { companyId },
      }

      // All four counts are independent; password and user counts are shared with the other cards
      const [userStats, passwordStats, teamStats, securityEvents] = await Promise.all([
        hasUserView ? getCompanyUserCounts(ctx, companyId).then((c) => c.total) : Promise.resolve(0),
        getStrengthCounts(ctx).then((c) => c.total),
        hasTeamView ? prisma.team.count({ where: { companyId } }) : Promise.resolve(0),
        hasAuditView ? prisma.auditLog.count({ where: auditLogWhere }) : Promise.resolve(0),
      ])

      // Calculate changes - show neutral when totals are low/zero
      // In production, these would be calculated by comparing with previous period data

      return {
        users: {
          total: userStats,
          change: "+0%",
          changeType: "neutral" as const,
        },
        passwords: {
          total: passwordStats,
          change: "+0%",
          changeType: "neutral" as const,
        },
        teams: {
          total: teamStats,
          change: "+0",
          changeType: "neutral" as const,
        },
        securityEvents: {
          total: securityEvents,
          change: "+0%",
          changeType: "neutral" as const,
        },
      }
    }),

  recentActivities: protectedProcedure(["password.view", "audit.view"])
    .query(async ({ ctx }) => {
      // Check if user has audit.view permission to see other users' activities
      const hasAuditView = ctx.permissions.includes("audit.view")
      
      if (!hasAuditView) {
        // If no audit permission, return empty activities
        return []
      }

      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Build where clause - filter by company and exclude current user
      // Always filter by company - if companyId is null, we should not show any data
      if (!companyId) {
        // If no company found, return empty to prevent data leakage
        return []
      }
      
      // Filter by company AND exclude current user
      const where: Prisma.AuditLogWhereInput = {
        user: {
          companyId: companyId,
          id: {
            not: ctx.userId, // Exclude current logged-in user
          },
        },
      }

      // Get recent audit logs with user information, excluding current user's activities
      const logs = await prisma.auditLog.findMany({
        where,
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      })

      // Format activities
      const activities = logs.map((log) => {
        const userName = log.user?.name || "Unknown User"
        const timeAgo = getTimeAgo(log.createdAt)
        
        // Derive resource type from action
        let resourceType = "Unknown"
        if (log.action.includes("PASSWORD")) {
          resourceType = "Password"
        } else if (log.action.includes("USER")) {
          resourceType = "User"
        } else if (log.action.includes("TEAM")) {
          resourceType = "Team"
        } else if (log.action.includes("ROLE")) {
          resourceType = "Role"
        }

        return {
          user: userName,
          actionKey: `audit.actions.${log.action.toLowerCase()}`,
          action: log.action, // Keep original for fallback
          resource: log.resource,
          resourceType: resourceType,
          time: timeAgo,
          avatar: `/avatars/${(log.user?.name || "Unknown").charAt(0).toUpperCase()}.png`,
        }
      })

      return activities
    }),

  securityAlerts: protectedProcedure("password.view")
    .query(async ({ ctx }) => {
      // Use companyId and userTeams from context (already fetched, no extra queries needed)
      const companyId = ctx.companyId
      const teamIds = ctx.userTeams

      // If no company found, return empty array to prevent data leakage
      if (!companyId) {
        return []
      }

      const now = new Date()
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const hasAuditView = ctx.permissions.includes("audit.view")
      const hasUserView = ctx.permissions.includes("user.view")

      const dismissedKey = `user.${ctx.userId}.dismissedAlerts`
      const failedLoginWhere: Prisma.AuditLogWhereInput = {
        action: "LOGIN_FAILED",
        createdAt: { gte: yesterday },
        user: { companyId },
      }

      // Every query below is independent: one parallel step instead of a dozen round trips
      const [
        dismissedSetting,
        backupSettings,
        expiringPasswords,
        strengthCounts,
        unusedPasswords,
        failedLogins,
        suspiciousIPs,
        userCounts,
        breachedPasswords,
        upcomingRotations,
      ] = await Promise.all([
        // Read straight from the database: a just-dismissed alert must stay dismissed
        readUserSetting(dismissedKey),
        getSettings(["system.backup.lastCompleted", "system.backup.status"]),
        prisma.password.count({
          where: {
            ...accessiblePasswordWhere(ctx, now),
            expiresAt: { not: null, gte: now, lte: sevenDaysFromNow },
          },
        }),
        getStrengthCounts(ctx),
        hasAuditView ? countUnusedPasswords(ctx, companyId, now, ninetyDaysAgo) : Promise.resolve(0),
        hasAuditView ? prisma.auditLog.count({ where: failedLoginWhere }) : Promise.resolve(0),
        // More than 5 failed attempts from the same IP
        hasAuditView
          ? prisma.auditLog.groupBy({
              by: ["ipAddress"],
              where: { ...failedLoginWhere, ipAddress: { not: null } },
              _count: true,
              having: { ipAddress: { _count: { gt: 5 } } },
            })
          : Promise.resolve([]),
        hasUserView ? getCompanyUserCounts(ctx, companyId) : Promise.resolve(null),
        // Own passwords only, scoped to the company
        prisma.passwordBreach.count({
          where: {
            password: { ownerId: ctx.userId, owner: { companyId } },
            isBreached: true,
            resolved: false,
          },
        }),
        countUpcomingRotations(ctx.userId, companyId, now, sevenDaysFromNow),
      ])

      const dismissedSet = new Set(
        Array.isArray(dismissedSetting) ? (dismissedSetting as string[]) : []
      )
      const weakPasswords = strengthCounts.weak
      const totalActiveUsers = userCounts?.active ?? 0
      const usersWithoutMFA = userCounts ? userCounts.active - userCounts.mfa : 0

      const backupValue = backupSettings.get("system.backup.lastCompleted")
      const lastBackupTime = backupValue ? new Date(backupValue as string) : null
      const backupStatus = backupValue
        ? backupSettings.get("system.backup.status") || "unknown"
        : "unknown"

      const alerts: Array<{
        id: string
        severity: "critical" | "high" | "medium" | "low"
        type: "warning" | "info" | "error"
        message?: string
        messageKey?: string
        messageParams?: Record<string, number>
        time?: string
        timeKey?: string
        timeParams?: Record<string, number>
        timestamp: Date
      }> = []

      // CRITICAL: Excessive failed login attempts
      if (failedLogins > 20) {
        alerts.push({
          id: "failed-logins-critical",
          severity: "critical",
          type: "error",
          messageKey: "dashboard.failedLoginsCritical",
          messageParams: { count: failedLogins },
          timeKey: "dashboard.justNow",
          timestamp: now,
        })
      }
      // HIGH: Many failed login attempts
      else if (failedLogins > 10) {
        alerts.push({
          id: "failed-logins-high",
          severity: "high",
          type: "warning",
          messageKey: "dashboard.unusualLoginActivity",
          messageParams: { count: failedLogins },
          timeKey: "dashboard.today",
          timestamp: now,
        })
      }

      // HIGH: Suspicious IP patterns
      if (suspiciousIPs.length > 0) {
        alerts.push({
          id: "suspicious-ips",
          severity: "high",
          type: "warning",
          messageKey: "dashboard.suspiciousAccessPattern",
          messageParams: { count: suspiciousIPs.length },
          timeKey: "dashboard.today",
          timestamp: now,
        })
      }

      // HIGH: Expiring passwords
      if (expiringPasswords > 0) {
        alerts.push({
          id: "expiring-passwords",
          severity: "high",
          type: "warning",
          messageKey: "dashboard.expiringPasswords",
          messageParams: { count: expiringPasswords },
          timeKey: "dashboard.today",
          timestamp: now,
        })
      }

      // MEDIUM: Weak passwords
      if (weakPasswords > 0) {
        alerts.push({
          id: "weak-passwords",
          severity: "medium",
          type: "warning",
          messageKey: "dashboard.weakPasswordsDetected",
          messageParams: { count: weakPasswords },
          time: "Today",
          timestamp: now,
        })
      }

      // MEDIUM: Users without MFA
      if (usersWithoutMFA > 0 && totalActiveUsers > 0) {
        const percentage = Math.round((usersWithoutMFA / totalActiveUsers) * 100)
        if (percentage > 20) {
          alerts.push({
            id: "mfa-not-enabled",
            severity: "medium",
            type: "warning",
            messageKey: "dashboard.usersWithoutMfa",
            messageParams: { count: usersWithoutMFA, percentage },
            timeKey: "dashboard.today",
            timestamp: now,
          })
        }
      }

      if (breachedPasswords > 0) {
        alerts.push({
          id: "breached-passwords",
          severity: "high",
          type: "error",
          messageKey: "dashboard.breachedPasswords",
          messageParams: { count: breachedPasswords },
          timeKey: "dashboard.today",
          timestamp: now,
        })
      }

      if (upcomingRotations > 0) {
        alerts.push({
          id: "rotation-reminders",
          severity: "medium",
          type: "warning",
          messageKey: "dashboard.rotationReminders",
          messageParams: { count: upcomingRotations },
          timeKey: "dashboard.today",
          timestamp: now,
        })
      }

      // LOW: Unused passwords
      if (unusedPasswords > 0) {
        alerts.push({
          id: "unused-passwords",
          severity: "low",
          type: "info",
          messageKey: "dashboard.unusedPasswords",
          messageParams: { count: unusedPasswords },
          timeKey: "dashboard.today",
          timestamp: now,
        })
      }

      // System backup status
      if (lastBackupTime) {
        const hoursSinceBackup = Math.floor((now.getTime() - lastBackupTime.getTime()) / (1000 * 60 * 60))
        if (backupStatus === "success" || backupStatus === "completed") {
          if (hoursSinceBackup < 24) {
            alerts.push({
              id: "backup-success",
              severity: "low",
              type: "info",
              messageKey: "dashboard.backupCompleted",
              messageParams: { hours: hoursSinceBackup },
              timeKey: hoursSinceBackup < 1 ? "dashboard.justNow" : "dashboard.hoursAgo",
              timeParams: hoursSinceBackup >= 1 ? { hours: hoursSinceBackup } : undefined,
              timestamp: lastBackupTime,
            })
          } else {
            const days = Math.floor(hoursSinceBackup / 24)
            alerts.push({
              id: "backup-old",
              severity: "medium",
              type: "warning",
              messageKey: "dashboard.backupOld",
              messageParams: { days },
              timeKey: "dashboard.daysAgo",
              timeParams: { days },
              timestamp: lastBackupTime,
            })
          }
        } else if (backupStatus === "failed" || backupStatus === "error") {
          alerts.push({
            id: "backup-failed",
            severity: "high",
            type: "error",
            messageKey: "dashboard.backupFailed",
            timeKey: "dashboard.today",
            timestamp: now,
          })
        }
      } else {
        // No backup record found
        alerts.push({
          id: "backup-unknown",
          severity: "medium",
          type: "warning",
          messageKey: "dashboard.backupUnknown",
          timeKey: "dashboard.today",
          timestamp: now,
        })
      }

      // Filter out dismissed alerts
      const activeAlerts = alerts.filter((alert) => !dismissedSet.has(alert.id))

      // Sort by severity (critical > high > medium > low) and timestamp
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      activeAlerts.sort((a, b) => {
        const severityDiff = severityOrder[a.severity] - severityOrder[b.severity]
        if (severityDiff !== 0) return severityDiff
        return b.timestamp.getTime() - a.timestamp.getTime()
      })

      return activeAlerts
    }),

  dismissAlert: protectedProcedure("password.view")
    .input(
      z.object({
        alertId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Store dismissed alerts in Settings as a JSON array
      const dismissedKey = `user.${ctx.userId}.dismissedAlerts`
      // The key embeds the user id, so the row is per-user (stored with companyId NULL)
      const existing = await readUserSetting(dismissedKey)

      const dismissedAlerts = Array.isArray(existing) ? (existing as string[]) : []

      if (!dismissedAlerts.includes(input.alertId)) {
        dismissedAlerts.push(input.alertId)
        await writeSettings([{ key: dismissedKey, value: dismissedAlerts }], ctx.companyId)
      }

      return { success: true }
    }),

  healthMetrics: protectedProcedure("password.view")
    .query(async ({ ctx }) => {
      const now = new Date()
      const companyId = ctx.companyId

      // If no company found, return empty array to prevent data leakage
      if (!companyId) {
        return []
      }

      const hasUserView = ctx.permissions.includes("user.view")

      // Password strength, user counts and sessions are independent
      const [strengthCounts, userCounts, activeSessions] = await Promise.all([
        getStrengthCounts(ctx),
        hasUserView ? getCompanyUserCounts(ctx, companyId) : Promise.resolve(null),
        // Sessions that haven't expired yet (sessions are user-related), filtered by company
        hasUserView
          ? prisma.session.count({ where: { expires: { gt: now }, user: { companyId } } })
          : Promise.resolve(0),
      ])

      const totalPasswords = strengthCounts.total
      const strongPasswords = strengthCounts.strong
      const mediumPasswords = strengthCounts.medium
      const totalUsers = userCounts?.active ?? 0
      const mfaUsers = userCounts?.mfa ?? 0
      const activeUsers = userCounts?.recent ?? 0

      // Calculate session percentage based on active users
      // If we have active users, calculate percentage of sessions vs active users
      // Otherwise, use a baseline of 100% if there are any sessions
      const sessionPercentage =
        activeUsers > 0
          ? Math.min(100, Math.round((activeSessions / activeUsers) * 100))
          : activeSessions > 0
            ? 100
            : 0

      // Determine session status based on count and percentage
      let sessionStatus = "Normal"
      if (activeSessions === 0) {
        sessionStatus = "No Activity"
      } else if (sessionPercentage > 150) {
        sessionStatus = "High"
      } else if (sessionPercentage > 100) {
        sessionStatus = "Elevated"
      } else if (sessionPercentage < 20 && activeUsers > 0) {
        sessionStatus = "Low"
      }

      const passwordStrengthPercentage =
        totalPasswords > 0
          ? Math.round(((strongPasswords + mediumPasswords) / totalPasswords) * 100)
          : 0

      const mfaAdoptionPercentage =
        totalUsers > 0 ? Math.round((mfaUsers / totalUsers) * 100) : 0

      // Return status keys for client-side translation
      const passwordStrengthStatus = passwordStrengthPercentage >= 70 ? "good" : passwordStrengthPercentage >= 50 ? "fair" : "poor"
      const mfaAdoptionStatus = mfaAdoptionPercentage >= 90 ? "excellent" : mfaAdoptionPercentage >= 70 ? "good" : "fair"
      const sessionStatusKey = sessionStatus === "No Activity" ? "noActivity" : sessionStatus.toLowerCase()

      return [
        {
          labelKey: "dashboard.passwordStrength",
          statusKey: passwordStrengthStatus,
          percentage: passwordStrengthPercentage,
          descriptionKey: "dashboard.passwordStrengthDescription",
          descriptionParams: { percentage: passwordStrengthPercentage } as Record<string, number>,
          color: passwordStrengthPercentage >= 70 ? "bg-green-600" : passwordStrengthPercentage >= 50 ? "bg-yellow-600" : "bg-red-600",
        },
        {
          labelKey: "dashboard.mfaAdoption",
          statusKey: mfaAdoptionStatus,
          percentage: mfaAdoptionPercentage,
          descriptionKey: "dashboard.mfaAdoptionDescription",
          descriptionParams: { percentage: mfaAdoptionPercentage } as Record<string, number>,
          color: mfaAdoptionPercentage >= 90 ? "bg-green-600" : mfaAdoptionPercentage >= 70 ? "bg-blue-600" : "bg-yellow-600",
        },
        {
          labelKey: "dashboard.activeSessions",
          statusKey: sessionStatusKey,
          percentage: sessionPercentage,
          descriptionKey: "dashboard.activeSessionsDescription",
          descriptionParams: { count: activeSessions } as Record<string, number>,
          color:
            sessionStatus === "High" || sessionStatus === "Elevated"
              ? "bg-orange-600"
              : sessionStatus === "Low" || sessionStatus === "No Activity"
                ? "bg-yellow-600"
                : "bg-blue-600",
        },
      ]
    }),
})

// Helper functions
function getTimeAgo(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) {
    return `${diffInSeconds} second${diffInSeconds !== 1 ? "s" : ""} ago`
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes !== 1 ? "s" : ""} ago`
  }

  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours !== 1 ? "s" : ""} ago`
  }

  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays !== 1 ? "s" : ""} ago`
  }

  const diffInWeeks = Math.floor(diffInDays / 7)
  return `${diffInWeeks} week${diffInWeeks !== 1 ? "s" : ""} ago`
}

