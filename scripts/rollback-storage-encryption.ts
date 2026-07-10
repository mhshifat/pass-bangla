#!/usr/bin/env tsx
/**
 * EMERGENCY ROLLBACK for the at-rest encryption backfill.
 *
 * Re-encrypts hardened v2 (AES-256-GCM) ciphertext BACK to the legacy userId
 * scheme. Use ONLY if a backfill on STAGING goes wrong and you need to revert.
 *
 * ⚠️ WARNING: this RE-INTRODUCES the weak C1 key derivation (key derived from the
 * public userId). Never leave production data rolled back — it is a safety valve
 * for the staging run, not an end state.
 *
 * SAFETY:
 *  - Take a DATABASE BACKUP first.
 *  - Idempotent (rows already legacy are skipped) and non-destructive
 *    (undecryptable rows are skipped + reported, never overwritten).
 *  - Dry run by default; add `-- --apply` to write.
 *
 * Usage:
 *   npm run rollback-encryption               # DRY RUN (no writes)
 *   npm run rollback-encryption -- --apply    # actually write
 */

// Load env BEFORE importing modules that read process.env (see backfill script).
import { loadEnvConfig } from "@next/env"
loadEnvConfig(process.cwd())

async function main() {
  const apply =
    process.argv.includes("--apply") ||
    process.env.APPLY === "1" ||
    process.env.npm_config_apply === "true"

  console.log("=".repeat(64))
  console.log("At-rest encryption ROLLBACK  (v2 -> legacy)  ⚠️  RE-WEAKENS KEYS")
  console.log(
    apply
      ? "MODE: APPLY — changes WILL be written"
      : "MODE: DRY RUN — no writes. To write, run:  APPLY=1 npm run rollback-encryption"
  )
  console.log("=".repeat(64))

  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set (checked .env / .env.local / environment).")
    process.exit(1)
  }
  if (!process.env.PASSWORD_ENCRYPTION_KEY) {
    console.error("ERROR: PASSWORD_ENCRYPTION_KEY is required to decrypt v2 data.")
    process.exit(1)
  }

  const { rollbackStorageEncryptionV2 } = await import("../src/lib/server-crypto-migration")
  const stats = await rollbackStorageEncryptionV2({ dryRun: !apply })

  console.log("\nResult:")
  console.log(`  scanned        : ${stats.scanned}`)
  console.log(`  already legacy : ${stats.alreadyLegacy}`)
  console.log(`  ${apply ? "rolled back   " : "would roll back"} : ${stats.rolledBack}`)
  console.log(`  skipped        : ${stats.skipped}`)

  if (stats.errors.length > 0) {
    console.warn(`\n${stats.errors.length} row(s) skipped (undecryptable) — review:`)
    for (const e of stats.errors.slice(0, 50)) {
      console.warn(`  - ${e.id}: ${e.reason}`)
    }
    if (stats.errors.length > 50) {
      console.warn(`  …and ${stats.errors.length - 50} more.`)
    }
  }

  console.log(apply ? "\nDone." : "\nDry run complete — no changes made.")
  process.exit(0)
}

main().catch((err) => {
  console.error("Rollback failed:", err)
  process.exit(1)
})
