import prisma from "./prisma"
import { Prisma } from "@/app/generated"
import { getSession } from "./session"

interface CreateAuditLogParams {
  action: string
  resource: string
  resourceId?: string | null
  details?: Record<string, unknown> | string
  status?: "SUCCESS" | "FAILED" | "WARNING" | "BLOCKED"
  userId?: string | null
  companyId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}

/**
 * Create an audit log entry
 * If userId is not provided, it will try to get it from the current session
 * If companyId is not provided, it will try to get it from the user
 */
export async function createAuditLog(params: CreateAuditLogParams): Promise<void> {
  try {
    let userId = params.userId
    let companyId = params.companyId

    // If userId is not provided, try to get it from session
    if (!userId) {
      const session = await getSession()
      userId = session?.userId || null
    }

    // If companyId is not provided and we have a userId, get it from the user
    if (!companyId && userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
      })
      companyId = user?.companyId || null
    }

    // Always log in development to help debug
    if (process.env.NODE_ENV === "development") {
      console.log(`[Audit Log] Attempting to create: ${params.action} for ${params.resource}${params.resourceId ? ` (${params.resourceId})` : ""} by user ${userId || "unknown"} (company: ${companyId || "none"})`)
    }

    const auditLog = await prisma.auditLog.create({
      data: {
        userId: userId || null,
        companyId: companyId || null,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId || null,
        details: typeof params.details === "string" ? { message: params.details } : (params.details as Prisma.InputJsonValue) || Prisma.JsonNull,
        status: params.status || "SUCCESS",
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
      },
    })

    // Log successful creation
    console.log(`[Audit Log] ✅ Created: ${params.action} for ${params.resource}${params.resourceId ? ` (${params.resourceId})` : ""} by user ${userId || "unknown"} - ID: ${auditLog.id}`)
  } catch (error) {
    // Don't throw errors from audit logging - it shouldn't break the main operation
    // But log it prominently so we can debug
    console.error(`[Audit Log Error] ❌ Failed to create audit log for action: ${params.action}`, error)
    if (error instanceof Error) {
      console.error(`[Audit Log Error] Message: ${error.message}`)
      console.error(`[Audit Log Error] Stack: ${error.stack}`)
    }
    // Also log the params that failed
    console.error(`[Audit Log Error] Params:`, JSON.stringify(params, null, 2))
  }
}

/**
 * Get IP address and user agent from request headers
 */
export function getRequestMetadata(headers: Headers | Record<string, string | string[] | undefined>): {
  ipAddress: string | null
  userAgent: string | null
} {
  let ipAddress: string | null = null
  let userAgent: string | null = null

  if (headers instanceof Headers) {
    ipAddress = headers.get("x-forwarded-for") || headers.get("x-real-ip") || null
    userAgent = headers.get("user-agent") || null
  } else {
    const forwardedFor = headers["x-forwarded-for"]
    const realIp = headers["x-real-ip"]
    const ua = headers["user-agent"]

    ipAddress = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) ||
                (Array.isArray(realIp) ? realIp[0] : realIp) ||
                null

    userAgent = (Array.isArray(ua) ? ua[0] : ua) || null
  }

  // Extract first IP from comma-separated list (x-forwarded-for can contain multiple IPs)
  if (ipAddress) {
    ipAddress = ipAddress.split(",")[0].trim()
  }

  return { ipAddress, userAgent }
}
