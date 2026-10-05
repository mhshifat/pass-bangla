import { after } from "next/server"
import prisma from "./prisma"
import { Prisma } from "@/app/generated"
import { getSession } from "./session"
import { getUserCompanyId } from "./user-company"

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

export interface CreateAuditLogOptions {
  /**
   * true  – write before the returned promise resolves (the caller's `await` waits for the row).
   * false – always hand the write to Next's `after()`, so it runs once the response has been sent.
   * Omitted – deferred, except for the entries listed in `writesInlineByDefault`.
   */
  sync?: boolean
}

/**
 * Entries that later security decisions read back (failed-login counts for
 * brute-force and CAPTCHA checks, login history for anomaly detection, threat
 * events) are written inline unless the caller says otherwise, so the next
 * attempt is always judged against a complete log.
 */
function writesInlineByDefault(params: CreateAuditLogParams): boolean {
  return (
    (params.status !== undefined && params.status !== "SUCCESS") ||
    params.action.startsWith("LOGIN") ||
    params.action.startsWith("THREAT_") ||
    params.action.endsWith("_FAILED")
  )
}

function logAuditFailure(params: CreateAuditLogParams, error: unknown): void {
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

async function writeAuditLog(params: CreateAuditLogParams, userId: string | null): Promise<void> {
  try {
    let companyId = params.companyId

    // If companyId is not provided and we have a userId, get it from the user
    if (!companyId && userId) {
      companyId = await getUserCompanyId(userId)
    }

    // Always log in development to help debug
    if (process.env.NODE_ENV === "development") {
      console.log(`[Audit Log] Attempting to create: ${params.action} for ${params.resource}${params.resourceId ? ` (${params.resourceId})` : ""} by user ${userId || "unknown"} (company: ${companyId || "none"})`)
    }

    await prisma.auditLog.create({
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
      select: { id: true },
    })
  } catch (error) {
    logAuditFailure(params, error)
  }
}

/**
 * Create an audit log entry
 * If userId is not provided, it will try to get it from the current session
 * If companyId is not provided, it will try to get it from the user
 *
 * By default the insert is scheduled with `after()` and does not delay the
 * response; the returned promise then resolves as soon as it is scheduled.
 * Pass `{ sync: true }` when the row must exist before the caller continues.
 * Never throws.
 */
export async function createAuditLog(
  params: CreateAuditLogParams,
  options: CreateAuditLogOptions = {}
): Promise<void> {
  let userId = params.userId || null

  // If userId is not provided, try to get it from session.
  // Resolved now rather than in the deferred write: request cookies are not
  // readable from an after() callback in every context.
  if (!userId) {
    try {
      const session = await getSession()
      userId = session?.userId || null
    } catch (error) {
      logAuditFailure(params, error)
      return
    }
  }

  const sync = options.sync ?? writesInlineByDefault(params)
  if (!sync) {
    try {
      after(() => writeAuditLog(params, userId))
      return
    } catch {
      // after() is unavailable outside a request scope (scripts, jobs) — write inline instead
    }
  }

  await writeAuditLog(params, userId)
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
