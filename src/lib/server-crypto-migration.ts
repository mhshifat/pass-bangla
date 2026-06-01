/**
 * Server-Side Crypto Migration Utilities
 * 
 * This module provides utilities for migrating passwords from server-side
 * encryption to client-side encryption using user-specific keys.
 * 
 * IMPORTANT: This migration should be run carefully and with backups.
 */

import crypto from "crypto"
import type { PrismaClient as GeneratedPrismaClient } from "@/app/generated"
import type { PrismaClient as StandardPrismaClient } from "@/app/generated"

type PrismaClientLike = GeneratedPrismaClient | StandardPrismaClient

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

// Create a standalone Prisma client for migration scripts
// This avoids the "server-only" import issue when running outside Next.js
let prismaInstance: PrismaClientLike | null = null

async function getPrisma(): Promise<PrismaClientLike> {
  if (!prismaInstance) {
    // Always create a new Prisma instance for migration scripts
    // This avoids server-only import issues
    try {
      // Try to use the generated PrismaClient first
      const { PrismaClient } = await import("@/app/generated")
      const { PrismaPg } = await import("@prisma/adapter-pg")
      
      if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL environment variable is not set")
      }
      
      const adapter = new PrismaPg({
        connectionString: process.env.DATABASE_URL,
      })
      
      prismaInstance = new PrismaClient({
        adapter,
      })
    } catch (error: unknown) {
      // Fallback to standard @prisma/client if generated client fails
      const errorCode = isRecord(error) && typeof error.code === "string" ? error.code : undefined
      const errorMessage = error instanceof Error ? error.message : ""
      if (errorCode === "MODULE_NOT_FOUND" || errorMessage.includes("Cannot find module")) {
        const { PrismaClient } = await import("@/app/generated")
        const { PrismaPg } = await import("@prisma/adapter-pg")
        
        if (!process.env.DATABASE_URL) {
          throw new Error("DATABASE_URL environment variable is not set")
        }
        
        const adapter = new PrismaPg({
          connectionString: process.env.DATABASE_URL,
        })
        
        prismaInstance = new PrismaClient({
          adapter,
        })
      } else {
        throw error
      }
    }
  }
  return prismaInstance
}

// Lazy-load prisma to avoid import issues
async function getPrismaClient() {
  return await getPrisma()
}

// Import crypto functions directly to avoid key validation during migration
// We'll implement the decryption inline to avoid importing the full crypto module
// This allows the migration to run even if EMAIL_ENCRYPTION_KEY is not set correctly
const PASSWORD_ENCRYPTION_KEY_RAW = process.env.PASSWORD_ENCRYPTION_KEY || "default_dev_key_32bytes_long!!"

// Warn if PASSWORD_ENCRYPTION_KEY is not set or wrong length (but don't fail)
if (!process.env.PASSWORD_ENCRYPTION_KEY || PASSWORD_ENCRYPTION_KEY_RAW.length !== 32) {
  console.warn(
    `WARNING: PASSWORD_ENCRYPTION_KEY is ${PASSWORD_ENCRYPTION_KEY_RAW.length} characters (expected 32). ` +
    `Migration may fail to decrypt existing passwords. Set PASSWORD_ENCRYPTION_KEY in your .env file.`
  )
}

// Derive key for old encryption method (server-side)
function deriveOldEncryptionKey(): Buffer {
  const KEY_DERIVATION_ITERATIONS = 100000
  const KEY_LENGTH = 32
  return crypto.pbkdf2Sync(PASSWORD_ENCRYPTION_KEY_RAW, "password_encryption_salt", KEY_DERIVATION_ITERATIONS, KEY_LENGTH, "sha256")
}

// Decrypt using old server-side method
function decryptPasswordOld(encryptedPassword: string): string {
  const key = deriveOldEncryptionKey()
  const textParts = encryptedPassword.split(":")
  if (textParts.length !== 2) {
    throw new Error("Invalid encrypted password format")
  }
  const iv = Buffer.from(textParts[0]!, "hex")
  const encryptedText = Buffer.from(textParts[1]!, "hex")
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv)
  let decrypted = decipher.update(encryptedText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString("utf8")
}

const KEY_DERIVATION_ITERATIONS = 100000
const KEY_LENGTH = 32 // 256 bits
const IV_LENGTH = 16 // AES block size

/**
 * Derive a user-specific encryption key from user ID
 * This matches the client-side key derivation
 * 
 * IMPORTANT: This uses userId as the key material with a consistent salt.
 * In production, you might want to combine with a master key for additional security.
 * The client-side code must use the same derivation method.
 */
function deriveUserEncryptionKey(userId: string, salt: string = "password_encryption_salt"): Buffer {
  // Use userId as key material (matches client-side derivation)
  // For additional security, you could combine with PASSWORD_ENCRYPTION_KEY,
  // but then the client would need access to it too
  const keyMaterial = userId
  
  return crypto.pbkdf2Sync(keyMaterial, salt, KEY_DERIVATION_ITERATIONS, KEY_LENGTH, "sha256")
}

/**
 * Derive encryption key from share token for temporary shares
 * Uses only the share token (client can decrypt without master key)
 */
export function deriveShareTokenEncryptionKey(shareToken: string, salt: string = "temporary_share_encryption_salt"): Buffer {
  // Use share token as key material (client has access to share token)
  // This provides encryption in transit while allowing client-side decryption
  const keyMaterial = shareToken
  
  return crypto.pbkdf2Sync(keyMaterial, salt, KEY_DERIVATION_ITERATIONS, KEY_LENGTH, "sha256")
}

/**
 * Encrypt data using share token as key (for temporary shares)
 */
export function encryptWithShareToken(plainData: string, shareToken: string): string {
  const key = deriveShareTokenEncryptionKey(shareToken)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv)
  let encrypted = cipher.update(plainData, "utf8")
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return iv.toString("hex") + ":" + encrypted.toString("hex")
}

/**
 * Decrypt data using share token as key (for temporary shares)
 */
export function decryptWithShareToken(encryptedData: string, shareToken: string): string {
  const key = deriveShareTokenEncryptionKey(shareToken)
  const textParts = encryptedData.split(":")
  if (textParts.length !== 2) {
    throw new Error("Invalid encrypted data format")
  }
  const iv = Buffer.from(textParts[0]!, "hex")
  const encryptedText = Buffer.from(textParts[1]!, "hex")
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv)
  let decrypted = decipher.update(encryptedText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString("utf8")
}

/**
 * Encrypt password using user-specific key
 */
export function encryptPasswordWithUserKey(plainPassword: string, userId: string): string {
  const key = deriveUserEncryptionKey(userId)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv)
  let encrypted = cipher.update(plainPassword, "utf8")
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return iv.toString("hex") + ":" + encrypted.toString("hex")
}

/**
 * Decrypt password using user-specific key
 */
export function decryptPasswordWithUserKey(encryptedPassword: string, userId: string): string {
  const key = deriveUserEncryptionKey(userId)
  const textParts = encryptedPassword.split(":")
  if (textParts.length !== 2) {
    throw new Error("Invalid encrypted password format")
  }
  const iv = Buffer.from(textParts[0]!, "hex")
  const encryptedText = Buffer.from(textParts[1]!, "hex")
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv)
  let decrypted = decipher.update(encryptedText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString("utf8")
}

/**
 * Check if a password is encrypted with the old server-side key
 * by attempting to decrypt it with the old method
 */
function isOldEncryption(encryptedPassword: string): boolean {
  try {
    // Try to decrypt with old method - if it works, it's old encryption
    decryptPasswordOld(encryptedPassword)
    return true
  } catch {
    // If decryption fails, it might be new encryption or corrupted
    // We'll assume it's new encryption if format is valid
    return encryptedPassword.includes(":") && encryptedPassword.split(":").length === 2
  }
}

/**
 * Migrate a single password from old encryption to new user-specific encryption
 */
export async function migratePassword(passwordId: string): Promise<{
  success: boolean
  error?: string
  passwordId: string
}> {
  try {
    const prisma = await getPrismaClient()
    
    // Get password from database
    const password = await prisma.password.findUnique({
      where: { id: passwordId },
      select: {
        id: true,
        password: true,
        totpSecret: true,
        ownerId: true,
      },
    })

    if (!password) {
      return {
        success: false,
        error: "Password not found",
        passwordId,
      }
    }

    // Check if already migrated by trying to decrypt with new method first
    let needsMigration = true
    try {
      // Try decrypting with new method first - if it works, already migrated
      decryptPasswordWithUserKey(password.password, password.ownerId)
      // Successfully decrypted with new method - already migrated
      return {
        success: true,
        passwordId,
      }
    } catch {
      // Can't decrypt with new method - try old method
      try {
        // Try decrypting with old method - if it works, needs migration
        decryptPasswordOld(password.password)
        needsMigration = true
      } catch {
        // Can't decrypt with either method - might be corrupted
        return {
          success: false,
          error: "Password cannot be decrypted with either method. It may be corrupted.",
          passwordId,
        }
      }
    }

    // Decrypt with old method
    const plainPassword = decryptPasswordOld(password.password)
    let plainTotpSecret: string | null = null
    if (password.totpSecret) {
      try {
        plainTotpSecret = decryptPasswordOld(password.totpSecret)
      } catch (error) {
        console.error(`Failed to decrypt TOTP secret for password ${passwordId}:`, error)
        // Continue without TOTP secret
      }
    }

    // Re-encrypt with new user-specific key
    const newEncryptedPassword = encryptPasswordWithUserKey(plainPassword, password.ownerId)
    const newEncryptedTotpSecret = plainTotpSecret
      ? encryptPasswordWithUserKey(plainTotpSecret, password.ownerId)
      : null

    // Update in database
    await prisma.password.update({
      where: { id: passwordId },
      data: {
        password: newEncryptedPassword,
        totpSecret: newEncryptedTotpSecret,
      },
    })

    return {
      success: true,
      passwordId,
    }
  } catch (error) {
    console.error(`Error migrating password ${passwordId}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      passwordId,
    }
  }
}

/**
 * Migrate all passwords for a specific user
 */
export async function migrateUserPasswords(userId: string): Promise<{
  total: number
  migrated: number
  failed: number
  errors: Array<{ passwordId: string; error: string }>
}> {
  const prisma = await getPrismaClient()
  
  const passwords = await prisma.password.findMany({
    where: { ownerId: userId },
    select: { id: true },
  })

  const results = await Promise.all(
    passwords.map((pwd: { id: string }) => migratePassword(pwd.id))
  )

  const migrated = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length
  const errors = results
    .filter((r) => !r.success && r.error)
    .map((r) => ({ passwordId: r.passwordId, error: r.error! }))

  return {
    total: passwords.length,
    migrated,
    failed,
    errors,
  }
}

/**
 * Migrate all passwords in the database
 * 
 * WARNING: This should be run carefully with database backups
 * NOTE: This function intentionally queries ALL passwords across ALL companies
 * as it's a one-time migration script. This is expected behavior for migrations.
 */
export async function migrateAllPasswords(options: {
  batchSize?: number
  onProgress?: (current: number, total: number) => void
} = {}): Promise<{
  total: number
  migrated: number
  failed: number
  skipped: number
  errors: Array<{ passwordId: string; error: string }>
}> {
  const batchSize = options.batchSize || 100
  const prisma = await getPrismaClient()

  // Get total count
  // NOTE: Intentionally queries all passwords - this is a migration script
  const total = await prisma.password.count()

  let migrated = 0
  let failed = 0
  let skipped = 0
  const errors: Array<{ passwordId: string; error: string }> = []

  // Process in batches
  // NOTE: Intentionally queries all passwords - this is a migration script
  let offset = 0
  while (offset < total) {
    const passwords = await prisma.password.findMany({
      take: batchSize,
      skip: offset,
      select: { id: true },
      orderBy: { createdAt: "asc" },
    })

    const results = await Promise.all(
      passwords.map((pwd: { id: string }) => migratePassword(pwd.id))
    )

    for (const result of results) {
      if (result.success) {
        migrated++
      } else if (result.error?.includes("already")) {
        skipped++
      } else {
        failed++
        if (result.error) {
          errors.push({ passwordId: result.passwordId, error: result.error })
        }
      }
    }

    offset += batchSize
    if (options.onProgress) {
      options.onProgress(Math.min(offset, total), total)
    }
  }

  return {
    total,
    migrated,
    failed,
    skipped,
    errors,
  }
}

