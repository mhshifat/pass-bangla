import "server-only"

import prisma from "@/lib/prisma"

/**
 * userId → companyId lookup with a short in-memory cache.
 *
 * The tRPC context already loads the acting user on every request and records
 * the result here, so follow-up lookups in the same request (audit logs,
 * policy checks, …) don't hit the database again.
 */

const TTL_MS = 60_000
const MAX_ENTRIES = 5_000

const cache = new Map<string, { companyId: string | null; at: number }>()

export function rememberUserCompany(userId: string, companyId: string | null): void {
  if (cache.size >= MAX_ENTRIES) cache.clear()
  cache.set(userId, { companyId, at: Date.now() })
}

export async function getUserCompanyId(userId: string): Promise<string | null> {
  const cached = cache.get(userId)
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.companyId
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  })
  const companyId = user?.companyId || null
  // Only cache users that exist, so a freshly created account is picked up immediately
  if (user) rememberUserCompany(userId, companyId)
  return companyId
}
