/**
 * Password Export Utilities
 * Supports CSV, JSON, and encrypted exports
 */

import { decrypt } from "@/lib/crypto"

export interface ExportPassword {
  name: string
  username: string
  password: string
  url?: string | null
  notes?: string | null
  folder?: string | null
  tags?: string[]
  strength?: string
  hasTotp?: boolean
  totpSecret?: string | null
  totpBackupCodes?: string[] | null
  expiresAt?: string | null
  createdAt?: string
  updatedAt?: string
}

/**
 * Export passwords to CSV format
 */
export function exportToCSV(
  passwords: ExportPassword[],
  includeHeaders: boolean = true
): string {
  const rows: string[] = []

  // Add headers
  if (includeHeaders) {
    rows.push(
      "Name,Username,Password,URL,Notes,Folder,Tags,Strength,Has TOTP,TOTP Secret,TOTP Backup Codes,Expires At,Created At,Updated At"
    )
  }

  // Add data rows
  for (const pwd of passwords) {
    const row = [
      escapeCSVField(pwd.name),
      escapeCSVField(pwd.username),
      escapeCSVField(pwd.password),
      escapeCSVField(pwd.url || ""),
      escapeCSVField(pwd.notes || ""),
      escapeCSVField(pwd.folder || ""),
      escapeCSVField((pwd.tags || []).join("; ")),
      escapeCSVField(pwd.strength || ""),
      escapeCSVField(pwd.hasTotp ? "Yes" : "No"),
      escapeCSVField(pwd.totpSecret || ""),
      escapeCSVField((pwd.totpBackupCodes || []).join(" | ")),
      escapeCSVField(pwd.expiresAt || ""),
      escapeCSVField(pwd.createdAt || ""),
      escapeCSVField(pwd.updatedAt || ""),
    ]
    rows.push(row.join(","))
  }

  return rows.join("\n")
}

/**
 * Export passwords to JSON format
 */
export function exportToJSON(
  passwords: ExportPassword[],
  pretty: boolean = false
): string {
  const data = {
    version: "1.0",
    exportDate: new Date().toISOString(),
    count: passwords.length,
    passwords: passwords,
  }

  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
}

/**
 * Export passwords to Bitwarden JSON format
 */
export function exportToBitwardenJSON(
  passwords: ExportPassword[]
): string {
  const items = passwords.map((pwd) => ({
    id: null,
    organizationId: null,
    folderId: null,
    type: 1, // Login type
    name: pwd.name,
    notes: pwd.notes || null,
    favorite: false,
    login: {
      username: pwd.username,
      password: pwd.password,
      totp: pwd.totpSecret || null,
      uris: pwd.url
        ? [
            {
              match: null,
              uri: pwd.url,
            },
          ]
        : [],
    },
    collectionIds: null,
    revisionDate: pwd.updatedAt || new Date().toISOString(),
  }))

  const data = {
    encrypted: false,
    folders: [],
    items: items,
  }

  return JSON.stringify(data, null, 2)
}

/**
 * Export passwords to LastPass CSV format
 */
export function exportToLastPassCSV(
  passwords: ExportPassword[]
): string {
  const rows: string[] = []
  rows.push("url,username,password,extra,name,grouping,fav") // LastPass CSV header

  for (const pwd of passwords) {
    // Include TOTP secret and backup codes in the extra/notes field
    let extra = pwd.notes || ""
    if (pwd.totpSecret) {
      extra += (extra ? "\n\n" : "") + `TOTP Secret: ${pwd.totpSecret}`
    }
    if (pwd.totpBackupCodes && pwd.totpBackupCodes.length > 0) {
      extra += (extra ? "\n\n" : "") + `TOTP Backup Codes:\n${pwd.totpBackupCodes.join("\n")}`
    }
    
    const row = [
      escapeCSVField(pwd.url || ""),
      escapeCSVField(pwd.username),
      escapeCSVField(pwd.password),
      escapeCSVField(extra),
      escapeCSVField(pwd.name),
      escapeCSVField(pwd.folder || ""),
      "0", // fav
    ]
    rows.push(row.join(","))
  }

  return rows.join("\n")
}

/**
 * Escape CSV field to handle commas, quotes, and newlines
 */
function escapeCSVField(field: string): string {
  if (field === null || field === undefined) {
    return ""
  }

  const str = String(field)

  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`
  }

  return str
}

/**
 * Generate encrypted export using AES encryption
 */
export async function exportToEncrypted(
  passwords: ExportPassword[],
  encryptionKey: string
): Promise<string> {
  const jsonData = exportToJSON(passwords, false)
  
  // Use the crypto library for proper encryption
  const crypto = await import("crypto")
  
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(encryptionKey, salt, 32, { N: 16384, r: 8, p: 1 })
  const iv = crypto.randomBytes(12)

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(jsonData, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return JSON.stringify({
    encrypted: true,
    version: "2.0",
    exportDate: new Date().toISOString(),
    algorithm: "aes-256-gcm",
    kdf: "scrypt",
    kdfParams: { N: 16384, r: 8, p: 1, keyLength: 32 },
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    data: encrypted.toString("hex"),
  }, null, 2)
}
