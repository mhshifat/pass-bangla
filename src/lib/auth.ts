import { hash, compare } from "@node-rs/bcrypt"

// Cost factor for login-password hashing. 12 is the modern baseline (≈2^12
// rounds); compare auto-detects the cost from the stored hash, so existing
// cost-10 hashes (and hashes written by bcryptjs) keep verifying and upgrade
// on next password change.
const BCRYPT_COST = 12

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST)
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  try {
    return await compare(password, hashedPassword)
  } catch {
    // A malformed stored hash must fail verification, not crash the request
    return false
  }
}
