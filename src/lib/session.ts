import { cache } from "react"
import { cookies } from "next/headers"
import { SignJWT, jwtVerify } from "jose"
import prisma from "@/lib/prisma"
import type { Prisma } from "@/app/generated"
import { getSettings } from "@/lib/settings-cache"
import { rememberUserCompany } from "@/lib/user-company"
import { parseUserAgent } from "@/lib/device-parser"
import { generateClientDeviceFingerprint, isDeviceTrusted } from "@/lib/device-fingerprint"

const SESSION_SECRET = process.env.SESSION_SECRET || "default-secret-change-in-production"

// Security: Prevent use of default secret in production
if (process.env.NODE_ENV === "production" && SESSION_SECRET === "default-secret-change-in-production") {
  throw new Error(
    "SECURITY ERROR: SESSION_SECRET must be set to a secure value in production. " +
    "The default secret is only for development. Generate a strong random secret (at least 32 characters) and set it in your environment variables."
  )
}

const secret = new TextEncoder().encode(SESSION_SECRET)

export interface SessionData {
  userId: string
  email: string
  isLoggedIn: boolean,
  mfaVerified?: boolean,
  mfaSetupRequired?: boolean,
  mfaRequired?: boolean,
}

// Everything the tRPC context and auth.getCurrentUser need about the acting
// user, so it can be loaded together with the session row.
const sessionUserSelect = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  image: true,
  role: true,
  mfaEnabled: true,
  mfaSecret: true,
  mfaMethod: true,
  phoneNumber: true,
  createdById: true,
  companyId: true,
  teamMemberships: {
    select: { teamId: true },
  },
  _count: {
    select: { mfaCredentials: true },
  },
} satisfies Prisma.UserSelect

type SessionUserRow = Prisma.UserGetPayload<{ select: typeof sessionUserSelect }>

/**
 * The acting user as loaded alongside the session.
 * The TOTP secret itself is deliberately not carried — only whether one exists.
 */
export type SessionUser = Omit<SessionUserRow, "mfaSecret" | "teamMemberships" | "_count"> & {
  teamIds: string[]
  hasTotpSecret: boolean
  mfaCredentialCount: number
}

function toSessionUser(row: SessionUserRow): SessionUser {
  const { mfaSecret, teamMemberships, _count, ...rest } = row
  return {
    ...rest,
    teamIds: teamMemberships.map((tm) => tm.teamId),
    hasTotpSecret: mfaSecret !== null,
    mfaCredentialCount: _count.mfaCredentials,
  }
}

function findSessionWithUser(sessionToken: string) {
  return prisma.session.findUnique({
    where: { sessionToken },
    select: {
      id: true,
      expires: true,
      userId: true,
      user: { select: sessionUserSelect },
    },
  })
}

/** Load the acting user by id, for when the session lookup could not supply it. */
export async function findSessionUser(userId: string): Promise<SessionUser | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: sessionUserSelect,
  })
  return row ? toSessionUser(row) : null
}

export interface CreateSessionOptions {
  mfaVerified?: boolean
  mfaSetupRequired?: boolean
  mfaRequired?: boolean
  ipAddress?: string | null
  userAgent?: string | null
  /**
   * Already-known values. Each one supplied skips the query createSession would
   * otherwise run for it; leave undefined to have createSession look it up.
   */
  /** The user's companyId (pass null for a user without a company). */
  companyId?: string | null
  /** Result of isDeviceTrusted() for this userAgent + ipAddress and user. */
  deviceIsTrusted?: boolean
  /** Value of the "security.session.timeout_minutes" setting. */
  timeoutMinutes?: number
  /** Whether the "security.device.require_mfa_untrusted" setting is on. */
  requireMfaForUntrustedDevices?: boolean
}

export async function createSession(
  userId: string,
  email: string,
  {
    mfaVerified = true,
    mfaSetupRequired = false,
    mfaRequired = false,
    ipAddress = null,
    userAgent = null,
    companyId: knownCompanyId,
    deviceIsTrusted: knownDeviceIsTrusted,
    timeoutMinutes: knownTimeoutMinutes,
    requireMfaForUntrustedDevices: knownRequireMfaForUntrustedDevices,
  }: CreateSessionOptions = {}
) {
  // Parse device info from user agent
  const deviceInfo = parseUserAgent(userAgent)

  // Generate device fingerprint
  const deviceFingerprint = generateClientDeviceFingerprint(userAgent, ipAddress)

  // The lookups are independent of each other, so run the ones the caller did not supply together
  // Get user's companyId for multi-tenant session isolation
  const companyIdPromise: Promise<string | null> =
    knownCompanyId !== undefined
      ? Promise.resolve(knownCompanyId)
      : prisma.user
          .findUnique({
            where: { id: userId },
            select: { companyId: true },
          })
          .then((user) => {
            const found = user?.companyId || null
            if (user) rememberUserCompany(userId, found)
            return found
          })
  const [settings, deviceIsTrusted, companyId] = await Promise.all([
    // Session limits are per company
    companyIdPromise.then((id) =>
      getSettings(["security.session.timeout_minutes", "security.device.require_mfa_untrusted"], id)
    ),
    // Check if this device is already trusted
    knownDeviceIsTrusted !== undefined
      ? knownDeviceIsTrusted
      : isDeviceTrusted(deviceFingerprint, userId),
    companyIdPromise,
  ])
  if (knownCompanyId !== undefined) rememberUserCompany(userId, knownCompanyId)

  // Get session timeout from settings
  const timeoutMinutes =
    knownTimeoutMinutes ?? (settings.get("security.session.timeout_minutes") as number | undefined) ?? 30
  const expirationTime = `${timeoutMinutes}m`
  const maxAge = timeoutMinutes * 60 // Convert to seconds

  // Check if device-specific MFA is required for untrusted devices
  // If mfaRequired was explicitly passed as true, use it; otherwise calculate based on device trust
  let finalMfaRequired = mfaRequired
  if (mfaRequired === false && mfaSetupRequired === false) {
    // Only recalculate if mfaRequired was not explicitly set to true
    // (mfaSetupRequired being true means we're in setup flow, so don't override)
    const requireMfaForUntrustedDevices =
      knownRequireMfaForUntrustedDevices ??
      settings.get("security.device.require_mfa_untrusted") === true
    finalMfaRequired = requireMfaForUntrustedDevices && !deviceIsTrusted
  }

  const payload = { userId, email, isLoggedIn: true, mfaVerified, mfaSetupRequired, mfaRequired: finalMfaRequired };
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expirationTime)
    .sign(secret)

  const cookieStore = await cookies()
  cookieStore.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    path: "/",
  })

  // Calculate expiration date
  const expires = new Date(Date.now() + maxAge * 1000)

  // Create database session record
  try {
    await prisma.session.create({
      data: {
        sessionToken: token,
        userId,
        companyId,
        expires,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        deviceName: deviceInfo.deviceName,
        deviceType: deviceInfo.deviceType,
        deviceFingerprint,
        isTrusted: deviceIsTrusted,
        requireMfa: finalMfaRequired || false,
        lastActiveAt: new Date(),
      },
    })
  } catch (error) {
    // Log error but don't fail session creation
    console.error("Failed to create database session record:", error)
  }
}

export interface SessionWithUser {
  session: SessionData
  /**
   * The acting user, loaded in the same query as the session row.
   * Only meaningful when `userLoaded` is true (then null means "no such user").
   */
  user: SessionUser | null
  /** False when logged out, or when the database check was skipped (JWT-only fallback). */
  userLoaded: boolean
  /** Raw value of the session cookie, if any. */
  token: string | null
}

const LOGGED_OUT: SessionData = { userId: "", email: "", isLoggedIn: false }

function loggedOut(token: string | null): SessionWithUser {
  return { session: { ...LOGGED_OUT }, user: null, userLoaded: false, token }
}

// Keyed by token (not by request alone) so that a session created or destroyed
// earlier in the same request is never answered from a stale entry.
const loadSessionByToken = cache(async (token: string): Promise<SessionWithUser> => {
  try {
    const { payload } = await jwtVerify(token, secret)

    // Verify session exists in database (not revoked)
    // Add timeout to prevent hanging on slow database connections
    let dbSession: Awaited<ReturnType<typeof findSessionWithUser>> = null

    try {
      // Use Promise.race to add a timeout (5 seconds)
      const dbQuery = findSessionWithUser(token)

      let timer: ReturnType<typeof setTimeout> | undefined
      const timeoutPromise = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 5000) // 5 second timeout
      })

      try {
        dbSession = await Promise.race([dbQuery, timeoutPromise])
      } finally {
        clearTimeout(timer)
      }
    } catch (dbError) {
      // If database query fails (timeout, connection error, etc.),
      // fall back to JWT verification only
      // This allows the app to continue working even if database is slow/unavailable
      console.warn("Database session check failed, using JWT only:", dbError)
      // Check JWT expiration as fallback
      const exp = (payload.exp as number) || 0
      if (exp * 1000 < Date.now()) {
        return loggedOut(token)
      }
      // If JWT is valid and not expired, trust it (graceful degradation)
      return {
        session: { ...payload as unknown as SessionData },
        user: null,
        userLoaded: false,
        token,
      }
    }

    // If session doesn't exist in database or is expired, return invalid session
    // Note: We don't delete the cookie here because cookies can only be modified
    // in Server Actions or Route Handlers. The cookie will be cleaned up on next
    // login attempt or can be cleared by calling destroySession() from a Server Action.
    if (!dbSession || new Date(dbSession.expires) < new Date()) {
      return loggedOut(token)
    }

    const session = { ...payload as unknown as SessionData }
    // The user row is only reused when it belongs to the user the token names
    const userLoaded = dbSession.userId === session.userId
    return {
      session,
      user: userLoaded ? toSessionUser(dbSession.user) : null,
      userLoaded,
      token,
    }
  } catch {
    // Invalid token - return invalid session
    // Note: We don't delete the cookie here because cookies can only be modified
    // in Server Actions or Route Handlers. The cookie will be cleaned up on next
    // login attempt or can be cleared by calling destroySession() from a Server Action.
    return loggedOut(token)
  }
})

/**
 * Validate the session cookie and load the acting user in one query.
 *
 * The lookup is wrapped in React cache(): within one server render every
 * caller (layouts, getSession(), the tRPC context) shares a single query.
 * Outside a React render (route handlers, scripts) cache() does not dedupe and
 * each call simply runs the lookup — prefer `ctx.session` / `ctx.user` in procedures.
 */
export async function getSessionWithUser(): Promise<SessionWithUser> {
  const cookieStore = await cookies()
  const token = cookieStore.get("session")?.value

  if (!token) {
    return loggedOut(null)
  }

  return loadSessionByToken(token)
}

export async function getSession(): Promise<SessionData> {
  // Copy, so a caller mutating its result cannot affect the others sharing the lookup
  return { ...(await getSessionWithUser()).session }
}

/**
 * Validate a session token that did not come from the cookie (the browser
 * extension sends it in the x-session-token header) and load its user.
 * Throws when the JWT is invalid; returns null when the session row is missing or expired.
 */
export async function verifySessionToken(
  sessionToken: string
): Promise<{ session: SessionData; user: SessionUser } | null> {
  const { payload } = await jwtVerify(sessionToken, secret)

  // Verify session exists in database
  const dbSession = await findSessionWithUser(sessionToken)
  if (!dbSession || !(new Date(dbSession.expires) > new Date())) {
    return null
  }

  return {
    session: {
      userId: dbSession.userId,
      email: (payload.email as string) || "",
      isLoggedIn: true,
      mfaVerified: (payload.mfaVerified as boolean) ?? true,
      mfaSetupRequired: (payload.mfaSetupRequired as boolean) ?? false,
      mfaRequired: (payload.mfaRequired as boolean) ?? false,
    },
    user: toSessionUser(dbSession.user),
  }
}

export async function destroySession() {
  const cookieStore = await cookies()
  const token = cookieStore.get("session")?.value

  // Delete cookie
  cookieStore.delete("session")

  // Delete database session record if token exists
  if (token) {
    try {
      await prisma.session.deleteMany({
        where: {
          sessionToken: token,
        },
      })
    } catch (error) {
      // Log error but don't fail logout
      console.error("Failed to delete database session record:", error)
    }
  }
}
