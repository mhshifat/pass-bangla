#!/usr/bin/env tsx
/**
 * At-rest encryption backfill: re-encrypt every legacy password/TOTP ciphertext
 * to the hardened v2 scheme (AES-256-GCM, key = master secret + owner id).
 *
 * This completes the C1/H2 remediation. New/edited passwords already write v2
 * automatically; this backfill upgrades the EXISTING rows in one pass.
 *
 * SAFETY — read before running:
 *  1. Take a DATABASE BACKUP.
 *  2. Ensure PASSWORD_ENCRYPTION_KEY is set (required) and BACKED UP — if it is
 *     lost, v2 data is unrecoverable.
 *  3. Run the DRY RUN first (default) and review the counts.
 *  4. Run against STAGING before production.
 *
 * The backfill is idempotent and non-destructive: rows already on v2 are
 * skipped, and any row whose plaintext can't be recovered is skipped + reported
 * (never overwritten).
 *
 * Usage:
 *   npm run backfill-encryption               # DRY RUN (no writes)
 *   npm run backfill-encryption -- --apply    # actually write
 */

// Load .env / .env.local BEFORE anything that reads process.env. A standalone
// tsx script does NOT auto-load env files the way Next.js does, so we do it
// explicitly (matching Next's loading + precedence), then dynamically import the
// crypto module so its env reads see the loaded values.
import { loadEnvConfig } from "@next/env"
loadEnvConfig(process.cwd())

async function main() {
  // Detect "apply" across the ways npm/tsx may (or may not) forward the flag:
  //  - `-- --apply`      → process.argv
  //  - `--apply`         → npm sets npm_config_apply
  //  - `APPLY=1 npm ...` → env var (most reliable)
  const apply =
    process.argv.includes("--apply") ||
    process.env.APPLY === "1" ||
    process.env.npm_config_apply === "true"

  console.log("=".repeat(64))
  console.log("At-rest encryption backfill  (legacy -> v2 / AES-256-GCM)")
  console.log(
    apply
      ? "MODE: APPLY — changes WILL be written"
      : "MODE: DRY RUN — no writes. To write, run:  APPLY=1 npm run backfill-encryption"
  )
  if (!apply) {
    const received = process.argv.slice(2).join(" ") || "(none)"
    console.log(`(diagnostic — script received args: ${received})`)
  }
  console.log("Preconditions: DB backup taken, PASSWORD_ENCRYPTION_KEY set & backed up.")
  console.log("=".repeat(64))

  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set (checked .env / .env.local / environment).")
    process.exit(1)
  }
  if (!process.env.PASSWORD_ENCRYPTION_KEY) {
    console.error("ERROR: PASSWORD_ENCRYPTION_KEY is required (checked .env / environment).")
    process.exit(1)
  }

  // Imported AFTER env is loaded so its module-level env reads are correct.
  const { backfillStorageEncryptionV2 } = await import("../src/lib/server-crypto-migration")
  const stats = await backfillStorageEncryptionV2({ dryRun: !apply })

  console.log("\nResult:")
  console.log(`  scanned       : ${stats.scanned}`)
  console.log(`  already v2    : ${stats.alreadyV2}`)
  console.log(`  ${apply ? "migrated     " : "would migrate"} : ${stats.migrated}`)
  console.log(`  skipped       : ${stats.skipped}`)

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
  console.error("Backfill failed:", err)
  process.exit(1)
})
