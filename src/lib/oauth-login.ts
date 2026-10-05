import "server-only"

import prisma from "@/lib/prisma"
import { createSession } from "@/lib/session"
import { createAuditLog } from "@/lib/audit-log"
import { getSetting } from "@/lib/settings-cache"
import type { OAuthProvider } from "@/lib/oauth"

export type OAuthLoginError = "inactive" | "blocked_ip" | "blocked_location"

interface OAuthLoginUser {
  id: string
  email: string
  role: string
  isActive: boolean
  companyId: string | null
  emailVerified: Date | null
  mfaEnabled: boolean
  mfaMethod: string | null
  mfaSecret: string | null
  phoneNumber: string | null
}

/**
 * Starts a session for a user the provider has already authenticated.
 * Applies the same access rules as a password login (IP allow-list, geographic
 * restrictions, MFA) — the provider replaces the password, not the second factor.
 */
export async function completeOAuthLogin(
  user: OAuthLoginUser,
  provider: OAuthProvider,
  { ipAddress, userAgent }: { ipAddress: string | null; userAgent: string | null }
): Promise<{ ok: true } | { ok: false; error: OAuthLoginError }> {
  if (!user.isActive) {
    return { ok: false, error: "inactive" }
  }

  if (ipAddress) {
    const { isIpWhitelisted, checkGeographicRestriction } = await import("@/lib/ip-whitelist")

    const ipCheck = await isIpWhitelisted(ipAddress, user.id, user.companyId || undefined)
    if (!ipCheck.allowed) {
      await createAuditLog({
        action: "LOGIN_BLOCKED_IP",
        resource: "User",
        resourceId: user.id,
        userId: user.id,
        ipAddress,
        userAgent,
        status: "BLOCKED",
        details: { reason: ipCheck.reason, provider },
      })
      return { ok: false, error: "blocked_ip" }
    }

    const geoCheck = await checkGeographicRestriction(ipAddress, user.id, user.companyId || undefined)
    if (!geoCheck.allowed) {
      await createAuditLog({
        action: "LOGIN_BLOCKED_GEO",
        resource: "User",
        resourceId: user.id,
        userId: user.id,
        ipAddress,
        userAgent,
        status: "BLOCKED",
        details: { reason: geoCheck.reason, countryCode: geoCheck.countryCode, provider },
      })
      return { ok: false, error: "blocked_location" }
    }
  }

  // The provider only releases verified addresses, so the email is proven
  if (!user.emailVerified) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } })
  }

  const hasMfaMethod =
    (user.mfaMethod === "TOTP" && user.mfaSecret !== null) ||
    (user.mfaMethod === "SMS" && user.phoneNumber !== null) ||
    (user.mfaMethod === "EMAIL" && user.email !== null) ||
    (user.mfaMethod === "WEBAUTHN" && (await prisma.mfaCredential.count({ where: { userId: user.id } })) > 0)

  // MFA decision, in the same order as the password login
  let mfa: "none" | "verify" | "setup" = "none"
  if (user.mfaEnabled) {
    mfa = hasMfaMethod ? "verify" : "setup"
  } else {
    const { generateClientDeviceFingerprint, isDeviceTrusted } = await import("@/lib/device-fingerprint")
    const deviceIsTrusted = await isDeviceTrusted(generateClientDeviceFingerprint(userAgent, ipAddress), user.id)
    const requireMfaForUntrustedDevices = await getSetting("security.device.require_mfa_untrusted")

    if (requireMfaForUntrustedDevices === true && !deviceIsTrusted) {
      mfa = hasMfaMethod ? "verify" : "setup"
    } else {
      const { shouldEnforceMfa, determineMfaRequirement } = await import("@/lib/mfa-enforcement")
      if (await shouldEnforceMfa(user.id, user.role, user.mfaEnabled)) {
        const requirement = await determineMfaRequirement(user.id, user.role, user.mfaEnabled, hasMfaMethod)
        if (requirement.mfaSetupRequired) mfa = "setup"
        else if (requirement.mfaRequired) mfa = "verify"
      }
    }
  }

  if (mfa !== "none") {
    // Pending session: the admin area redirects to MFA setup / verification
    await createSession(user.id, user.email, {
      mfaVerified: false,
      mfaSetupRequired: mfa === "setup",
      mfaRequired: mfa === "verify",
      ipAddress,
      userAgent,
    })
    return { ok: true }
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await createAuditLog({
    action: "LOGIN_OAUTH",
    resource: "User",
    resourceId: user.id,
    userId: user.id,
    ipAddress,
    userAgent,
    details: { provider },
  })
  await createSession(user.id, user.email, { ipAddress, userAgent })

  return { ok: true }
}
