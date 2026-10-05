"use server"

import prisma from "@/lib/prisma"
import { createAuditLog } from "@/lib/audit-log"
import { Prisma, type AuditStatus } from "@/app/generated"

export interface AuditLogArchiveConfig {
  archiveOlderThanDays: number
  autoArchiveEnabled: boolean
  archiveFormat: "JSON" | "CSV" | "BOTH"
}

export interface AuditLogAnalytics {
  totalLogs: number
  logsByAction: Array<{ action: string; count: number }>
  logsByStatus: Array<{ status: string; count: number }>
  logsByResource: Array<{ resource: string; count: number }>
  logsByUser: Array<{ userId: string; userName: string; count: number }>
  logsByDay: Array<{ date: string; count: number }>
  logsByHour: Array<{ hour: number; count: number }>
  topIpAddresses: Array<{ ipAddress: string; count: number }>
  failedActions: Array<{ action: string; count: number }>
}

export interface FormattedAuditLog {
  id: string
  user: string
  userEmail: string
  action: string
  resource: string | null
  ipAddress: string
  timestamp: string
  status: "success" | "failed" | "warning" | "blocked"
  avatar: string | null
  details?: Record<string, unknown>
}

const ARCHIVE_BATCH_SIZE = 1000
const ARCHIVE_MAX_BATCHES = 100

/**
 * Archive audit logs older than specified days.
 * Permanently deletes the matching rows of ONE company; refuses without a company.
 */
export async function archiveAuditLogs(
  companyId: string | null,
  olderThanDays: number,
  archivedBy?: string
): Promise<{
  archiveId: string
  archivedCount: number
}> {
  if (!companyId) {
    throw new Error("A company is required to archive audit logs")
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

  const where: Prisma.AuditLogWhereInput = {
    createdAt: { lt: cutoffDate },
    user: { companyId },
  }

  const [count, oldestLog, newestLog] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findFirst({ where, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.auditLog.findFirst({ where, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ])

  if (count === 0) {
    throw new Error("No logs found to archive")
  }

  // Record the archive before deleting anything
  const archive = await prisma.auditLogArchive.create({
    data: {
      companyId,
      startDate: oldestLog?.createdAt || cutoffDate,
      endDate: newestLog?.createdAt || cutoffDate,
      logCount: count,
      archivedBy: archivedBy || null,
      status: "PROCESSING",
    },
  })

  let deletedCount = 0
  try {
    // Batched, tenant-scoped delete (nothing is exported: the rows are purged)
    for (let batch = 0; batch < ARCHIVE_MAX_BATCHES; batch++) {
      const rows = await prisma.auditLog.findMany({
        where,
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: ARCHIVE_BATCH_SIZE,
      })
      if (rows.length === 0) break
      const result = await prisma.auditLog.deleteMany({
        where: { ...where, id: { in: rows.map((row) => row.id) } },
      })
      deletedCount += result.count
      if (rows.length < ARCHIVE_BATCH_SIZE) break
    }
  } catch (error) {
    await prisma.auditLogArchive.update({
      where: { id: archive.id },
      data: { status: "FAILED", logCount: deletedCount },
    })
    throw error
  }

  await prisma.auditLogArchive.update({
    where: { id: archive.id },
    data: { status: "COMPLETED", logCount: deletedCount },
  })

  await createAuditLog({
    action: "AUDIT_LOG_ARCHIVED",
    resource: "AuditLogArchive",
    resourceId: archive.id,
    details: {
      archivedCount: deletedCount,
      olderThanDays,
    },
    userId: archivedBy || null,
    companyId,
  })

  return {
    archiveId: archive.id,
    archivedCount: deletedCount,
  }
}

const MAX_ANALYTICS_RANGE_MS = 365 * 24 * 60 * 60 * 1000

/**
 * Get audit log analytics (range capped to 365 days, all queries run in parallel)
 */
export async function getAuditLogAnalytics(
  companyId: string | null,
  startDate: Date,
  endDate: Date
): Promise<AuditLogAnalytics> {
  if (endDate.getTime() - startDate.getTime() > MAX_ANALYTICS_RANGE_MS) {
    startDate = new Date(endDate.getTime() - MAX_ANALYTICS_RANGE_MS)
  }

  const where: Prisma.AuditLogWhereInput = {
    createdAt: {
      gte: startDate,
      lte: endDate,
    },
  }

  if (companyId) {
    where.user = {
      companyId,
    }
  }

  const topCount = { _count: { id: "desc" as const } }

  const dayQuery = companyId
    ? prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
        SELECT
          DATE_TRUNC('day', al."createdAt")::date::text as date,
          COUNT(*)::int as count
        FROM "AuditLog" al
        INNER JOIN "User" u ON al."userId" = u.id
        WHERE al."createdAt" >= ${startDate}
          AND al."createdAt" <= ${endDate}
          AND u."companyId" = ${companyId}
        GROUP BY DATE_TRUNC('day', al."createdAt")::date
        ORDER BY date ASC
      `
    : prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
        SELECT
          DATE_TRUNC('day', "createdAt")::date::text as date,
          COUNT(*)::int as count
        FROM "AuditLog"
        WHERE "createdAt" >= ${startDate}
          AND "createdAt" <= ${endDate}
        GROUP BY DATE_TRUNC('day', "createdAt")::date
        ORDER BY date ASC
      `

  const hourQuery = companyId
    ? prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
        SELECT
          EXTRACT(HOUR FROM al."createdAt")::int as hour,
          COUNT(*)::int as count
        FROM "AuditLog" al
        INNER JOIN "User" u ON al."userId" = u.id
        WHERE al."createdAt" >= ${startDate}
          AND al."createdAt" <= ${endDate}
          AND u."companyId" = ${companyId}
        GROUP BY EXTRACT(HOUR FROM al."createdAt")
        ORDER BY hour ASC
      `
    : prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
        SELECT
          EXTRACT(HOUR FROM "createdAt")::int as hour,
          COUNT(*)::int as count
        FROM "AuditLog"
        WHERE "createdAt" >= ${startDate}
          AND "createdAt" <= ${endDate}
        GROUP BY EXTRACT(HOUR FROM "createdAt")
        ORDER BY hour ASC
      `

  // Top users plus their names (names filtered by company for security)
  const usersQuery = prisma.auditLog
    .groupBy({
      by: ["userId"],
      where,
      _count: { id: true },
      orderBy: topCount,
      take: 10,
    })
    .then(async (logsByUserRaw) => {
      const userIds = logsByUserRaw
        .map((item) => item.userId)
        .filter((id): id is string => id !== null)

      const userWhere: Prisma.UserWhereInput = { id: { in: userIds } }
      if (companyId) {
        userWhere.companyId = companyId
      }

      const users = userIds.length > 0
        ? await prisma.user.findMany({ where: userWhere, select: { id: true, name: true } })
        : []

      const userMap = new Map(users.map((u) => [u.id, u.name]))
      return logsByUserRaw
        .filter((item) => item.userId !== null)
        .map((item) => ({
          userId: item.userId!,
          userName: userMap.get(item.userId!) || "Unknown",
          count: item._count.id,
        }))
    })

  const [
    totalLogs,
    logsByActionRaw,
    logsByStatusRaw,
    logsByResourceRaw,
    logsByUser,
    logsByDayRaw,
    logsByHourRaw,
    topIpAddressesRaw,
    failedActionsRaw,
  ] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({
      by: ["action"],
      where,
      _count: { id: true },
      orderBy: topCount,
      take: 10,
    }),
    prisma.auditLog.groupBy({
      by: ["status"],
      where,
      _count: { id: true },
    }),
    prisma.auditLog.groupBy({
      by: ["resource"],
      where,
      _count: { id: true },
      orderBy: topCount,
      take: 10,
    }),
    usersQuery,
    dayQuery,
    hourQuery,
    prisma.auditLog.groupBy({
      by: ["ipAddress"],
      where: { ...where, ipAddress: { not: null } },
      _count: { id: true },
      orderBy: topCount,
      take: 10,
    }),
    prisma.auditLog.groupBy({
      by: ["action"],
      where: { ...where, status: { in: ["FAILED", "BLOCKED"] } },
      _count: { id: true },
      orderBy: topCount,
      take: 10,
    }),
  ])

  return {
    totalLogs,
    logsByAction: logsByActionRaw.map((item) => ({
      action: item.action,
      count: item._count.id,
    })),
    logsByStatus: logsByStatusRaw.map((item) => ({
      status: item.status,
      count: item._count.id,
    })),
    logsByResource: logsByResourceRaw.map((item) => ({
      resource: item.resource,
      count: item._count.id,
    })),
    logsByUser,
    logsByDay: logsByDayRaw.map((item) => ({
      date: item.date,
      count: Number(item.count),
    })),
    logsByHour: logsByHourRaw.map((item) => ({
      hour: Number(item.hour),
      count: Number(item.count),
    })),
    topIpAddresses: topIpAddressesRaw
      .filter((item) => item.ipAddress !== null)
      .map((item) => ({
        ipAddress: item.ipAddress!,
        count: item._count.id,
      })),
    failedActions: failedActionsRaw.map((item) => ({
      action: item.action,
      count: item._count.id,
    })),
  }
}

/**
 * Advanced search for audit logs with multiple filters
 */
export interface AdvancedAuditLogFilters {
  actions?: string[]
  resources?: string[]
  statuses?: string[]
  userIds?: string[]
  ipAddresses?: string[]
  dateRange?: {
    start: Date
    end: Date
  }
  searchText?: string
  hasDetails?: boolean
}

export async function searchAuditLogsAdvanced(
  companyId: string | null,
  filters: AdvancedAuditLogFilters,
  page: number = 1,
  pageSize: number = 20
): Promise<{
  logs: FormattedAuditLog[]
  total: number
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}> {
  // Build where clause
  const where: Prisma.AuditLogWhereInput = {}

  if (companyId) {
    where.user = {
      companyId,
    }
  }

  if (filters.actions && filters.actions.length > 0) {
    where.action = { in: filters.actions }
  }

  if (filters.resources && filters.resources.length > 0) {
    where.resource = { in: filters.resources }
  }

  if (filters.statuses && filters.statuses.length > 0) {
    where.status = { in: filters.statuses as AuditStatus[] }
  }

  if (filters.userIds && filters.userIds.length > 0) {
    where.userId = { in: filters.userIds }
  }

  if (filters.ipAddresses && filters.ipAddresses.length > 0) {
    where.ipAddress = { in: filters.ipAddresses }
  }

  if (filters.dateRange) {
    where.createdAt = {
      gte: filters.dateRange.start,
      lte: filters.dateRange.end,
    }
  }

  if (filters.hasDetails !== undefined) {
    if (filters.hasDetails) {
      where.details = { not: Prisma.DbNull }
    } else {
      where.details = { equals: Prisma.DbNull }
    }
  }

  if (filters.searchText) {
    where.OR = [
      { action: { contains: filters.searchText, mode: "insensitive" } },
      { resource: { contains: filters.searchText, mode: "insensitive" } },
      { ipAddress: { contains: filters.searchText, mode: "insensitive" } },
      { user: { name: { contains: filters.searchText, mode: "insensitive" } } },
      { user: { email: { contains: filters.searchText, mode: "insensitive" } } },
    ]
  }

  // Count and page are independent
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
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
    }),
  ])

  // Format logs
  const formattedLogs: FormattedAuditLog[] = logs.map((log) => {
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
    total,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}
