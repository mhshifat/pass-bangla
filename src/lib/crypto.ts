import crypto from "crypto"

// Separate encryption keys for different purposes
const EMAIL_ENCRYPTION_KEY_RAW = process.env.EMAIL_ENCRYPTION_KEY || "default_dev_key_32bytes_long!!"
const PASSWORD_ENCRYPTION_KEY_RAW = process.env.PASSWORD_ENCRYPTION_KEY || EMAIL_ENCRYPTION_KEY_RAW

// Security: Prevent use of default keys in production
if (process.env.NODE_ENV === "production") {
  if (EMAIL_ENCRYPTION_KEY_RAW === "default_dev_key_32bytes_long!!") {
    throw new Error(
      "SECURITY ERROR: EMAIL_ENCRYPTION_KEY must be set to a secure value in production. " +
      "The default key is only for development. Generate a strong 32-character key and set it in your environment variables."
    )
  }
  if (PASSWORD_ENCRYPTION_KEY_RAW === "default_dev_key_32bytes_long!!") {
    throw new Error(
      "SECURITY ERROR: PASSWORD_ENCRYPTION_KEY must be set to a secure value in production. " +
      "The default key is only for development. Generate a strong 32-character key and set it in your environment variables."
    )
  }
}

// Validate key lengths
if (EMAIL_ENCRYPTION_KEY_RAW.length !== 32) {
  throw new Error(
    `EMAIL_ENCRYPTION_KEY must be exactly 32 characters (got ${EMAIL_ENCRYPTION_KEY_RAW.length}). Set it in your .env file. Example: EMAIL_ENCRYPTION_KEY=12345678901234567890123456789012`
  )
}

if (PASSWORD_ENCRYPTION_KEY_RAW.length !== 32) {
  throw new Error(
    `PASSWORD_ENCRYPTION_KEY must be exactly 32 characters (got ${PASSWORD_ENCRYPTION_KEY_RAW.length}). Set it in your .env file. Example: PASSWORD_ENCRYPTION_KEY=12345678901234567890123456789012`
  )
}

// Derive proper 256-bit keys using PBKDF2 for better security
const KEY_DERIVATION_ITERATIONS = 100000
const KEY_LENGTH = 32 // 256 bits

function deriveKey(rawKey: string, salt: string = "default_salt_change_in_production"): Buffer {
  return crypto.pbkdf2Sync(rawKey, salt, KEY_DERIVATION_ITERATIONS, KEY_LENGTH, "sha256")
}

// Derived on first use rather than at module load, so importing this module
// does not cost two 100,000-iteration PBKDF2 runs on every cold start.
let emailEncryptionKey: Buffer | null = null
let passwordEncryptionKey: Buffer | null = null

function getEmailEncryptionKey(): Buffer {
  return (emailEncryptionKey ??= deriveKey(EMAIL_ENCRYPTION_KEY_RAW, "email_encryption_salt"))
}

function getPasswordEncryptionKey(): Buffer {
  return (passwordEncryptionKey ??= deriveKey(PASSWORD_ENCRYPTION_KEY_RAW, "password_encryption_salt"))
}

const IV_LENGTH = 16 // AES block size

/**
 * Encrypt text using the email encryption key
 * Used for email settings and other non-sensitive data
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv("aes-256-cbc", getEmailEncryptionKey(), iv)
  let encrypted = cipher.update(text, "utf8")
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return iv.toString("hex") + ":" + encrypted.toString("hex")
}

/**
 * Decrypt text using the email encryption key
 */
export function decrypt(text: string): string {
  const textParts = text.split(":")
  if (textParts.length !== 2) {
    throw new Error("Invalid encrypted text format")
  }
  const iv = Buffer.from(textParts[0]!, "hex")
  const encryptedText = Buffer.from(textParts[1]!, "hex")
  const decipher = crypto.createDecipheriv("aes-256-cbc", getEmailEncryptionKey(), iv)
  let decrypted = decipher.update(encryptedText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString("utf8")
}

/**
 * Encrypt password using the password encryption key
 * This uses a separate key for better security isolation
 */
export function encryptPassword(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv("aes-256-cbc", getPasswordEncryptionKey(), iv)
  let encrypted = cipher.update(text, "utf8")
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return iv.toString("hex") + ":" + encrypted.toString("hex")
}

/**
 * Decrypt password using the password encryption key
 */
export function decryptPassword(text: string): string {
  const textParts = text.split(":")
  if (textParts.length !== 2) {
    throw new Error("Invalid encrypted password format")
  }
  const iv = Buffer.from(textParts[0]!, "hex")
  const encryptedText = Buffer.from(textParts[1]!, "hex")
  const decipher = crypto.createDecipheriv("aes-256-cbc", getPasswordEncryptionKey(), iv)
  let decrypted = decipher.update(encryptedText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString("utf8")
}
