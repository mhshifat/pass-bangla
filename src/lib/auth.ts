import bcrypt from "bcryptjs"

// Cost factor for login-password hashing. 12 is the modern baseline (≈2^12
// rounds); bcrypt.compare auto-detects the cost from the stored hash, so
// existing cost-10 hashes keep verifying and upgrade on next password change.
const BCRYPT_COST = 12

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(BCRYPT_COST)
  return bcrypt.hash(password, salt)
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}
