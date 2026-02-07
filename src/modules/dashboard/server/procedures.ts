import prisma from "@/lib/prisma"
import { createTRPCRouter, protectedProcedure } from "@/trpc/init"
import z from "zod"
import { Prisma } from "@/app/generated"

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

      // Use userTeams from context (already fetched, no extra query needed)
      const teamIds = ctx.userTeams

      // Build where clause for passwords accessible to user
      const passwordWhere = {
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

      // Check permissions for different stats
      const hasUserView = ctx.permissions.includes("user.view")
      const hasTeamView = ctx.permissions.includes("team.view")
      const hasAuditView = ctx.permissions.includes("audit.view")

      // Build company filters - companyId is guaranteed to exist here
      const userWhere = { companyId }
      const teamWhere = { companyId }
      const auditLogWhere: Prisma.AuditLogWhereInput = {
        action: {
          in: ["LOGIN_FAILED", "PASSWORD_VIEWED", "PASSWORD_SHARED", "PASSWORD_DELETED"],
        },
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
        user: { companyId },
      }

      // Fetch stats based on permissions
      const [userStats, passwordStats, teamStats, securityEvents] = await Promise.all([
        // User stats - only if user has user.view permission, filtered by company
        hasUserView ? prisma.user.count({ where: userWhere }) : Promise.resolve(0),
        
        // Password stats - always available (user has password.view permission)
        prisma.password.count({ where: passwordWhere }),
        
        // Team stats - only if user has team.view permission, filtered by company
        hasTeamView ? prisma.team.count({ where: teamWhere }) : Promise.resolve(0),
        
        // Security events - only if user has audit.view permission, filtered by company
        hasAuditView
          ? prisma.auditLog.count({ where: auditLogWhere })
          : Promise.resolve(0),
      ])

      // Calculate changes (simplified - in real app, compare with previous period)
      const userChange = "+12%"
      const passwordChange = "+8%"
      const teamChange = "+2"
      const securityChange = "-15%"

      return {
        users: {
          total: userStats,
          change: userChange,
          changeType: "positive" as const,
        },
        passwords: {
          total: passwordStats,
          change: passwordChange,
          changeType: "positive" as const,
        },
        teams: {
          total: teamStats,
          change: teamChange,
          changeType: "positive" as const,
        },
        securityEvents: {
          total: securityEvents,
          change: securityChange,
          changeType: "negative" as const,
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

      // Get dismissed alerts for this user
      const dismissedKey = `user.${ctx.userId}.dismissedAlerts`
      const dismissedSetting = await prisma.settings.findUnique({
        where: { key: dismissedKey },
      })
      const dismissedAlerts = dismissedSetting?.value
        ? (dismissedSetting.value as string[])
        : []
      const dismissedSet = new Set(dismissedAlerts)
      const now = new Date()
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)


      // Build password where clause for user's accessible passwords
      const passwordWhere = {
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
                        { expiresAt: { gt: now } },
                      ],
                    },
                  },
                },
              ]
            : []),
        ],
      }

      // Check for expiring passwords (within 7 days) - HIGH severity
      const expiringPasswordWhere = {
        ...passwordWhere,
        expiresAt: {
          not: null,
          gte: now,
          lte: sevenDaysFromNow,
        },
      }
      const expiringPasswords = await prisma.password.count({
        where: expiringPasswordWhere,
      })

      // Check for weak passwords - MEDIUM severity
      const weakPasswords = await prisma.password.count({
        where: {
          ...passwordWhere,
          strength: "WEAK",
        },
      })

      // Check permissions
      const hasAuditView = ctx.permissions.includes("audit.view")
      const hasUserView = ctx.permissions.includes("user.view")

      // Check for unused passwords (no access in last 90 days) - LOW severity
      // Get passwords that haven't been viewed in last 90 days
      const allUserPasswords = await prisma.password.findMany({
        where: passwordWhere,
        select: { id: true },
      })
      const passwordIds = allUserPasswords.map((p) => p.id)
      
      let unusedPasswords = 0
      if (hasAuditView && passwordIds.length > 0) {
        const auditLogWhere: Prisma.AuditLogWhereInput = {
          action: "PASSWORD_VIEWED",
          resourceId: { in: passwordIds },
          createdAt: { gte: ninetyDaysAgo },
          ...(companyId ? { user: { companyId } } : {}),
        }
        const recentlyAccessedPasswordIds = await prisma.auditLog.findMany({
          where: auditLogWhere,
          select: { resourceId: true },
          distinct: ["resourceId"],
        })
        const accessedIds = new Set(recentlyAccessedPasswordIds.map((log) => log.resourceId).filter(Boolean))
        unusedPasswords = passwordIds.filter((id) => !accessedIds.has(id)).length
      }

      // Build company filters for audit logs - companyId is guaranteed to exist here
      const auditLogWhere: Prisma.AuditLogWhereInput = {
        action: "LOGIN_FAILED",
        createdAt: { gte: yesterday },
        user: { companyId },
      }

      // Check for failed login attempts in last 24 hours - CRITICAL if >20, HIGH if >10
      // Only if user has audit.view permission, filtered by company
      const failedLogins = hasAuditView
        ? await prisma.auditLog.count({ where: auditLogWhere })
        : 0

      // Check for suspicious access patterns (multiple failed logins from same IP) - HIGH severity
      // Only if user has audit.view permission, filtered by company
      const suspiciousIPs = hasAuditView
        ? await prisma.auditLog.groupBy({
            by: ["ipAddress"],
            where: {
              ...auditLogWhere,
              ipAddress: { not: null },
            },
            _count: true,
            having: {
              ipAddress: {
                _count: {
                  gt: 5, // More than 5 failed attempts from same IP
                },
              },
            },
          })
        : []

      // Build company filters for user stats - companyId is guaranteed to exist here (checked above)
      const userWhere = { companyId, isActive: true }

      // Check for users without MFA enabled - MEDIUM severity
      // Only if user has user.view permission, filtered by company
      const [totalActiveUsers, usersWithoutMFA] = hasUserView
        ? await Promise.all([
            prisma.user.count({ where: userWhere }),
            prisma.user.count({
              where: {
                ...userWhere,
                mfaEnabled: false,
              },
            }),
          ])
        : [0, 0]

      // Get system backup status from Settings
      const backupSetting = await prisma.settings.findUnique({
        where: { key: "system.backup.lastCompleted" },
      })
      
      const lastBackupTime = backupSetting?.value
        ? new Date(backupSetting.value as string)
        : null
      const backupStatus = backupSetting?.value
        ? (await prisma.settings.findUnique({
            where: { key: "system.backup.status" },
          }))?.value || "unknown"
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

      // HIGH: Breached passwords - Check for unresolved breaches
      // Filter by ownerId and companyId for security
      const breachedPasswords = await prisma.passwordBreach.count({
        where: {
          password: {
            ownerId: ctx.userId,
            owner: companyId ? { companyId } : undefined,
          },
          isBreached: true,
          resolved: false,
        },
      })

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

      // MEDIUM: Password rotation reminders - Check for upcoming rotations
      // Filter by ownerId and companyId for security
      const rotationReminders = await prisma.password.findMany({
        where: {
          ownerId: ctx.userId,
          owner: companyId ? { companyId } : undefined,
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

      let upcomingRotations = 0
      for (const password of rotationReminders) {
        if (!password.rotationPolicy) continue

        let lastRotationDate: Date
        if (password.rotations.length > 0) {
          lastRotationDate = password.rotations[0].rotatedAt
        } else {
          lastRotationDate = password.createdAt
        }

        const nextRotationDate = new Date(
          lastRotationDate.getTime() + password.rotationPolicy.rotationDays * 24 * 60 * 60 * 1000
        )

        const reminderDate = new Date(
          nextRotationDate.getTime() - password.rotationPolicy.reminderDays * 24 * 60 * 60 * 1000
        )

        // Check if reminder is within next 7 days
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        if (reminderDate <= sevenDaysFromNow && reminderDate >= now) {
          upcomingRotations++
        }
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
      const existing = await prisma.settings.findUnique({
        where: { key: dismissedKey },
      })

      const dismissedAlerts = existing?.value
        ? (existing.value as string[])
        : []

      if (!dismissedAlerts.includes(input.alertId)) {
        dismissedAlerts.push(input.alertId)
        await prisma.settings.upsert({
          where: { key: dismissedKey },
          update: {
            value: dismissedAlerts,
          },
          create: {
            key: dismissedKey,
            value: dismissedAlerts,
          },
        })
      }

      return { success: true }
    }),

  healthMetrics: protectedProcedure("password.view")
    .query(async ({ ctx }) => {
      const now = new Date()
      
      // Use companyId and userTeams from context (already fetched, no extra queries needed)
      const companyId = ctx.companyId
      const teamIds = ctx.userTeams
      

      // Build where clause for passwords accessible to user
      const passwordWhere = {
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

      // Get password strength stats
      const [totalPasswords, strongPasswords, mediumPasswords] = await Promise.all([
        prisma.password.count({ where: passwordWhere }),
        prisma.password.count({
          where: { ...passwordWhere, strength: "STRONG" },
        }),
        prisma.password.count({
          where: { ...passwordWhere, strength: "MEDIUM" },
        }),
      ])

      // Check permissions for user stats
      const hasUserView = ctx.permissions.includes("user.view")
      
      // If no company found, return empty array to prevent data leakage
      if (!companyId) {
        return []
      }

      // Build company filters for user stats - companyId is guaranteed to exist here
      const userWhere = { companyId, isActive: true }
      const activeUserWhere = {
        companyId,
        isActive: true,
        lastLoginAt: {
          gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // Active in last 30 days
        },
      }
      
      // Get MFA adoption - only if user has user.view permission, filtered by company
      const [totalUsers, mfaUsers, activeUsers] = await Promise.all([
        hasUserView ? prisma.user.count({ where: userWhere }) : Promise.resolve(0),
        hasUserView ? prisma.user.count({ where: { ...userWhere, mfaEnabled: true } }) : Promise.resolve(0),
        hasUserView ? prisma.user.count({ where: activeUserWhere }) : Promise.resolve(0),
      ])

      // Get active sessions (sessions that haven't expired yet)
      // Only if user has user.view permission (sessions are user-related), filtered by company
      // companyId is guaranteed to exist here (checked above)
      const sessionWhere: Prisma.SessionWhereInput = {
        expires: {
          gt: now,
        },
        user: { companyId },
      }
      
      const activeSessions = hasUserView
        ? await prisma.session.count({ where: sessionWhere })
        : 0

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

