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
  if (companyId) {
    where.user = {
      companyId,
    }
  }

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
    take: config.limit || 10000,
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
  
  if (companyId) {
    where.user = {
      companyId,
    }
  }

  if (config.filters?.dateRange) {
    where.createdAt = {
      gte: config.filters.dateRange.start,
      lte: config.filters.dateRange.end,
    }
  }

  const securityEvents = await prisma.auditLog.findMany({
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
    take: config.limit || 10000,
  })

  // Get threat events if available
  const threatEvents = await prisma.threatEvent.findMany({
    where: {
      companyId: companyId || undefined,
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
    take: config.limit || 10000,
  })

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
  
  if (companyId) {
    where.user = {
      companyId,
    }
  }

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
    take: config.limit || 10000,
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
  
  if (companyId) {
    where.user = {
      companyId,
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
    orderBy: { createdAt: "desc" },
  })

  // Group by SOC2 criteria
  const securityControls = logs.filter(
    (l) =>
      l.action.includes("LOGIN") ||
      l.action.includes("AUTH") ||
      l.action.includes("MFA") ||
      l.status === "BLOCKED"
  )
  const accessControls = logs.filter(
    (l) => l.action.includes("ACCESS") || l.action.includes("PERMISSION")
  )
  const dataIntegrity = logs.filter(
    (l) => l.action.includes("CREATE") || l.action.includes("UPDATE") || l.action.includes("DELETE")
  )

  const data = [
    {
      category: "Security",
      totalEvents: securityControls.length,
      compliant: securityControls.filter((l) => l.status === "SUCCESS").length,
      nonCompliant: securityControls.filter((l) => l.status !== "SUCCESS").length,
      events: securityControls.slice(0, 100),
    },
    {
      category: "Access Control",
      totalEvents: accessControls.length,
      compliant: accessControls.filter((l) => l.status === "SUCCESS").length,
      nonCompliant: accessControls.filter((l) => l.status !== "SUCCESS").length,
      events: accessControls.slice(0, 100),
    },
    {
      category: "Data Integrity",
      totalEvents: dataIntegrity.length,
      compliant: dataIntegrity.filter((l) => l.status === "SUCCESS").length,
      nonCompliant: dataIntegrity.filter((l) => l.status !== "SUCCESS").length,
      events: dataIntegrity.slice(0, 100),
    },
  ]

  return {
    metadata: {
      ...metadata,
      reportName: "SOC2 Compliance Report",
      complianceStandard: "SOC2 Type II",
    },
    summary: {
      totalRecords: logs.length,
      securityControls: securityControls.length,
      accessControls: accessControls.length,
      dataIntegrity: dataIntegrity.length,
      complianceRate:
        logs.length > 0
          ? (logs.filter((l) => l.status === "SUCCESS").length / logs.length) * 100
          : 100,
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
  
  if (companyId) {
    where.user = {
      companyId,
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
    orderBy: { createdAt: "desc" },
  })

  // ISO27001 focuses on information security management
  const accessControl = logs.filter(
    (l) => l.action.includes("ACCESS") || l.action.includes("LOGIN") || l.action.includes("PERMISSION")
  )
  const cryptography = logs.filter((l) => l.action.includes("ENCRYPT") || l.action.includes("DECRYPT"))
  const incidentManagement = logs.filter(
    (l) => l.status === "FAILED" || l.status === "BLOCKED" || l.action.includes("THREAT")
  )

  const data = [
    {
      control: "A.9 Access Control",
      totalEvents: accessControl.length,
      compliant: accessControl.filter((l) => l.status === "SUCCESS").length,
      nonCompliant: accessControl.filter((l) => l.status !== "SUCCESS").length,
      events: accessControl.slice(0, 100),
    },
    {
      control: "A.10 Cryptography",
      totalEvents: cryptography.length,
      compliant: cryptography.filter((l) => l.status === "SUCCESS").length,
      nonCompliant: cryptography.filter((l) => l.status !== "SUCCESS").length,
      events: cryptography.slice(0, 100),
    },
    {
      control: "A.16 Incident Management",
      totalEvents: incidentManagement.length,
      compliant: incidentManagement.filter((l) => l.status === "SUCCESS").length,
      nonCompliant: incidentManagement.filter((l) => l.status !== "SUCCESS").length,
      events: incidentManagement.slice(0, 100),
    },
  ]

  return {
    metadata: {
      ...metadata,
      reportName: "ISO27001 Compliance Report",
      complianceStandard: "ISO/IEC 27001:2022",
    },
    summary: {
      totalRecords: logs.length,
      accessControl: accessControl.length,
      cryptography: cryptography.length,
      incidentManagement: incidentManagement.length,
      complianceRate:
        logs.length > 0
          ? (logs.filter((l) => l.status === "SUCCESS").length / logs.length) * 100
          : 100,
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
  
  if (companyId) {
    where.user = {
      companyId,
    }
  }

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
    take: config.limit || 10000,
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




