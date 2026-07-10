#!/usr/bin/env tsx
/**
 * Password Encryption Migration Script
 * 
 * This script migrates all passwords from server-side encryption to client-side encryption.
 * 
 * IMPORTANT: 
 * - Run this script with database backups
 * - Test in a development environment first
 * - The script processes passwords in batches to avoid memory issues
 * 
 * Usage:
 *   npm run migrate-passwords
 *   or
 *   tsx scripts/migrate-passwords-to-client-encryption.ts
 */

// Load env BEFORE importing modules that read process.env (a standalone tsx
// script does not auto-load .env the way Next.js does). The crypto module is
// then imported dynamically inside main(), after env is loaded.
import { loadEnvConfig } from "@next/env"
loadEnvConfig(process.cwd())

async function main() {
  console.log("=".repeat(60))
  console.log("Password Encryption Migration Script")
  console.log("=".repeat(60))
  console.log("")
  console.log("This script will migrate all passwords from server-side encryption")
  console.log("to client-side encryption using user-specific keys.")
  console.log("")
  console.log("WARNING: Make sure you have a database backup before proceeding!")
  console.log("")

  // Ask for confirmation (in a real script, you might want to use readline)
  const args = process.argv.slice(2)
  if (!args.includes("--confirm")) {
    console.log("To run this migration, use: npm run migrate-passwords -- --confirm")
    console.log("")
    process.exit(1)
  }

  console.log("Starting migration...")
  console.log("")

  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set (checked .env / .env.local / environment).")
    process.exit(1)
  }
  if (!process.env.PASSWORD_ENCRYPTION_KEY) {
    console.error("ERROR: PASSWORD_ENCRYPTION_KEY is required.")
    process.exit(1)
  }

  // Imported after env is loaded so its module-level env reads are correct.
  const { migrateAllPasswords } = await import("../src/lib/server-crypto-migration")

  const startTime = Date.now()

  try {
    const result = await migrateAllPasswords({
      batchSize: 100,
      onProgress: (current, total) => {
        const percent = ((current / total) * 100).toFixed(1)
        process.stdout.write(`\rProgress: ${current}/${total} (${percent}%)`)
      },
    })

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log("")
    console.log("")
    console.log("=".repeat(60))
    console.log("Migration Complete")
    console.log("=".repeat(60))
    console.log(`Total passwords: ${result.total}`)
    console.log(`Successfully migrated: ${result.migrated}`)
    console.log(`Skipped (already migrated): ${result.skipped}`)
    console.log(`Failed: ${result.failed}`)
    console.log(`Duration: ${duration}s`)
    console.log("")

    if (result.errors.length > 0) {
      console.log("Errors encountered:")
      result.errors.slice(0, 10).forEach((error) => {
        console.log(`  - Password ${error.passwordId}: ${error.error}`)
      })
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more errors`)
      }
      console.log("")
    }

    if (result.failed > 0) {
      console.log("⚠️  Some passwords failed to migrate. Please review the errors above.")
      process.exit(1)
    } else {
      console.log("✅ All passwords migrated successfully!")
      process.exit(0)
    }
  } catch (error) {
    console.error("")
    console.error("❌ Migration failed with error:")
    console.error(error)
    process.exit(1)
  }
}

main()

