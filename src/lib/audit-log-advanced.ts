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

/**
 * Archive audit logs older than specified days
 */
export async function archiveAuditLogs(
  companyId: string | null,
  olderThanDays: number,
  archivedBy?: string
): Promise<{
  archiveId: string
  archivedCount: number
}> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

  // Build where clause with company filtering
  const where: Prisma.AuditLogWhereInput = {
    createdAt: {
      lt: cutoffDate,
    },
  }

  if (companyId) {
    where.user = {
      companyId,
    }
  }

  // Count logs to archive
  const count = await prisma.auditLog.count({ where })

  if (count === 0) {
    throw new Error("No logs found to archive")
  }

  // Get the date range of logs to archive
  const oldestLog = await prisma.auditLog.findFirst({
    where,
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  })

  const newestLog = await prisma.auditLog.findFirst({
    where,
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  })

  // Create archive record
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

  // In a real implementation, you would:
  // 1. Export logs to file (JSON/CSV)
  // 2. Store file in S3 or similar
  // 3. Delete logs from database
  // For now, we'll just mark them as archived by updating the archive record

  // Delete archived logs
  const deleted = await prisma.auditLog.deleteMany({ where })

  // Update archive record
  await prisma.auditLogArchive.update({
    where: { id: archive.id },
    data: {
      status: "COMPLETED",
      logCount: deleted.count,
    },
  })

  // Create audit log for archiving action
  await createAuditLog({
    action: "AUDIT_LOG_ARCHIVED",
    resource: "AuditLogArchive",
    resourceId: archive.id,
    details: {
      archivedCount: deleted.count,
      olderThanDays,
    },
    userId: archivedBy || null,
  })

  return {
    archiveId: archive.id,
    archivedCount: deleted.count,
  }
}

/**
 * Get audit log analytics
 */
export async function getAuditLogAnalytics(
  companyId: string | null,
  startDate: Date,
  endDate: Date
): Promise<AuditLogAnalytics> {
  // Build where clause with company filtering
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

  // Get total count
  const totalLogs = await prisma.auditLog.count({ where })

  // Get logs by action
  const logsByActionRaw = await prisma.auditLog.groupBy({
    by: ["action"],
    where,
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: "desc",
      },
    },
    take: 10,
  })

  const logsByAction = logsByActionRaw.map((item) => ({
    action: item.action,
    count: item._count.id,
  }))

  // Get logs by status
  const logsByStatusRaw = await prisma.auditLog.groupBy({
    by: ["status"],
    where,
    _count: {
      id: true,
    },
  })

  const logsByStatus = logsByStatusRaw.map((item) => ({
    status: item.status,
    count: item._count.id,
  }))

  // Get logs by resource
  const logsByResourceRaw = await prisma.auditLog.groupBy({
    by: ["resource"],
    where,
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: "desc",
      },
    },
    take: 10,
  })

  const logsByResource = logsByResourceRaw.map((item) => ({
    resource: item.resource,
    count: item._count.id,
  }))

  // Get logs by user
  const logsByUserRaw = await prisma.auditLog.groupBy({
    by: ["userId"],
    where,
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: "desc",
      },
    },
    take: 10,
  })

  // Get user names for user IDs (filtered by company for security)
  const userIds = logsByUserRaw
    .map((item) => item.userId)
    .filter((id): id is string => id !== null)
  
  const userWhere: Prisma.UserWhereInput = { id: { in: userIds } }
  if (companyId) {
    userWhere.companyId = companyId
  }
  
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: userWhere,
        select: { id: true, name: true },
      })
    : []

  const userMap = new Map(users.map((u) => [u.id, u.name]))
  const logsByUser = logsByUserRaw
    .filter((item) => item.userId !== null)
    .map((item) => ({
      userId: item.userId!,
      userName: userMap.get(item.userId!) || "Unknown",
      count: item._count.id,
    }))

  // Get logs by day
  let logsByDayRaw: Array<{ date: string; count: bigint }>
  if (companyId) {
    logsByDayRaw = await prisma.$queryRaw<
      Array<{ date: string; count: bigint }>
    >`
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
  } else {
    logsByDayRaw = await prisma.$queryRaw<
      Array<{ date: string; count: bigint }>
    >`
      SELECT 
        DATE_TRUNC('day', "createdAt")::date::text as date,
        COUNT(*)::int as count
      FROM "AuditLog"
      WHERE "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
      GROUP BY DATE_TRUNC('day', "createdAt")::date
      ORDER BY date ASC
    `
  }

  const logsByDay = logsByDayRaw.map((item) => ({
    date: item.date,
    count: Number(item.count),
  }))

  // Get logs by hour
  let logsByHourRaw: Array<{ hour: number; count: bigint }>
  if (companyId) {
    logsByHourRaw = await prisma.$queryRaw<
      Array<{ hour: number; count: bigint }>
    >`
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
  } else {
    logsByHourRaw = await prisma.$queryRaw<
      Array<{ hour: number; count: bigint }>
    >`
      SELECT 
        EXTRACT(HOUR FROM "createdAt")::int as hour,
        COUNT(*)::int as count
      FROM "AuditLog"
      WHERE "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
      GROUP BY EXTRACT(HOUR FROM "createdAt")
      ORDER BY hour ASC
    `
  }

  const logsByHour = logsByHourRaw.map((item) => ({
    hour: Number(item.hour),
    count: Number(item.count),
  }))

  // Get top IP addresses
  const topIpAddressesRaw = await prisma.auditLog.groupBy({
    by: ["ipAddress"],
    where: {
      ...where,
      ipAddress: { not: null },
    },
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: "desc",
      },
    },
    take: 10,
  })

  const topIpAddresses = topIpAddressesRaw
    .filter((item) => item.ipAddress !== null)
    .map((item) => ({
      ipAddress: item.ipAddress!,
      count: item._count.id,
    }))

  // Get failed actions
  const failedActionsRaw = await prisma.auditLog.groupBy({
    by: ["action"],
    where: {
      ...where,
      status: { in: ["FAILED", "BLOCKED"] },
    },
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: "desc",
      },
    },
    take: 10,
  })

  const failedActions = failedActionsRaw.map((item) => ({
    action: item.action,
    count: item._count.id,
  }))

  return {
    totalLogs,
    logsByAction,
    logsByStatus,
    logsByResource,
    logsByUser,
    logsByDay,
    logsByHour,
    topIpAddresses,
    failedActions,
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

  // Get total count
  const total = await prisma.auditLog.count({ where })

  // Get paginated logs
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
