import { timingSafeEqual } from "node:crypto"
import prisma from "@/lib/prisma"
import { cleanupExpiredData } from "@/lib/gdpr-compliance"

// Daily housekeeping, triggered by Vercel Cron (see vercel.json)
export const maxDuration = 60
export const dynamic = "force-dynamic"

const BATCH_SIZE = 1000
const TIME_BUDGET_MS = 50_000
const DAY_MS = 24 * 60 * 60 * 1000

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(request.headers.get("authorization") ?? "")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// Deletes in id batches so no single statement holds a long lock
async function deleteInBatches(
  deadline: number,
  findIds: (take: number) => Promise<{ id: string }[]>,
  deleteByIds: (ids: string[]) => Promise<{ count: number }>
): Promise<number> {
  let total = 0
  while (Date.now() < deadline) {
    const rows = await findIds(BATCH_SIZE)
    if (rows.length === 0) break
    total += (await deleteByIds(rows.map((row) => row.id))).count
    if (rows.length < BATCH_SIZE) break
  }
  return total
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 })
  }

  const startedAt = Date.now()
  const deadline = startedAt + TIME_BUDGET_MS
  const now = new Date()
  const dayAgo = new Date(now.getTime() - DAY_MS)
  const results: Record<string, number> = {}
  const errors: string[] = []

  const run = async (name: string, task: () => Promise<number>) => {
    try {
      results[name] = await task()
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : "unknown error"}`)
    }
  }

  // Dead data only: nothing here can be a live session, token or rate-limit window
  await run("expiredSessions", () => {
    const where = { expires: { lt: dayAgo } }
    return deleteInBatches(
      deadline,
      (take) => prisma.session.findMany({ where, select: { id: true }, take }),
      (ids) => prisma.session.deleteMany({ where: { ...where, id: { in: ids } } })
    )
  })
  await run("expiredVerificationTokens", () => {
    const where = { expiresAt: { lt: now } }
    return deleteInBatches(
      deadline,
      (take) => prisma.emailVerificationToken.findMany({ where, select: { id: true }, take }),
      (ids) => prisma.emailVerificationToken.deleteMany({ where: { ...where, id: { in: ids } } })
    )
  })
  await run("expiredResetTokens", () => {
    const where = { expiresAt: { lt: now } }
    return deleteInBatches(
      deadline,
      (take) => prisma.passwordResetToken.findMany({ where, select: { id: true }, take }),
      (ids) => prisma.passwordResetToken.deleteMany({ where: { ...where, id: { in: ids } } })
    )
  })
  await run("oldRateLimits", () => {
    const where = { windowEnd: { lt: dayAgo } }
    return deleteInBatches(
      deadline,
      (take) => prisma.rateLimit.findMany({ where, select: { id: true }, take }),
      (ids) => prisma.rateLimit.deleteMany({ where: { ...where, id: { in: ids } } })
    )
  })

  // Retention cleanup only for tenants that switched it on; each run is scoped to its company
  let tenantsCleaned = 0
  try {
    const policies = await prisma.dataRetentionPolicy.findMany({
      where: { autoDeleteEnabled: true, isActive: true },
      select: { companyId: true },
    })
    for (const { companyId } of policies) {
      if (Date.now() >= deadline) break
      const result = await cleanupExpiredData(companyId)
      errors.push(...result.errors.map((message) => `retention ${companyId}: ${message}`))
      tenantsCleaned++
    }
  } catch (error) {
    errors.push(`retention: ${error instanceof Error ? error.message : "unknown error"}`)
  }

  return Response.json({
    ok: errors.length === 0,
    results,
    tenantsCleaned,
    errors,
    durationMs: Date.now() - startedAt,
  })
}
