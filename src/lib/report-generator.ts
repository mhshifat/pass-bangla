import prisma from "@/lib/prisma"
import { Prisma, type AuditStatus } from "@/app/generated"

/**
 * Report configuration interface
 */
export interface ReportConfig {
  name?: string // Report name
  filters?: {
    dateRange?: {
      start: Date
      end: Date
    }
    userIds?: string[]
    actions?: string[]
    resources?: string[]
    statuses?: string[]
    [key: string]: unknown
  }
  fields?: string[] // Fields to include in the report
  groupBy?: string // Group results by field
  sortBy?: string
  sortOrder?: "asc" | "desc"
  limit?: number // Maximum number of records
  [key: string]: unknown
}

/**
 * Report data interface
 */
export interface ReportData {
  metadata: {
    reportName: string
    generatedAt: Date
    generatedBy: string
    dateRange?: {
      start: Date
      end: Date
    }
    filters?: Record<string, unknown>
    complianceStandard?: string
  }
  summary?: {
    totalRecords: number
    [key: string]: unknown
  }
  data: unknown[]
}

const MAX_REPORT_ROWS = 10000
const CATEGORY_SAMPLE_SIZE = 100

function rowLimit(config: ReportConfig): number {
  const limit = Number(config.limit)
  return limit > 0 ? Math.min(limit, MAX_REPORT_ROWS) : MAX_REPORT_ROWS
}

/**
 * Totals and a bounded sample for one control category, computed in SQL
 * instead of loading every audit row for the period.
 */
async function categoryStats(
  baseWhere: Prisma.AuditLogWhereInput,
  categoryWhere: Prisma.AuditLogWhereInput
) {
  const where: Prisma.AuditLogWhereInput = { AND: [baseWhere, categoryWhere] }
  const [total, compliant, events] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.count({ where: { AND: [where, { status: "SUCCESS" }] } }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: CATEGORY_SAMPLE_SIZE,
    }),
  ])
  return { total, compliant, nonCompliant: total - compliant, events }
}

const actionContains = (...terms: string[]): Prisma.AuditLogWhereInput[] =>
  terms.map((term) => ({ action: { contains: term } }))

/**
 * Generate report data based on report type and configuration
 */
export async function generateReportData(
  reportType: string,
  config: ReportConfig,
  userId: string,
  companyId: string | null
): Promise<ReportData> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  })

  const metadata = {
    reportName: config.name || `${reportType} Report`,
    generatedAt: new Date(),
    generatedBy: user?.name || user?.email || "Unknown",
    dateRange: config.filters?.dateRange,
    filters: config.filters,
  }

  switch (reportType) {
    case "AUDIT":
      return generateAuditReport(config, userId, companyId, metadata)
    case "SECURITY":
      return generateSecurityReport(config, userId, companyId, metadata)
    case "COMPLIANCE":
      return generateComplianceReport(config, userId, companyId, metadata)
    case "SOC2":
      return generateSOC2Report(config, userId, companyId, metadata)
    case "ISO27001":
      return generateISO27001Report(config, userId, companyId, metadata)
    case "CUSTOM":
    default:
      return generateCustomReport(config, userId, companyId, metadata)
  }
}

/**
 * Generate audit log report
 */
async function generateAuditReport(
  config: ReportConfig,
  userId: string,
  companyId: string | null,
  metadata: ReportData["metadata"]
): Promise<ReportData> {
  const where: Prisma.AuditLogWhereInput = {}

  // Filter by company through user relation
  where.user = companyId ? { companyId } : { id: userId }

  if (config.filters?.dateRange) {
    where.createdAt = {
      gte: config.filters.dateRange.start,
      lte: config.filters.dateRange.end,
    }
  }

  if (config.filters?.userIds && config.filters.userIds.length > 0) {
    where.userId = { in: config.filters.userIds }
  }

  if (config.filters?.actions && config.filters.actions.length > 0) {
    where.action = { in: config.filters.actions as string[] }
  }

  if (config.filters?.resources && config.filters.resources.length > 0) {
    where.resource = { in: config.filters.resources as string[] }
  }

  if (config.filters?.statuses && config.filters.statuses.length > 0) {
    where.status = { in: config.filters.statuses as AuditStatus[] }
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: config.sortBy
      ? { [config.sortBy]: config.sortOrder || "desc" }
      : { createdAt: "desc" },
    take: rowLimit(config),
  })

  const data = logs.map((log) => ({
    id: log.id,
    timestamp: log.createdAt,
    user: log.user?.name || "Unknown",
    userEmail: log.user?.email || "N/A",
    action: log.action,
    resource: log.resource,
    resourceId: log.resourceId,
    status: log.status,
    ipAddress: log.ipAddress || "N/A",
    userAgent: log.userAgent || "N/A",
    details: log.details,
  }))

  return {
    metadata,
    summary: {
      totalRecords: logs.length,
      dateRange: config.filters?.dateRange,
    },
    data,
  }
}

/**
 * Generate security report
 */
async function generateSecurityReport(
  config: ReportConfig,
  userId: string,
  companyId: string | null,
  metadata: ReportData["metadata"]
): Promise<ReportData> {
  // Combine audit logs, threat events, and security metrics
  const where: Prisma.AuditLogWhereInput = {
    status: { in: ["FAILED", "BLOCKED", "WARNING"] },
  }
  
  where.user = companyId ? { companyId } : { id: userId }

  if (config.filters?.dateRange) {
    where.createdAt = {
      gte: config.filters.dateRange.start,
      lte: config.filters.dateRange.end,
    }
  }

  const [securityEvents, threatEvents] = await Promise.all([
    prisma.auditLog.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: rowLimit(config),
  }),
  // Threat events
  prisma.threatEvent.findMany({
    where: {
      companyId: companyId ?? null,
      ...(config.filters?.dateRange && {
        createdAt: {
          gte: config.filters.dateRange.start,
          lte: config.filters.dateRange.end,
        },
      }),
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: rowLimit(config),
  }),
  ])

  const data = [
    ...securityEvents.map((event) => ({
      type: "AUDIT_LOG",
      id: event.id,
      timestamp: event.createdAt,
      user: event.user?.name || "Unknown",
      userEmail: event.user?.email || "N/A",
      action: event.action,
      status: event.status,
      severity: event.status === "BLOCKED" ? "HIGH" : "MEDIUM",
      details: event.details,
    })),
    ...threatEvents.map((event) => ({
      type: "THREAT_EVENT",
      id: event.id,
      timestamp: event.createdAt,
      user: event.user?.name || "Unknown",
      userEmail: event.user?.email || "N/A",
      threatType: event.threatType,
      severity: event.severity,
      isResolved: event.isResolved,
      details: event.details,
    })),
  ]

  return {
    metadata,
    summary: {
      totalRecords: data.length,
      securityEvents: securityEvents.length,
      threatEvents: threatEvents.length,
    },
    data,
  }
}

/**
 * Generate compliance report
 */
async function generateComplianceReport(
  config: ReportConfig,
  userId: string,
  companyId: string | null,
  metadata: ReportData["metadata"]
): Promise<ReportData> {
  // Compliance report includes audit logs, user activities, and policy compliance
  const where: Prisma.AuditLogWhereInput = {}
  
  where.user = companyId ? { companyId } : { id: userId }

  if (config.filters?.dateRange) {
    where.createdAt = {
      gte: config.filters.dateRange.start,
      lte: config.filters.dateRange.end,
    }
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: rowLimit(config),
  })

  const data = logs.map((log) => ({
    timestamp: log.createdAt,
    user: log.user?.name || "Unknown",
    userEmail: log.user?.email || "N/A",
    userRole: log.user?.role || "N/A",
    action: log.action,
    resource: log.resource,
    status: log.status,
    ipAddress: log.ipAddress || "N/A",
    compliance: {
      accessControl: log.status === "SUCCESS" ? "COMPLIANT" : "NON_COMPLIANT",
      auditTrail: "COMPLIANT", // All actions are logged
    },
  }))

  return {
    metadata,
    summary: {
      totalRecords: logs.length,
      compliantActions: logs.filter((l) => l.status === "SUCCESS").length,
      nonCompliantActions: logs.filter((l) => l.status !== "SUCCESS").length,
    },
    data,
  }
}

/**
 * Generate SOC2 compliance report
 */
async function generateSOC2Report(
  config: ReportConfig,
  userId: string,
  companyId: string | null,
  metadata: ReportData["metadata"]
): Promise<ReportData> {
  const dateRange = config.filters?.dateRange || {
    start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
    end: new Date(),
  }

  // SOC2 focuses on security, availability, processing integrity, confidentiality, and privacy
  const where: Prisma.AuditLogWhereInput = {
    createdAt: {
      gte: dateRange.start,
      lte: dateRange.end,
    },
  }
  
  where.user = companyId ? { companyId } : { id: userId }

  const [totalRecords, successRecords, security, access, integrity] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.count({ where: { ...where, status: "SUCCESS" } }),
    categoryStats(where, {
      OR: [...actionContains("LOGIN", "AUTH", "MFA"), { status: "BLOCKED" }],
    }),
    categoryStats(where, { OR: actionContains("ACCESS", "PERMISSION") }),
    categoryStats(where, { OR: actionContains("CREATE", "UPDATE", "DELETE") }),
  ])

  const data = [
    {
      category: "Security",
      totalEvents: security.total,
      compliant: security.compliant,
      nonCompliant: security.nonCompliant,
      events: security.events,
    },
    {
      category: "Access Control",
      totalEvents: access.total,
      compliant: access.compliant,
      nonCompliant: access.nonCompliant,
      events: access.events,
    },
    {
      category: "Data Integrity",
      totalEvents: integrity.total,
      compliant: integrity.compliant,
      nonCompliant: integrity.nonCompliant,
      events: integrity.events,
    },
  ]

  return {
    metadata: {
      ...metadata,
      reportName: "SOC2 Compliance Report",
      complianceStandard: "SOC2 Type II",
    },
    summary: {
      totalRecords,
      securityControls: security.total,
      accessControls: access.total,
      dataIntegrity: integrity.total,
      complianceRate: totalRecords > 0 ? (successRecords / totalRecords) * 100 : 100,
    },
    data,
  }
}

/**
 * Generate ISO27001 compliance report
 */
async function generateISO27001Report(
  config: ReportConfig,
  userId: string,
  companyId: string | null,
  metadata: ReportData["metadata"]
): Promise<ReportData> {
  const dateRange = config.filters?.dateRange || {
    start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
    end: new Date(),
  }

  const where: Prisma.AuditLogWhereInput = {
    createdAt: {
      gte: dateRange.start,
      lte: dateRange.end,
    },
  }
  
  where.user = companyId ? { companyId } : { id: userId }

  const [totalRecords, successRecords, accessControl, cryptography, incident] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.count({ where: { ...where, status: "SUCCESS" } }),
    categoryStats(where, { OR: actionContains("ACCESS", "LOGIN", "PERMISSION") }),
    categoryStats(where, { OR: actionContains("ENCRYPT", "DECRYPT") }),
    categoryStats(where, {
      OR: [{ status: "FAILED" }, { status: "BLOCKED" }, ...actionContains("THREAT")],
    }),
  ])

  const data = [
    {
      control: "A.9 Access Control",
      totalEvents: accessControl.total,
      compliant: accessControl.compliant,
      nonCompliant: accessControl.nonCompliant,
      events: accessControl.events,
    },
    {
      control: "A.10 Cryptography",
      totalEvents: cryptography.total,
      compliant: cryptography.compliant,
      nonCompliant: cryptography.nonCompliant,
      events: cryptography.events,
    },
    {
      control: "A.16 Incident Management",
      totalEvents: incident.total,
      compliant: incident.compliant,
      nonCompliant: incident.nonCompliant,
      events: incident.events,
    },
  ]

  return {
    metadata: {
      ...metadata,
      reportName: "ISO27001 Compliance Report",
      complianceStandard: "ISO/IEC 27001:2022",
    },
    summary: {
      totalRecords,
      accessControl: accessControl.total,
      cryptography: cryptography.total,
      incidentManagement: incident.total,
      complianceRate: totalRecords > 0 ? (successRecords / totalRecords) * 100 : 100,
    },
    data,
  }
}

/**
 * Generate custom report based on user-defined configuration
 */
async function generateCustomReport(
  config: ReportConfig,
  userId: string,
  companyId: string | null,
  metadata: ReportData["metadata"]
): Promise<ReportData> {
  // Custom reports can combine multiple data sources based on config
  const where: Prisma.AuditLogWhereInput = {}
  
  where.user = companyId ? { companyId } : { id: userId }

  if (config.filters?.dateRange) {
    where.createdAt = {
      gte: config.filters.dateRange.start,
      lte: config.filters.dateRange.end,
    }
  }

  if (config.filters?.userIds && config.filters.userIds.length > 0) {
    where.userId = { in: config.filters.userIds }
  }

  if (config.filters?.actions && config.filters.actions.length > 0) {
    where.action = { in: config.filters.actions as string[] }
  }

  if (config.filters?.resources && config.filters.resources.length > 0) {
    where.resource = { in: config.filters.resources as string[] }
  }

  if (config.filters?.statuses && config.filters.statuses.length > 0) {
    where.status = { in: config.filters.statuses as AuditStatus[] }
  }

  // Map sortBy field names to database fields
  const sortFieldMap: Record<string, string> = {
    timestamp: "createdAt",
    user: "user",
    action: "action",
    resource: "resource",
    status: "status",
  }

  let orderBy: Prisma.AuditLogOrderByWithRelationInput = { createdAt: "desc" }
  if (config.sortBy) {
    const dbField = sortFieldMap[config.sortBy] || config.sortBy
    // Handle special case for user sorting (need to sort by user name)
    if (dbField === "user") {
      orderBy = { user: { name: config.sortOrder || "desc" } }
    } else {
      orderBy = { [dbField]: config.sortOrder || "desc" } as Prisma.AuditLogOrderByWithRelationInput
    }
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy,
    take: rowLimit(config),
  })

  // Apply field selection if specified
  const data = logs.map((log) => {
    const baseData: Record<string, unknown> = {
      id: log.id,
      timestamp: log.createdAt,
      user: log.user?.name || "Unknown",
      userEmail: log.user?.email || "N/A",
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      status: log.status,
      ipAddress: log.ipAddress || "N/A",
      userAgent: log.userAgent || "N/A",
      details: log.details,
    }

    // Filter fields if specified
    if (config.fields && config.fields.length > 0) {
      const filtered: Record<string, unknown> = {}
      for (const field of config.fields) {
        if (field in baseData) {
          filtered[field] = baseData[field]
        }
      }
      return filtered
    }

    return baseData
  })

  return {
    metadata,
    summary: {
      totalRecords: logs.length,
    },
    data,
  }
}




