import prisma from "@/lib/prisma"
import { getSettings } from "@/lib/settings-cache"

/**
 * Helper to check if MFA should be enforced for a user
 * Considers both user-specific settings and global enforcement policies
 */
export async function shouldEnforceMfa(
  userId: string,
  userRole: string,
  userMfaEnabled: boolean,
  companyId?: string | null
): Promise<boolean> {
  // If user has explicitly enabled MFA, enforce it
  if (userMfaEnabled) {
    return true
  }

  // Enforcement is per company; resolve the user's company when the caller did not
  const resolvedCompanyId =
    companyId !== undefined
      ? companyId
      : (await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } }))?.companyId ?? null
  const settingsMap = await getSettings(["mfa.enforce_all_users", "mfa.enforce_admins"], resolvedCompanyId)
  const enforceAllUsers = settingsMap.get("mfa.enforce_all_users") === true
  const enforceAdmins = settingsMap.get("mfa.enforce_admins") === true

  // If enforce all users is enabled, require MFA for everyone
  if (enforceAllUsers) {
    return true
  }

  // If enforce admins is enabled, require MFA for admin roles
  if (enforceAdmins) {
    const adminRoles = ["SUPER_ADMIN", "ADMIN", "MANAGER"]
    if (adminRoles.includes(userRole)) {
      return true
    }
  }

  // No enforcement required
  return false
}

/**
 * Helper to determine MFA setup requirement for a user
 */
export async function determineMfaRequirement(
  userId: string,
  userRole: string,
  userMfaEnabled: boolean,
  hasMfaMethod: boolean,
  companyId?: string | null
): Promise<{ mfaRequired: boolean; mfaSetupRequired: boolean }> {
  // Check if MFA should be enforced
  const enforceMfa = await shouldEnforceMfa(userId, userRole, userMfaEnabled, companyId)

  if (!enforceMfa) {
    // MFA not enforced, no requirement
    return { mfaRequired: false, mfaSetupRequired: false }
  }

  // MFA is enforced
  if (hasMfaMethod) {
    // User has MFA configured, require verification
    return { mfaRequired: true, mfaSetupRequired: false }
  } else {
    // User doesn't have MFA configured, require setup
    return { mfaRequired: false, mfaSetupRequired: true }
  }
}

