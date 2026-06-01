import prisma from "./prisma"
import { Prisma } from "@/app/generated"
import { createAuditLog } from "./audit-log"

export type ThreatType = 
  | "BRUTE_FORCE"
  | "RATE_LIMIT_EXCEEDED"
  | "UNUSUAL_ACCESS_PATTERN"
  | "SUSPICIOUS_LOCATION"
  | "MULTIPLE_FAILED_LOGINS"
  | "ANOMALY_DETECTED"

export type ThreatSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"

export type RateLimitType = "IP" | "USER"

export interface RateLimitConfig {
  maxRequests: number
  windowMinutes: number
}

export interface ThreatDetectionConfig {
  enabled: boolean
  rateLimiting: {
    enabled: boolean
    login: RateLimitConfig
    passwordReset: RateLimitConfig
    api: RateLimitConfig
  }
  bruteForceProtection: {
    enabled: boolean
    maxAttempts: number
    lockoutDurationMinutes: number
    windowMinutes: number
  }
  anomalyDetection: {
    enabled: boolean
    checkUnusualLocation: boolean
    checkUnusualTime: boolean
    checkUnusualDevice: boolean
  }
  captcha: {
    enabled: boolean
    triggerAfterFailedAttempts: number
  }
}

/**
 * Get threat detection configuration from settings
 */
export async function getThreatDetectionConfig(companyId?: string | null): Promise<ThreatDetectionConfig> {
  const settings = await prisma.settings.findMany({
    where: {
      key: {
        startsWith: "security.threat.",
      },
    },
  })

  const config: Record<string, unknown> = {}
  settings.forEach((setting) => {
    config[setting.key] = setting.value
  })

  return {
    enabled: (config["security.threat.enabled"] as boolean) ?? true,
    rateLimiting: {
      enabled: (config["security.threat.rate_limiting.enabled"] as boolean) ?? true,
      login: {
        maxRequests: (config["security.threat.rate_limiting.login.max_requests"] as number) ?? 5,
        windowMinutes: (config["security.threat.rate_limiting.login.window_minutes"] as number) ?? 15,
      },
      passwordReset: {
        maxRequests: (config["security.threat.rate_limiting.password_reset.max_requests"] as number) ?? 3,
        windowMinutes: (config["security.threat.rate_limiting.password_reset.window_minutes"] as number) ?? 60,
      },
      api: {
        maxRequests: (config["security.threat.rate_limiting.api.max_requests"] as number) ?? 100,
        windowMinutes: (config["security.threat.rate_limiting.api.window_minutes"] as number) ?? 1,
      },
    },
    bruteForceProtection: {
      enabled: (config["security.threat.brute_force.enabled"] as boolean) ?? true,
      maxAttempts: (config["security.threat.brute_force.max_attempts"] as number) ?? 5,
      lockoutDurationMinutes: (config["security.threat.brute_force.lockout_duration_minutes"] as number) ?? 15,
      windowMinutes: (config["security.threat.brute_force.window_minutes"] as number) ?? 15,
    },
    anomalyDetection: {
      enabled: (config["security.threat.anomaly.enabled"] as boolean) ?? true,
      checkUnusualLocation: (config["security.threat.anomaly.check_unusual_location"] as boolean) ?? true,
      checkUnusualTime: (config["security.threat.anomaly.check_unusual_time"] as boolean) ?? true,
      checkUnusualDevice: (config["security.threat.anomaly.check_unusual_device"] as boolean) ?? true,
    },
    captcha: {
      enabled: (config["security.threat.captcha.enabled"] as boolean) ?? true,
      triggerAfterFailedAttempts: (config["security.threat.captcha.trigger_after_failed_attempts"] as number) ?? 3,
    },
  }
}

/**
 * Check rate limit for an action
 * Returns true if rate limit is exceeded, false otherwise
 */
export async function checkRateLimit(
  identifier: string,
  identifierType: RateLimitType,
  action: string,
  config: RateLimitConfig,
  companyId?: string | null
): Promise<{ exceeded: boolean; remaining: number; resetAt: Date }> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - config.windowMinutes * 60 * 1000)
  const windowEnd = new Date(now.getTime() + config.windowMinutes * 60 * 1000)

  // Clean up expired rate limit records
  await prisma.rateLimit.deleteMany({
    where: {
      windowEnd: {
        lt: now,
      },
    },
  })

  // Find or create rate limit record
  const existing = await prisma.rateLimit.findUnique({
    where: {
      identifier_identifierType_action_windowStart: {
        identifier,
        identifierType,
        action,
        windowStart,
      },
    },
  })

  if (existing) {
    // Check if limit exceeded
    if (existing.count >= config.maxRequests) {
      // Create threat event
      await createThreatEvent({
        threatType: "RATE_LIMIT_EXCEEDED",
        severity: "MEDIUM",
        ipAddress: identifierType === "IP" ? identifier : undefined,
        details: {
          identifier,
          identifierType,
          action,
          count: existing.count,
          maxRequests: config.maxRequests,
          windowMinutes: config.windowMinutes,
        },
        companyId,
      })

      return {
        exceeded: true,
        remaining: 0,
        resetAt: existing.windowEnd,
      }
    }

    // Increment count
    await prisma.rateLimit.update({
      where: { id: existing.id },
      data: {
        count: existing.count + 1,
        updatedAt: now,
      },
    })

    return {
      exceeded: false,
      remaining: config.maxRequests - existing.count - 1,
      resetAt: existing.windowEnd,
    }
  }

  // Create new rate limit record
  await prisma.rateLimit.create({
    data: {
      identifier,
      identifierType,
      action,
      count: 1,
      windowStart,
      windowEnd,
      companyId: companyId || null,
    },
  })

  return {
    exceeded: false,
    remaining: config.maxRequests - 1,
    resetAt: windowEnd,
  }
}

/**
 * Check brute force protection
 * Returns true if account should be locked, false otherwise
 */
export async function checkBruteForce(
  userId: string,
  config: { maxAttempts: number; lockoutDurationMinutes: number; windowMinutes: number },
  companyId?: string | null
): Promise<{ locked: boolean; remainingAttempts: number; unlockAt?: Date }> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - config.windowMinutes * 60 * 1000)

  // Count failed login attempts in the window
  const failedAttempts = await prisma.auditLog.count({
    where: {
      userId,
      action: "LOGIN_FAILED",
      createdAt: {
        gte: windowStart,
      },
    },
  })

  if (failedAttempts >= config.maxAttempts) {
    const unlockAt = new Date(now.getTime() + config.lockoutDurationMinutes * 60 * 1000)

    // Create threat event
    await createThreatEvent({
      threatType: "BRUTE_FORCE",
      severity: "HIGH",
      userId,
      details: {
        failedAttempts,
        maxAttempts: config.maxAttempts,
        windowMinutes: config.windowMinutes,
        lockoutDurationMinutes: config.lockoutDurationMinutes,
      },
      companyId,
    })

    return {
      locked: true,
      remainingAttempts: 0,
      unlockAt,
    }
  }

  return {
    locked: false,
    remainingAttempts: config.maxAttempts - failedAttempts,
  }
}

/**
 * Detect anomalies in access patterns
 */
export async function detectAnomalies(
  userId: string,
  ipAddress: string | null,
  userAgent: string | null,
  config: {
    checkUnusualLocation: boolean
    checkUnusualTime: boolean
    checkUnusualDevice: boolean
  },
  companyId?: string | null
): Promise<{ isAnomaly: boolean; reasons: string[]; severity: ThreatSeverity }> {
  const reasons: string[] = []
  let severity: ThreatSeverity = "LOW"

  // Get user's recent login history
  const recentLogins = await prisma.auditLog.findMany({
    where: {
      userId,
      action: "LOGIN_SUCCESS",
      createdAt: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 10,
  })

  if (recentLogins.length === 0) {
    // First login - not an anomaly
    return { isAnomaly: false, reasons: [], severity: "LOW" }
  }

  // Check unusual location
  if (config.checkUnusualLocation && ipAddress) {
    const { getIpGeolocation } = await import("./ip-whitelist")
    const currentGeo = await getIpGeolocation(ipAddress)
    
    if (currentGeo && typeof currentGeo === "object" && "countryCode" in currentGeo) {
      const previousCountries = recentLogins
        .map((login) => {
          const details = login.details as { countryCode?: string } | null
          return details?.countryCode
        })
        .filter((code): code is string => !!code)

      if (previousCountries.length > 0) {
        const uniqueCountries = new Set(previousCountries)
        if (!uniqueCountries.has(currentGeo.countryCode as string)) {
          reasons.push("Unusual location detected")
          severity = "MEDIUM"
        }
      }
    }
  }

  // Check unusual time
  if (config.checkUnusualTime) {
    const now = new Date()
    const currentHour = now.getHours()
    const previousHours = recentLogins.map((login) => new Date(login.createdAt).getHours())
    
    // Check if login is outside typical hours (e.g., 2 AM - 6 AM)
    if (currentHour >= 2 && currentHour <= 6) {
      const typicalHours = previousHours.filter((h) => h >= 2 && h <= 6)
      if (typicalHours.length === 0) {
        reasons.push("Unusual login time detected")
        severity = severity === "LOW" ? "MEDIUM" : severity
      }
    }
  }

  // Check unusual device
  if (config.checkUnusualDevice && userAgent) {
    const { parseUserAgent } = await import("./device-parser")
    const currentDevice = parseUserAgent(userAgent)
    
    const previousDevices = recentLogins
      .map((login) => parseUserAgent(login.userAgent))
      .filter((d) => d.deviceName !== "Unknown Device")

    if (previousDevices.length > 0) {
      const deviceNames = new Set(previousDevices.map((d) => d.deviceName))
      if (!deviceNames.has(currentDevice.deviceName)) {
        reasons.push("Unusual device detected")
        severity = severity === "LOW" ? "MEDIUM" : severity
      }
    }
  }

  const isAnomaly = reasons.length > 0

  if (isAnomaly) {
    await createThreatEvent({
      threatType: "ANOMALY_DETECTED",
      severity,
      userId,
      ipAddress,
      userAgent,
      details: {
        reasons,
        anomalyType: reasons.join(", "),
      },
      companyId,
    })
  }

  return { isAnomaly, reasons, severity }
}

/**
 * Create a threat event
 */
export async function createThreatEvent(params: {
  threatType: ThreatType
  severity: ThreatSeverity
  userId?: string | null
  companyId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  details?: Record<string, unknown>
}): Promise<void> {
  try {
    await prisma.threatEvent.create({
      data: {
        threatType: params.threatType,
        severity: params.severity,
        userId: params.userId || null,
        companyId: params.companyId || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        details: (params.details as Prisma.InputJsonValue) || Prisma.JsonNull,
      },
    })

    // Also create audit log
    await createAuditLog({
      action: `THREAT_${params.threatType}`,
      resource: "Security",
      status: "WARNING",
      userId: params.userId || null,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
      details: {
        threatType: params.threatType,
        severity: params.severity,
        ...params.details,
      },
    })
  } catch (error) {
    // Don't throw errors from threat logging
    console.error("[Threat Detection] Failed to create threat event:", error)
  }
}

/**
 * Check if CAPTCHA should be required
 */
export async function shouldRequireCaptcha(
  identifier: string,
  identifierType: RateLimitType,
  action: string,
  config: { triggerAfterFailedAttempts: number },
  companyId?: string | null
): Promise<boolean> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - 60 * 60 * 1000) // Last hour

  // Count failed attempts
  const failedAttempts = await prisma.auditLog.count({
    where: {
      action: action === "LOGIN" ? "LOGIN_FAILED" : `${action}_FAILED`,
      createdAt: {
        gte: windowStart,
      },
      ...(identifierType === "IP"
        ? { ipAddress: identifier }
        : { userId: identifier }),
    },
  })

  return failedAttempts >= config.triggerAfterFailedAttempts
}

/**
 * Clean up old threat events and rate limits
 */
export async function cleanupThreatData(): Promise<void> {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Delete old resolved threat events
  await prisma.threatEvent.deleteMany({
    where: {
      isResolved: true,
      resolvedAt: {
        lt: thirtyDaysAgo,
      },
    },
  })

  // Delete expired rate limits
  await prisma.rateLimit.deleteMany({
    where: {
      windowEnd: {
        lt: now,
      },
    },
  })
}
