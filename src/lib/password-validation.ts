import { getSettings } from "@/lib/settings-cache"

const POLICY_KEYS = [
  "security.password.min_length",
  "security.password.require_uppercase",
  "security.password.require_lowercase",
  "security.password.require_numbers",
  "security.password.require_special",
] as const

export interface PasswordPolicy {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumbers: boolean
  requireSpecial: boolean
}

export interface PasswordValidationResult {
  isValid: boolean
  errors: string[]
}

/**
 * Validates a password against the configured security policies
 */
export async function validatePassword(password: string, companyId?: string | null): Promise<PasswordValidationResult> {
  const errors: string[] = []

  // Get password policies from settings
  const config: Record<string, unknown> = Object.fromEntries(await getSettings(POLICY_KEYS, companyId))

  const policy: PasswordPolicy = {
    minLength: (config["security.password.min_length"] as number) ?? 12,
    requireUppercase: (config["security.password.require_uppercase"] as boolean) ?? true,
    requireLowercase: (config["security.password.require_lowercase"] as boolean) ?? true,
    requireNumbers: (config["security.password.require_numbers"] as boolean) ?? true,
    requireSpecial: (config["security.password.require_special"] as boolean) ?? true,
  }

  // Validate minimum length
  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters long`)
  }

  // Validate uppercase requirement
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter (A-Z)")
  }

  // Validate lowercase requirement
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter (a-z)")
  }

  // Validate numbers requirement
  if (policy.requireNumbers && !/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number (0-9)")
  }

  // Validate special characters requirement
  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
    errors.push("Password must contain at least one special character (!@#$%...)")
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Gets the current password policy (for client-side validation hints)
 */
export async function getPasswordPolicy(companyId?: string | null): Promise<PasswordPolicy> {
  const config: Record<string, unknown> = Object.fromEntries(await getSettings(POLICY_KEYS, companyId))

  return {
    minLength: (config["security.password.min_length"] as number) ?? 12,
    requireUppercase: (config["security.password.require_uppercase"] as boolean) ?? true,
    requireLowercase: (config["security.password.require_lowercase"] as boolean) ?? true,
    requireNumbers: (config["security.password.require_numbers"] as boolean) ?? true,
    requireSpecial: (config["security.password.require_special"] as boolean) ?? true,
  }
}
