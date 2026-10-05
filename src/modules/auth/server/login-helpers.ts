import { TRPCError } from "@trpc/server"
import { after } from "next/server"
import { cookies, headers } from "next/headers"
import prisma from "@/lib/prisma"
import { verifyPassword } from "@/lib/auth"
import { createAuditLog, getRequestMetadata } from "@/lib/audit-log"
import { createSession, type SessionData, type SessionUser } from "@/lib/session"
import type { Context } from "@/trpc/init"
import {
  checkBruteForce,
  checkRateLimit,
  shouldRequireCaptcha,
  type ThreatDetectionConfig,
} from "@/lib/threat-detection"
import { createCaptchaChallenge, verifyCaptchaToken } from "@/lib/captcha"
import { checkGeographicRestriction, isIpWhitelisted, type GeoResolver } from "@/lib/ip-whitelist"
import { SignJWT } from "jose"
import { parseUserAgent } from "@/lib/device-parser"

/** Run bookkeeping after the response; runs inline when `after()` is unavailable. Never throws. */
export async function runAfter(task: () => Promise<void>): Promise<void> {
  const safe = async () => {
    try {
      await task()
    } catch (error) {
      console.error("[auth] deferred task failed:", error)
    }
  }
  try {
    after(safe)
  } catch {
    await safe()
  }
}

interface PasswordAuthParams {
  companyId: string
  email: string
  password: string
  captchaToken?: string
  captchaAnswer?: number
  ipAddress: string | null
  threatConfig: ThreatDetectionConfig
  /** Web login hands the client a challenge to solve; the extension just reports that one is needed. */
  issueCaptchaChallenge: boolean
}

/**
 * Rate limit, CAPTCHA, brute-force and password checks shared by the web and
 * extension logins. The independent lookups run together; the failures are
 * still raised in the original order (rate limit, unknown user, CAPTCHA,
 * lockout, password, deactivated account).
 */
export async function authenticateWithPassword({
  companyId,
  email,
  password,
  captchaToken,
  captchaAnswer,
  ipAddress,
  threatConfig,
  issueCaptchaChallenge,
}: PasswordAuthParams) {
  const threatEnabled = threatConfig.enabled

  const [rateLimitCheck, user, requiresCaptcha] = await Promise.all([
    threatEnabled && threatConfig.rateLimiting.enabled && ipAddress
      ? checkRateLimit(ipAddress, "IP", "LOGIN", threatConfig.rateLimiting.login, companyId)
      : null,
    prisma.user.findFirst({
      where: { email, companyId },
      include: { _count: { select: { mfaCredentials: true } } },
    }),
    threatEnabled && threatConfig.captcha.enabled && ipAddress
      ? shouldRequireCaptcha(ipAddress, "IP", "LOGIN", threatConfig.captcha, companyId)
      : false,
  ])

  if (rateLimitCheck?.exceeded) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many login attempts. Please try again after ${new Date(rateLimitCheck.resetAt).toLocaleTimeString()}.`,
    })
  }

  if (!user) {
    // Don't reveal if user exists (security best practice)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    })
  }

  if (requiresCaptcha) {
    if (captchaToken && captchaAnswer !== undefined) {
      if (!(await verifyCaptchaToken(captchaToken, captchaAnswer, ipAddress ?? ""))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid CAPTCHA answer. Please try again.",
        })
      }
    } else if (issueCaptchaChallenge) {
      const challenge = await createCaptchaChallenge(ipAddress ?? "")
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "CAPTCHA verification required",
        cause: {
          requiresCaptcha: true,
          captchaToken: challenge.token,
          captchaQuestion: challenge.question,
        },
      })
    } else {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "CAPTCHA required",
      })
    }
  }

  if (threatEnabled && threatConfig.bruteForceProtection.enabled) {
    const bruteForceCheck = await checkBruteForce(user.id, threatConfig.bruteForceProtection, companyId)

    if (bruteForceCheck.locked) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Account locked due to too many failed login attempts. Please try again ${bruteForceCheck.unlockAt ? `after ${bruteForceCheck.unlockAt.toLocaleTimeString()}` : "later"}.`,
      })
    }
  }

  // The password may be null for OAuth-only users
  const isValid = user.password ? await verifyPassword(password, user.password) : false

  if (!isValid) {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "LOGIN_FAILED",
        resource: "User",
        resourceId: user.id,
        status: "FAILED",
        details: user.password ? "Invalid password" : "No password set for user",
      },
    })
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    })
  }

  if (!user.isActive) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your account has been deactivated. Please contact your administrator.",
    })
  }

  return user
}

interface AccessRuleParams {
  user: { id: string; companyId: string | null }
  ipAddress: string | null
  userAgent: string | null
  resolveGeo: GeoResolver
  source?: string
}

/**
 * IP allow-list and geographic restrictions. Must run before any session
 * (including a pending-MFA one) is created; throws FORBIDDEN when blocked.
 */
export async function enforceAccessRules({ user, ipAddress, userAgent, resolveGeo, source }: AccessRuleParams) {
  if (!ipAddress) return

  const [ipCheck, geoCheck] = await Promise.all([
    isIpWhitelisted(ipAddress, user.id, user.companyId || undefined),
    checkGeographicRestriction(ipAddress, user.id, user.companyId || undefined, resolveGeo),
  ])
  const extra = source ? { source } : {}

  if (!ipCheck.allowed) {
    await createAuditLog({
      action: "LOGIN_BLOCKED_IP",
      resource: "User",
      resourceId: user.id,
      userId: user.id,
      ipAddress,
      userAgent,
      status: "BLOCKED",
      details: { reason: ipCheck.reason, ...extra },
    })

    throw new TRPCError({
      code: "FORBIDDEN",
      message: ipCheck.reason || "Access denied from this IP address",
    })
  }

  if (!geoCheck.allowed) {
    await createAuditLog({
      action: "LOGIN_BLOCKED_GEO",
      resource: "User",
      resourceId: user.id,
      userId: user.id,
      ipAddress,
      userAgent,
      status: "BLOCKED",
      details: { reason: geoCheck.reason, countryCode: geoCheck.countryCode, ...extra },
    })

    throw new TRPCError({
      code: "FORBIDDEN",
      message: geoCheck.reason || "Access denied from this location",
    })
  }
}

/**
 * Remove the pending session row a new, verified session replaces, so MFA
 * completion leaves one session row instead of two. The caller creates the new
 * session first; the old row is only removed once a newer row exists.
 */
export async function removeReplacedSession(oldToken: string | undefined, userId: string): Promise<void> {
  if (!oldToken) return
  try {
    const fresh = await prisma.session.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { sessionToken: true },
    })
    if (fresh && fresh.sessionToken !== oldToken) {
      await prisma.session.deleteMany({ where: { sessionToken: oldToken, userId } })
    }
  } catch (error) {
    console.error("Failed to remove the pending MFA session row:", error)
  }
}

/**
 * Issue the verified session after MFA setup or verification. The cookie is
 * swapped for the new one in the same response, and the pending session row it
 * replaces is removed so only one row remains.
 */
export async function createVerifiedSession(userId: string, email: string): Promise<void> {
  const oldToken = (await cookies()).get("session")?.value
  const { ipAddress, userAgent } = getRequestMetadata(await headers())
  await createSession(userId, email, { mfaVerified: true, ipAddress, userAgent })
  await removeReplacedSession(oldToken, userId)
}

/** The session of the request, or UNAUTHORIZED when nobody is logged in. */
export function requireSession(ctx: Context): SessionData {
  if (!ctx.session?.isLoggedIn || !ctx.session.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" })
  }
  return ctx.session
}

/** The acting user already loaded with the session (no extra query). */
export function requireUser(ctx: Context): SessionUser {
  requireSession(ctx)
  if (!ctx.user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" })
  }
  return ctx.user
}

/** The encrypted TOTP secret, which the session user deliberately does not carry. */
export async function getMfaSecret(userId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { mfaSecret: true } })
  return row?.mfaSecret ?? null
}

interface ExtensionSessionParams {
  userId: string
  email: string
  companyId: string | null
  timeoutMinutes: number
  /** MFA still has to be completed with extensionVerifyMfa; the token is issued as pending */
  mfaRequired: boolean
  ipAddress: string | null
  userAgent: string | null
  deviceFingerprint: string
  deviceIsTrusted: boolean
}

/**
 * The session token handed to the browser extension (and its database row).
 * Shared by extensionLogin and extensionOAuthExchange so both issue the same format.
 */
export async function createExtensionSession(params: ExtensionSessionParams) {
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET || "default-secret-change-in-production")
  const maxAge = params.timeoutMinutes * 60

  // A pending token (mfaVerified:false) is useless for protected data until extensionVerifyMfa upgrades it
  const sessionToken = await new SignJWT({
    userId: params.userId,
    email: params.email,
    isLoggedIn: true,
    mfaVerified: !params.mfaRequired,
    mfaSetupRequired: false,
    mfaRequired: params.mfaRequired,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${params.timeoutMinutes}m`)
    .sign(secret)

  const deviceInfo = parseUserAgent(params.userAgent)
  try {
    await prisma.session.create({
      data: {
        sessionToken,
        userId: params.userId,
        companyId: params.companyId,
        expires: new Date(Date.now() + maxAge * 1000),
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        deviceName: deviceInfo.deviceName,
        deviceType: deviceInfo.deviceType,
        deviceFingerprint: params.deviceFingerprint,
        isTrusted: params.deviceIsTrusted,
        requireMfa: params.mfaRequired,
        lastActiveAt: new Date(),
      },
    })
  } catch (error) {
    console.error("Failed to create database session record:", error)
  }

  return { sessionToken, maxAge }
}
