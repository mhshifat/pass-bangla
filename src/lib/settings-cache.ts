import "server-only"

import { TRPCError } from "@trpc/server"
import prisma from "@/lib/prisma"
import type { Prisma } from "@/app/generated"

/**
 * Per-company, in-memory copy of the Settings key/value table.
 *
 * Rows with companyId NULL are platform defaults; a company's own row (tenant-scoped
 * keys only) overrides the default for that company. One query per company loads its
 * effective settings and every read for the next TTL is served from memory.
 *
 * Trade-off: the cache is per server instance. A changed setting applies immediately
 * on the instance that calls `invalidateSettingsCache()`, but can take up to
 * SETTINGS_TTL_MS to apply on other warm instances. That includes security toggles
 * (MFA enforcement, session timeout, ...). Every writer must go through
 * `writeSettings` (or call `invalidateSettingsCache()` itself).
 */

const SETTINGS_TTL_MS = 30_000
const MAX_CACHED_COMPANIES = 500
const GLOBAL_KEY = ""

type SettingValue = Prisma.JsonValue
type Snapshot = { values: Map<string, SettingValue>; at: number }

export type SettingScope = "platform" | "tenant" | "user"

/**
 * Single source of truth for who owns a setting key.
 * - platform: deployment-wide, stored with companyId NULL, written only by company-less callers
 * - user: key embeds a user id (e.g. `user.<id>.dismissedAlerts`), stored with companyId NULL
 * - tenant: everything else (SMTP, SMS, MFA, WebAuthn, session/login/password limits,
 *   IP/geo/VPN toggles, threat detection, device settings); a company row overrides the
 *   global default row
 */
// App name, theme and maintenance mode are per company: each company owns its own branding
const PLATFORM_KEY_PREFIXES = ["system."] as const
const USER_KEY_PREFIX = "user."

export function getSettingScope(key: string): SettingScope {
  if (key.startsWith(USER_KEY_PREFIX)) return "user"
  if (PLATFORM_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) return "platform"
  return "tenant"
}

const snapshots = new Map<string, Snapshot>()
const inFlight = new Map<string, Promise<Map<string, SettingValue>>>()
// Bumped on invalidation so a load that started before it cannot repopulate the cache
let generation = 0

function remember(cacheKey: string, values: Map<string, SettingValue>) {
  snapshots.delete(cacheKey)
  snapshots.set(cacheKey, { values, at: Date.now() })
  while (snapshots.size > MAX_CACHED_COMPANIES) {
    const oldest = snapshots.keys().next().value
    if (oldest === undefined) break
    snapshots.delete(oldest)
  }
}

async function loadFor(companyId: string | null): Promise<Map<string, SettingValue>> {
  const cacheKey = companyId ?? GLOBAL_KEY
  const cached = snapshots.get(cacheKey)
  if (cached && Date.now() - cached.at < SETTINGS_TTL_MS) {
    return cached.values
  }
  const pending = inFlight.get(cacheKey)
  if (pending) return pending

  const startedAt = generation
  const load = prisma.settings
    .findMany({
      where: {
        // Per-user rows are read directly by their owner and are not part of the cache
        NOT: { key: { startsWith: USER_KEY_PREFIX } },
        OR: companyId ? [{ companyId: null }, { companyId }] : [{ companyId: null }],
      },
      select: { key: true, value: true, companyId: true },
    })
    .then((rows) => {
      const values = new Map<string, SettingValue>()
      // Defaults first, then the company's own rows (tenant-scoped keys only) on top
      for (const row of rows) {
        if (row.companyId === null) values.set(row.key, row.value)
      }
      for (const row of rows) {
        if (row.companyId !== null && getSettingScope(row.key) === "tenant") values.set(row.key, row.value)
      }
      if (startedAt === generation) remember(cacheKey, values)
      return values
    })
    .finally(() => {
      if (inFlight.get(cacheKey) === load) inFlight.delete(cacheKey)
    })
  inFlight.set(cacheKey, load)
  return load
}

/**
 * Value of one setting for a company (its own row, else the global default), or
 * `undefined` when the key does not exist. Without a company, the global default.
 */
export async function getSetting<T = SettingValue>(key: string, companyId?: string | null): Promise<T | undefined> {
  const values = await loadFor(companyId ?? null)
  return values.get(key) as T | undefined
}

/** Values of several settings as a Map; keys that do not exist are absent. */
export async function getSettings(
  keys: readonly string[],
  companyId?: string | null
): Promise<Map<string, SettingValue>> {
  const values = await loadFor(companyId ?? null)
  const result = new Map<string, SettingValue>()
  for (const key of keys) {
    const value = values.get(key)
    if (value !== undefined) result.set(key, value)
  }
  return result
}

/**
 * Only the caller's own rows (no global fallback), uncached. For settings screens that
 * show secrets: a company must never be shown the platform default's credentials.
 * Without a company this returns the global rows themselves (platform administrators).
 */
export async function getOwnSettings(
  keys: readonly string[],
  companyId?: string | null
): Promise<Map<string, SettingValue>> {
  const rows = await prisma.settings.findMany({
    where: { key: { in: [...keys] }, companyId: companyId ?? null },
    select: { key: true, value: true },
  })
  return new Map(rows.map((row) => [row.key, row.value]))
}

/**
 * Drop cached copies: one company's, or everything. A write to a global row affects
 * every company's merged view, so it must invalidate without an argument.
 */
export function invalidateSettingsCache(companyId?: string | null): void {
  generation++
  if (companyId) {
    snapshots.delete(companyId)
    inFlight.delete(companyId)
    return
  }
  snapshots.clear()
  inFlight.clear()
}

/** Row to store for `key` on behalf of a caller in `callerCompanyId`; throws on a scope violation. */
function resolveWriteCompany(key: string, callerCompanyId: string | null): string | null {
  switch (getSettingScope(key)) {
    case "user":
      return null
    case "platform":
      if (callerCompanyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This setting can only be changed by a platform administrator." })
      }
      return null
    case "tenant":
      if (!callerCompanyId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A company is required to change this setting." })
      }
      return callerCompanyId
  }
}

async function upsertOne(key: string, value: Prisma.InputJsonValue, companyId: string | null) {
  if (companyId) {
    await prisma.settings.upsert({
      where: { key_companyId: { key, companyId } },
      update: { value },
      create: { key, companyId, value },
    })
    return
  }
  // Compound unique lookups cannot match a NULL companyId, so global rows are updated by hand
  const updated = await prisma.settings.updateMany({ where: { key, companyId: null }, data: { value } })
  if (updated.count > 0) return
  try {
    await prisma.settings.create({ data: { key, companyId: null, value } })
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error
    await prisma.settings.updateMany({ where: { key, companyId: null }, data: { value } })
  }
}

/**
 * Write settings for the caller's company (tenant keys) or the platform (platform keys),
 * enforcing key ownership, then invalidate the affected cache entries.
 */
export async function writeSettings(
  entries: ReadonlyArray<{ key: string; value: Prisma.InputJsonValue }>,
  callerCompanyId: string | null
): Promise<void> {
  const targets = entries.map((entry) => ({ ...entry, companyId: resolveWriteCompany(entry.key, callerCompanyId) }))
  try {
    await Promise.all(targets.map((t) => upsertOne(t.key, t.value, t.companyId)))
  } finally {
    // Global rows are part of every company's view
    if (targets.some((t) => t.companyId === null && getSettingScope(t.key) === "platform")) invalidateSettingsCache()
    else invalidateSettingsCache(callerCompanyId)
  }
}

/** Uncached read of a per-user (`user.<id>....`) row, so a just-written value is never stale. */
export async function readUserSetting<T = SettingValue>(key: string): Promise<T | undefined> {
  if (getSettingScope(key) !== "user") throw new Error(`Not a per-user setting key: ${key}`)
  const row = await prisma.settings.findFirst({ where: { key, companyId: null }, select: { value: true } })
  return (row?.value ?? undefined) as T | undefined
}
