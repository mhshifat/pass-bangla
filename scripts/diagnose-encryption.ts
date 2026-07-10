#!/usr/bin/env tsx
/**
 * At-rest encryption DIAGNOSTIC (read-only, no writes).
 *
 * Answers: how many password rows are legacy vs v2, and can the CURRENTLY
 * configured key(s) actually decrypt the v2 rows? Also prints a non-secret
 * FINGERPRINT of every configured master key so you can compare the key loaded
 * here against the key your prod SERVER runtime uses — the usual cause of
 * "Failed to decrypt password" is that the two are different bytes even though
 * they look the same.
 *
 * Nothing is written. Safe to run against production.
 *
 * Usage:
 *   npm run diagnose-encryption
 *
 * To test a specific old key value as a candidate without touching prod env,
 * pass it as a fallback:
 *   PASSWORD_ENCRYPTION_KEY_FALLBACKS="old-key-value" npm run diagnose-encryption
 */

import { loadEnvConfig } from "@next/env"
loadEnvConfig(process.cwd())

import crypto from "crypto"

function fingerprint(secret: string): string {
  const hash = crypto.createHash("sha256").update(secret, "utf8").digest("hex").slice(0, 12)
  return `len=${secret.length} sha256[0:12]=${hash}`
}

function redactDbHost(url: string | undefined): string {
  if (!url) return "(unset)"
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.hostname}:${u.port || "(default)"}/${u.pathname.replace(/^\//, "")}`
  } catch {
    return "(unparseable)"
  }
}

async function main() {
  console.log("=".repeat(70))
  console.log("At-rest encryption diagnostic (READ-ONLY — no changes are written)")
  console.log("=".repeat(70))

  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set (checked .env / .env.local / environment).")
    process.exit(1)
  }
  console.log(`DB target      : ${redactDbHost(process.env.DATABASE_URL)}`)

  const primary = process.env.PASSWORD_ENCRYPTION_KEY?.trim()
  if (!primary) {
    console.error("ERROR: PASSWORD_ENCRYPTION_KEY is not set.")
    process.exit(1)
  }
  console.log(`primary key    : ${fingerprint(primary)}`)

  const fallbacksRaw = process.env.PASSWORD_ENCRYPTION_KEY_FALLBACKS?.trim()
  const fallbacks = fallbacksRaw
    ? fallbacksRaw.split(/[,\n]/).map((k) => k.trim()).filter(Boolean)
    : []
  if (fallbacks.length) {
    fallbacks.forEach((k, i) => console.log(`fallback key ${i + 1} : ${fingerprint(k)}`))
  } else {
    console.log(`fallback keys  : (none — PASSWORD_ENCRYPTION_KEY_FALLBACKS unset)`)
  }
  console.log("-".repeat(70))

  // Import AFTER env is loaded so module-level reads are correct.
  const { decryptFromStorage } = await import("../src/lib/server-crypto-migration")
  const { PrismaClient } = await import("../src/app/generated")
  const { PrismaPg } = await import("@prisma/adapter-pg")
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter })

  const stats = {
    scanned: 0,
    legacy: 0,
    v2: 0,
    v2_ok: 0,
    v2_fail: 0,
    other: 0,
  }
  const failedIds: string[] = []

  let cursor: string | undefined
  for (;;) {
    const rows: Array<{ id: string; password: string; ownerId: string }> =
      await prisma.password.findMany({
        take: 200,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
        select: { id: true, password: true, ownerId: true },
      })
    if (rows.length === 0) break
    cursor = rows[rows.length - 1]!.id

    for (const row of rows) {
      stats.scanned++
      const parts = row.password.split(":")
      const isV2 = parts.length === 4 && parts[0] === "v2"
      const isLegacy = parts.length === 2
      if (isV2) {
        stats.v2++
        try {
          decryptFromStorage(row.password, row.ownerId)
          stats.v2_ok++
        } catch {
          stats.v2_fail++
          if (failedIds.length < 50) failedIds.push(row.id)
        }
      } else if (isLegacy) {
        stats.legacy++
      } else {
        stats.other++
      }
    }
  }

  console.log("\nRow summary:")
  console.log(`  total passwords        : ${stats.scanned}`)
  console.log(`  legacy (iv:ct, CBC)    : ${stats.legacy}   ← readable, unaffected`)
  console.log(`  v2 (GCM, master key)   : ${stats.v2}`)
  console.log(`     ├─ decrypt OK       : ${stats.v2_ok}`)
  console.log(`     └─ decrypt FAILED   : ${stats.v2_fail}   ← the broken ones`)
  if (stats.other) console.log(`  unrecognized format    : ${stats.other}`)

  if (stats.v2_fail > 0) {
    console.log("\nDiagnosis: v2 rows exist that NONE of the configured key(s) can decrypt.")
    console.log("Almost always this means the key that WROTE these rows differs from the")
    console.log("key loaded here. Recover by adding the writing key's value to")
    console.log("PASSWORD_ENCRYPTION_KEY_FALLBACKS (on the PROD server), then re-run this")
    console.log("diagnostic — the failed count should drop to 0. Then run the backfill to")
    console.log("re-key everything onto the primary key.")
    console.log("\nFirst failing ids:")
    console.log("  " + failedIds.join("\n  "))
  } else if (stats.v2 > 0) {
    console.log("\nAll v2 rows decrypt cleanly with the configured key(s). ✓")
  } else {
    console.log("\nNo v2 rows found — all data is still legacy CBC.")
  }

  await prisma.$disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error("Diagnostic failed:", err)
  process.exit(1)
})
