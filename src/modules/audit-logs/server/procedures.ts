import prisma from "@/lib/prisma"
import { createTRPCRouter, protectedProcedure } from "@/trpc/init"
import z from "zod"
import { TRPCError } from "@trpc/server"
import {
  archiveAuditLogs,
  getAuditLogAnalytics,
  searchAuditLogsAdvanced,
  type AdvancedAuditLogFilters,
} from "@/lib/audit-log-advanced"
import { createAuditLog } from "@/lib/audit-log"
import { Prisma } from "@/app/generated"

export const auditLogsRouter = createTRPCRouter({
  list: protectedProcedure("audit.view")
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        action: z.string().optional(),
        status: z.enum(["SUCCESS", "FAILED", "WARNING", "BLOCKED"]).optional(),
        userId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { page, pageSize, search, action, status, userId, startDate, endDate } = input

      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Build where clause - filter by company through user
      const where: Prisma.AuditLogWhereInput = {}
      
      if (companyId) {
        where.user = {
          companyId: companyId,
        }
      }

      if (search) {
        where.OR = [
          { action: { contains: search, mode: "insensitive" } },
          { resource: { contains: search, mode: "insensitive" } },
          { ipAddress: { contains: search, mode: "insensitive" } },
          { user: { name: { contains: search, mode: "insensitive" } } },
          { user: { email: { contains: search, mode: "insensitive" } } },
        ]
      }

      if (action) {
        where.action = action
      }

      if (status) {
        where.status = status
      }

      if (userId) {
        where.userId = userId
      }

      if (startDate || endDate) {
        where.createdAt = {}
        if (startDate) {
          where.createdAt.gte = startDate
        }
        if (endDate) {
          where.createdAt.lte = endDate
        }
      }

      // Get total count for pagination
      const total = await prisma.auditLog.count({ where })

      // Get paginated logs with user info
      const logs = await prisma.auditLog.findMany({
        where,
        take: pageSize,
        skip: (page - 1) * pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      // Format logs for client
      const formattedLogs = logs.map((log) => {
        // Map status enum to lowercase string
        let status: "success" | "failed" | "warning" | "blocked" = "success"
        switch (log.status) {
          case "SUCCESS":
            status = "success"
            break
          case "FAILED":
            status = "failed"
            break
          case "WARNING":
            status = "warning"
            break
          case "BLOCKED":
            status = "blocked"
            break
        }

        return {
          id: log.id,
          user: log.user?.name || "Unknown",
          userEmail: log.user?.email || "N/A",
          action: log.action,
          resource: log.resource,
          ipAddress: log.ipAddress || "N/A",
          timestamp: log.createdAt.toISOString(),
          status,
          avatar: null as string | null,
          details: log.details as Record<string, unknown> | undefined,
        }
      })

      return {
        logs: formattedLogs,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      }
    }),

  stats: protectedProcedure("audit.view")
    .input(
      z.object({
        days: z.number().min(1).max(365).default(30),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const days = input?.days || 30
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Build base where clause with company filter
      const baseWhere: Prisma.AuditLogWhereInput = {
        createdAt: { gte: startDate },
      }
      
      if (companyId) {
        baseWhere.user = {
          companyId: companyId,
        }
      }

      const [
        totalEvents,
        failedLogins,
        passwordChanges,
        securityAlerts,
      ] = await Promise.all([
        // Total events
        prisma.auditLog.count({
          where: baseWhere,
        }),

        // Failed logins
        prisma.auditLog.count({
          where: {
            ...baseWhere,
            action: "LOGIN_FAILED",
          },
        }),

        // Password changes (created, updated, deleted)
        prisma.auditLog.count({
          where: {
            ...baseWhere,
            action: { in: ["PASSWORD_CREATED", "PASSWORD_UPDATED", "PASSWORD_DELETED"] },
          },
        }),

        // Security alerts (failed, blocked, warning status)
        prisma.auditLog.count({
          where: {
            ...baseWhere,
            status: { in: ["FAILED", "BLOCKED", "WARNING"] },
          },
        }),
      ])

      // Calculate previous period for comparison
      const previousStartDate = new Date(startDate)
      previousStartDate.setDate(previousStartDate.getDate() - days)

      const previousBaseWhere: Prisma.AuditLogWhereInput = {
        createdAt: {
          gte: previousStartDate,
          lt: startDate,
        },
      }
      
      if (companyId) {
        previousBaseWhere.user = {
          companyId: companyId,
        }
      }

      const [previousFailedLogins, previousSecurityAlerts] = await Promise.all([
        prisma.auditLog.count({
          where: {
            ...previousBaseWhere,
            action: "LOGIN_FAILED",
          },
        }),
        prisma.auditLog.count({
          where: {
            ...previousBaseWhere,
            status: { in: ["FAILED", "BLOCKED", "WARNING"] },
          },
        }),
      ])

      // Calculate percentage changes
      const failedLoginsChange = previousFailedLogins > 0
        ? `${((failedLogins - previousFailedLogins) / previousFailedLogins * 100).toFixed(0)}%`
        : "0%"
      const securityAlertsChange = previousSecurityAlerts > 0
        ? `${((securityAlerts - previousSecurityAlerts) / previousSecurityAlerts * 100).toFixed(0)}%`
        : "0%"

      return {
        totalEvents: {
          value: totalEvents,
          labelKey: "audit.lastDays",
          labelParams: { days },
        },
        failedLogins: {
          value: failedLogins,
          change: failedLoginsChange,
          changeType: failedLogins > previousFailedLogins ? "negative" : "positive" as const,
        },
        passwordChanges: {
          value: passwordChanges,
          labelKey: "audit.lastDays",
          labelParams: { days },
        },
        securityAlerts: {
          value: securityAlerts,
          change: securityAlertsChange,
          changeType: securityAlerts > previousSecurityAlerts ? "negative" : "positive" as const,
        },
      }
    }),

  getActionTypes: protectedProcedure("audit.view")
    .query(async ({ ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const where: Prisma.AuditLogWhereInput = {}
      if (companyId) {
        where.user = {
          companyId: companyId,
        }
      }

      const actions = await prisma.auditLog.findMany({
        where,
        select: { action: true },
        distinct: ["action"],
        orderBy: { action: "asc" },
      })

      // Return action keys for client-side translation
      return actions.map((a) => a.action)
    }),

  getUsers: protectedProcedure("audit.view")
    .query(async ({ ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const where: Prisma.UserWhereInput = {}
      if (companyId) {
        where.companyId = companyId
      }

      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
        },
        orderBy: { name: "asc" },
      })

      return users
    }),

  // Test endpoint to verify audit logs are working
  test: protectedProcedure("audit.view")
    .query(async ({ ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const where: Prisma.AuditLogWhereInput = {}
      if (companyId) {
        where.user = {
          companyId: companyId,
        }
      }

      const total = await prisma.auditLog.count({ where })
      
      const recent = await prisma.auditLog.findMany({
        where,
        take: 10,
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

      return {
        total,
        recent: recent.map(log => ({
          id: log.id,
          action: log.action,
          resource: log.resource,
          user: log.user?.name || "Unknown",
          status: log.status,
          createdAt: log.createdAt.toISOString(),
        })),
      }
    }),

  // Advanced Audit Logs - Archive
  archiveLogs: protectedProcedure("audit.view")
    .input(
      z.object({
        olderThanDays: z.number().min(1).max(3650),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const result = await archiveAuditLogs(
        companyId,
        input.olderThanDays,
        ctx.userId || undefined
      )

      return result
    }),

  // Advanced Audit Logs - Get Archives
  getArchives: protectedProcedure("audit.view")
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const where: Prisma.AuditLogArchiveWhereInput = {}
      if (companyId) {
        where.companyId = companyId
      }

      const total = await prisma.auditLogArchive.count({ where })

      const archives = await prisma.auditLogArchive.findMany({
        where,
        take: input.pageSize,
        skip: (input.page - 1) * input.pageSize,
        orderBy: { archiveDate: "desc" },
        include: {
          archiver: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      return {
        archives,
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.ceil(total / input.pageSize),
        },
      }
    }),

  // Log clipboard copy action
  logClipboardCopy: protectedProcedure("password.view")
    .input(
      z.object({
        resourceId: z.string(),
        resourceType: z.string().default("password"),
        actionType: z.string().default("copy"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { resourceId, resourceType, actionType } = input

      await createAuditLog({
        action: actionType,
        resource: resourceType,
        resourceId,
        details: {
          action: "clipboard_copy",
          resourceType,
        },
        status: "SUCCESS",
        userId: ctx.userId || null,
      })
    }),

  // Advanced Audit Logs - Analytics
  getAnalytics: protectedProcedure("audit.view")
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      return await getAuditLogAnalytics(
        companyId,
        input.startDate,
        input.endDate
      )
    }),

  // Advanced Audit Logs - Advanced Search
  advancedSearch: protectedProcedure("audit.view")
    .input(
      z.object({
        actions: z.array(z.string()).optional(),
        resources: z.array(z.string()).optional(),
        statuses: z.array(z.enum(["SUCCESS", "FAILED", "WARNING", "BLOCKED"])).optional(),
        userIds: z.array(z.string()).optional(),
        ipAddresses: z.array(z.string()).optional(),
        dateRange: z
          .object({
            start: z.date(),
            end: z.date(),
          })
          .optional(),
        searchText: z.string().optional(),
        hasDetails: z.boolean().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const filters: AdvancedAuditLogFilters = {
        actions: input.actions,
        resources: input.resources,
        statuses: input.statuses,
        userIds: input.userIds,
        ipAddresses: input.ipAddresses,
        dateRange: input.dateRange,
        searchText: input.searchText,
        hasDetails: input.hasDetails,
      }

      return await searchAuditLogsAdvanced(
        companyId,
        filters,
        input.page,
        input.pageSize
      )
    }),

  // Advanced Audit Logs - Save Search
  saveSearch: protectedProcedure("audit.view")
    .input(
      z.object({
        name: z.string().optional(),
        searchQuery: z.string(),
        filters: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User ID is required",
        })
      }

      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const savedSearch = await prisma.auditLogSearch.create({
        data: {
          userId: ctx.userId,
          companyId,
          name: input.name || null,
          searchQuery: input.searchQuery,
          filters: input.filters as Prisma.InputJsonValue || undefined,
        },
      })

      return { id: savedSearch.id }
    }),

  // Advanced Audit Logs - Get Saved Searches
  getSavedSearches: protectedProcedure("audit.view")
    .query(async ({ ctx }) => {
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User ID is required",
        })
      }

      const searches = await prisma.auditLogSearch.findMany({
        where: { userId: ctx.userId },
        orderBy: { lastUsedAt: "desc" },
        take: 20,
      })

      return searches
    }),

  // Advanced Audit Logs - Delete Saved Search
  deleteSavedSearch: protectedProcedure("audit.view")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User ID is required",
        })
      }

      // Verify ownership
      const search = await prisma.auditLogSearch.findUnique({
        where: { id: input.id },
      })

      if (!search || search.userId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to delete this search",
        })
      }

      await prisma.auditLogSearch.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),

  // Advanced Audit Logs - Real-time streaming (polling-based)
  getRecentLogs: protectedProcedure("audit.view")
    .input(
      z.object({
        since: z.date().optional(), // Get logs since this date
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const where: Prisma.AuditLogWhereInput = {}
      if (companyId) {
        where.user = {
          companyId,
        }
      }
      if (input.since) {
        where.createdAt = {
          gte: input.since,
        }
      }

      const logs = await prisma.auditLog.findMany({
        where,
        take: input.limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      // Format logs
      const formattedLogs = logs.map((log) => {
        let status: "success" | "failed" | "warning" | "blocked" = "success"
        switch (log.status) {
          case "SUCCESS":
            status = "success"
            break
          case "FAILED":
            status = "failed"
            break
          case "WARNING":
            status = "warning"
            break
          case "BLOCKED":
            status = "blocked"
            break
        }

        return {
          id: log.id,
          user: log.user?.name || "Unknown",
          userEmail: log.user?.email || "N/A",
          action: log.action,
          resource: log.resource,
          ipAddress: log.ipAddress || "N/A",
          timestamp: log.createdAt.toISOString(),
          status,
          avatar: null as string | null,
          details: log.details as Record<string, unknown> | undefined,
        }
      })

      return {
        logs: formattedLogs,
        latestTimestamp: logs[0]?.createdAt || new Date(),
      }
    }),

  // Export audit logs
  exportLogs: protectedProcedure("audit.view")
    .input(
      z.object({
        format: z.enum(["csv", "json"]).default("csv"),
        search: z.string().optional(),
        action: z.string().optional(),
        status: z.enum(["SUCCESS", "FAILED", "WARNING", "BLOCKED"]).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        actions: z.array(z.string()).optional(),
        resources: z.array(z.string()).optional(),
        statuses: z.array(z.enum(["SUCCESS", "FAILED", "WARNING", "BLOCKED"])).optional(),
        userIds: z.array(z.string()).optional(),
        ipAddresses: z.array(z.string()).optional(),
        hasDetails: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Build where clause
      const where: Prisma.AuditLogWhereInput = {}

      if (companyId) {
        where.user = {
          companyId,
        }
      }

      // Handle advanced filters
      if (input.actions && input.actions.length > 0) {
        where.action = { in: input.actions }
      } else if (input.action) {
        where.action = input.action
      }

      if (input.resources && input.resources.length > 0) {
        where.resource = { in: input.resources }
      }

      if (input.statuses && input.statuses.length > 0) {
        where.status = { in: input.statuses }
      } else if (input.status) {
        where.status = input.status
      }

      if (input.userIds && input.userIds.length > 0) {
        where.userId = { in: input.userIds }
      }

      if (input.ipAddresses && input.ipAddresses.length > 0) {
        where.ipAddress = { in: input.ipAddresses }
      }

      if (input.startDate || input.endDate) {
        where.createdAt = {}
        if (input.startDate) {
          where.createdAt.gte = input.startDate
        }
        if (input.endDate) {
          where.createdAt.lte = input.endDate
        }
      }

      if (input.hasDetails !== undefined) {
        if (input.hasDetails) {
          where.details = { not: undefined }
        } else {
          where.details = undefined
        }
      }

      if (input.search) {
        where.OR = [
          { action: { contains: input.search, mode: "insensitive" } },
          { resource: { contains: input.search, mode: "insensitive" } },
          { ipAddress: { contains: input.search, mode: "insensitive" } },
          { user: { name: { contains: input.search, mode: "insensitive" } } },
          { user: { email: { contains: input.search, mode: "insensitive" } } },
        ]
      }

      // Fetch all logs (no pagination for export)
      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      // Format logs
      const formattedLogs = logs.map((log) => {
        let status: "success" | "failed" | "warning" | "blocked" = "success"
        switch (log.status) {
          case "SUCCESS":
            status = "success"
            break
          case "FAILED":
            status = "failed"
            break
          case "WARNING":
            status = "warning"
            break
          case "BLOCKED":
            status = "blocked"
            break
        }

        return {
          id: log.id,
          user: log.user?.name || "Unknown",
          userEmail: log.user?.email || "N/A",
          action: log.action,
          resource: log.resource,
          resourceId: log.resourceId || "",
          ipAddress: log.ipAddress || "N/A",
          userAgent: log.userAgent || "",
          timestamp: log.createdAt.toISOString(),
          status,
          details: log.details ? JSON.stringify(log.details) : "",
        }
      })

      // Create export content based on format
      let content: string
      let mimeType: string
      let fileExtension: string

      if (input.format === "json") {
        content = JSON.stringify(
          {
            version: "1.0",
            exportDate: new Date().toISOString(),
            count: formattedLogs.length,
            logs: formattedLogs,
          },
          null,
          2
        )
        mimeType = "application/json"
        fileExtension = "json"
      } else {
        // CSV format
        const headers = [
          "ID",
          "User",
          "User Email",
          "Action",
          "Resource",
          "Resource ID",
          "IP Address",
          "User Agent",
          "Status",
          "Timestamp",
          "Details",
        ]
        const rows = formattedLogs.map((log) => [
          log.id,
          escapeCSVField(log.user),
          escapeCSVField(log.userEmail),
          escapeCSVField(log.action),
          escapeCSVField(log.resource),
          escapeCSVField(log.resourceId),
          escapeCSVField(log.ipAddress),
          escapeCSVField(log.userAgent),
          log.status,
          log.timestamp,
          escapeCSVField(log.details),
        ])

        content = [headers.join(","), ...rows.map((row) => row.join(","))].join(
          "\n"
        )
        mimeType = "text/csv"
        fileExtension = "csv"
      }

      // Create audit log for export
      await createAuditLog({
        action: "AUDIT_LOG_EXPORTED",
        resource: "AuditLog",
        details: {
          format: input.format,
          count: formattedLogs.length,
        },
        userId: ctx.userId || null,
      })

      return {
        content,
        mimeType,
        fileExtension,
        count: formattedLogs.length,
      }
    }),
})

// Helper function to escape CSV fields
function escapeCSVField(field: string): string {
  if (!field) return ""
  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`
  }
  return field
}
