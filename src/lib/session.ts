import { cookies } from "next/headers"
import { SignJWT, jwtVerify } from "jose"

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

export async function createSession(
  userId: string,
  email: string,
  { 
    mfaVerified = true, 
    mfaSetupRequired = false, 
    mfaRequired = false,
    ipAddress = null,
    userAgent = null,
  }: {
    mfaVerified?: boolean
    mfaSetupRequired?: boolean
    mfaRequired?: boolean
    ipAddress?: string | null
    userAgent?: string | null
  } = {}
) {
  // Get session timeout from settings
  const prisma = (await import("@/lib/prisma")).default
  const sessionTimeoutSetting = await prisma.settings.findUnique({
    where: { key: "security.session.timeout_minutes" },
  })
  
  const timeoutMinutes = (sessionTimeoutSetting?.value as number) ?? 30
  const expirationTime = `${timeoutMinutes}m`
  const maxAge = timeoutMinutes * 60 // Convert to seconds

  // Parse device info from user agent
  const { parseUserAgent } = await import("@/lib/device-parser")
  const deviceInfo = parseUserAgent(userAgent)

  // Generate device fingerprint
  const { generateClientDeviceFingerprint, isDeviceTrusted } = await import("@/lib/device-fingerprint")
  const deviceFingerprint = generateClientDeviceFingerprint(userAgent, ipAddress)

  // Check if this device is already trusted
  const deviceIsTrusted = await isDeviceTrusted(deviceFingerprint, userId)

  // Get user's companyId for multi-tenant session isolation
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  })
  const companyId = user?.companyId || null

  // Check if device-specific MFA is required for untrusted devices
  // If mfaRequired was explicitly passed as true, use it; otherwise calculate based on device trust
  let finalMfaRequired = mfaRequired
  if (mfaRequired === false && mfaSetupRequired === false) {
    // Only recalculate if mfaRequired was not explicitly set to true
    // (mfaSetupRequired being true means we're in setup flow, so don't override)
    const requireMfaForUntrustedDevices = await prisma.settings.findUnique({
      where: { key: "security.device.require_mfa_untrusted" },
    })
    finalMfaRequired = requireMfaForUntrustedDevices?.value === true && !deviceIsTrusted
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

export async function getSession(): Promise<SessionData> {
  const cookieStore = await cookies()
  const token = cookieStore.get("session")?.value

  if (!token) {
    return { userId: "", email: "", isLoggedIn: false }
  }

  try {
    const { payload } = await jwtVerify(token, secret)
    
    // Verify session exists in database (not revoked)
    // Add timeout to prevent hanging on slow database connections
    const prisma = (await import("@/lib/prisma")).default
    let dbSession = null
    
    try {
      // Use Promise.race to add a timeout (5 seconds)
      const dbQuery = prisma.session.findUnique({
        where: { sessionToken: token },
        select: { id: true, expires: true },
      })
      
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 5000) // 5 second timeout
      })
      
      dbSession = await Promise.race([dbQuery, timeoutPromise])
    } catch (dbError) {
      // If database query fails (timeout, connection error, etc.), 
      // fall back to JWT verification only
      // This allows the app to continue working even if database is slow/unavailable
      console.warn("Database session check failed, using JWT only:", dbError)
      // Check JWT expiration as fallback
      const exp = (payload.exp as number) || 0
      if (exp * 1000 < Date.now()) {
        return { userId: "", email: "", isLoggedIn: false }
      }
      // If JWT is valid and not expired, trust it (graceful degradation)
      return {
        ...payload as unknown as SessionData
      }
    }

    // If session doesn't exist in database or is expired, return invalid session
    // Note: We don't delete the cookie here because cookies can only be modified
    // in Server Actions or Route Handlers. The cookie will be cleaned up on next
    // login attempt or can be cleared by calling destroySession() from a Server Action.
    if (!dbSession || new Date(dbSession.expires) < new Date()) {
      return { userId: "", email: "", isLoggedIn: false }
    }

    return {
      ...payload as unknown as SessionData
    }
  } catch {
    // Invalid token - return invalid session
    // Note: We don't delete the cookie here because cookies can only be modified
    // in Server Actions or Route Handlers. The cookie will be cleaned up on next
    // login attempt or can be cleared by calling destroySession() from a Server Action.
    return { userId: "", email: "", isLoggedIn: false }
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
      const prisma = (await import("@/lib/prisma")).default
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
