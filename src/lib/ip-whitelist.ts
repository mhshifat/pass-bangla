import { headers } from "next/headers"
import prisma from "@/lib/prisma"
import type { Prisma } from "@/app/generated"
import { getSetting } from "@/lib/settings-cache"

/**
 * Check if an IP address matches a CIDR range
 */
export function ipMatchesCidr(ip: string, cidr: string): boolean {
  // Handle single IP addresses (not CIDR)
  if (!cidr.includes("/")) {
    return ip === cidr
  }

  const [network, prefixLength] = cidr.split("/")
  const prefix = parseInt(prefixLength, 10)

  // Convert IP addresses to numbers
  const ipToNumber = (ip: string): number => {
    return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
  }

  const networkNum = ipToNumber(network)
  const ipNum = ipToNumber(ip)
  const mask = ~((1 << (32 - prefix)) - 1)

  return (networkNum & mask) === (ipNum & mask)
}

/**
 * Check if an IP address is whitelisted for a user or company
 */
export async function isIpWhitelisted(
  ipAddress: string,
  userId?: string,
  companyId?: string
): Promise<{ allowed: boolean; reason?: string }> {
  if (!ipAddress) {
    return { allowed: true } // Allow if no IP provided (e.g., localhost)
  }

  // Entries only matter when whitelisting is enforced, so check the (cached) flag first
  if ((await getSetting("security.ip_whitelist_enabled", companyId)) !== true) {
    return { allowed: true }
  }

  const scopes: Prisma.IpWhitelistWhereInput[] = []
  if (userId) scopes.push({ userId })
  // Company-wide entries
  if (companyId) scopes.push({ companyId, userId: null })

  if (scopes.length > 0) {
    const entries = await prisma.ipWhitelist.findMany({
      where: { isActive: true, OR: scopes },
      select: { ipAddress: true },
    })

    for (const entry of entries) {
      if (ipMatchesCidr(ipAddress, entry.ipAddress)) {
        return { allowed: true }
      }
    }
  }

  return {
    allowed: false,
    reason: "IP address is not whitelisted",
  }
}

export interface IpGeolocation {
  country?: string
  countryCode?: string
  city?: string
  region?: string
  isp?: string
  isVpn?: boolean
  isProxy?: boolean
}

/** Resolves the geolocation of one IP; memoised so a login looks it up at most once. */
export type GeoResolver = () => Promise<IpGeolocation | null>

const GEO_CACHE_TTL_MS = 60 * 60 * 1000
const GEO_MISS_TTL_MS = 60 * 1000
const GEO_CACHE_MAX = 500
const geoCache = new Map<string, { geo: IpGeolocation | null; expires: number }>()

function isPrivateIp(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  )
}

/**
 * Country sent by Vercel's edge. Only trusted on Vercel, where the platform
 * overwrites any client-supplied value; elsewhere a client could forge it.
 */
async function getVercelCountryCode(): Promise<string | null> {
  if (!process.env.VERCEL) return null
  try {
    const code = (await headers()).get("x-vercel-ip-country")?.toUpperCase()
    // XX = unknown, T1 = Tor
    return code && /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1" ? code : null
  } catch {
    return null
  }
}

function countryName(code: string): string | undefined {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code)
  } catch {
    return undefined
  }
}

/**
 * Get geolocation information for the IP of the current request.
 * Uses the Vercel country header when present, otherwise ipapi.co (1.5s timeout,
 * cached per IP in memory). Returns null when the location cannot be determined.
 */
export async function getIpGeolocation(ipAddress: string): Promise<IpGeolocation | null> {
  // Skip for localhost/private IPs
  if (!ipAddress || isPrivateIp(ipAddress)) return null

  const vercelCountry = await getVercelCountryCode()
  if (vercelCountry) {
    return { countryCode: vercelCountry, country: countryName(vercelCountry) }
  }

  const cached = geoCache.get(ipAddress)
  if (cached && cached.expires > Date.now()) return cached.geo

  let geo: IpGeolocation | null = null
  try {
    // ipapi.co free API (no key required for basic usage)
    const apiKey = process.env.IP_GEOLOCATION_API_KEY
    const apiUrl = apiKey
      ? `https://ipapi.co/${encodeURIComponent(ipAddress)}/json/?key=${apiKey}`
      : `https://ipapi.co/${encodeURIComponent(ipAddress)}/json/`

    const response = await fetch(apiUrl, {
      headers: { "User-Agent": "PassBangla/1.0" },
      signal: AbortSignal.timeout(1500),
    })

    if (!response.ok) {
      console.warn(`Failed to fetch geolocation for IP ${ipAddress}: ${response.statusText}`)
    } else {
      const data = await response.json()
      if (data.error) {
        console.warn(`Geolocation API error for IP ${ipAddress}: ${data.reason || "Unknown error"}`)
      } else {
        geo = {
          country: data.country_name,
          countryCode: data.country_code,
          city: data.city,
          region: data.region,
          isp: data.org,
          // ipapi.co doesn't report VPN/proxy on the free plan
          isVpn: data.vpn === true || data.proxy === true,
          isProxy: data.proxy === true,
        }
      }
    }
  } catch (error) {
    console.error(`Error fetching geolocation for IP ${ipAddress}:`, error)
  }

  if (geoCache.size >= GEO_CACHE_MAX) {
    geoCache.delete(geoCache.keys().next().value as string)
  }
  geoCache.set(ipAddress, { geo, expires: Date.now() + (geo ? GEO_CACHE_TTL_MS : GEO_MISS_TTL_MS) })
  return geo
}

export function createGeoResolver(ipAddress: string): GeoResolver {
  let pending: Promise<IpGeolocation | null> | undefined
  return () => (pending ??= getIpGeolocation(ipAddress))
}

/**
 * Check if an IP address is allowed based on geographic restrictions.
 * The location is only looked up when the user or company has restrictions.
 */
export async function checkGeographicRestriction(
  ipAddress: string,
  userId?: string,
  companyId?: string,
  resolveGeo: GeoResolver = createGeoResolver(ipAddress)
): Promise<{ allowed: boolean; reason?: string; countryCode?: string }> {
  const scopes: Prisma.GeographicRestrictionWhereInput[] = []
  if (userId) scopes.push({ userId })
  // Company-wide entries
  if (companyId) scopes.push({ companyId, userId: null })

  const rules =
    scopes.length > 0
      ? await prisma.geographicRestriction.findMany({
          where: { isActive: true, OR: scopes },
          select: { userId: true, countryCode: true, action: true },
        })
      : []

  // Without any rule neither a block nor an allow-list can apply
  if (rules.length === 0) {
    return { allowed: true }
  }

  const geo = await resolveGeo()

  if (!geo || !geo.countryCode) {
    // If we can't determine location, allow by default (fail open)
    return { allowed: true }
  }

  const countryCode = geo.countryCode
  const where = geo.country || countryCode
  const userRules = rules.filter((r) => r.userId !== null)
  const companyRules = rules.filter((r) => r.userId === null)

  // User-specific restrictions first, then company-wide
  for (const restriction of [...userRules, ...companyRules]) {
    if (restriction.countryCode !== countryCode) continue
    if (restriction.action === "BLOCK") {
      return { allowed: false, reason: `Access from ${where} is blocked`, countryCode }
    }
    // If action is ALLOW and country matches, allow access
    if (restriction.action === "ALLOW") {
      return { allowed: true, countryCode }
    }
  }

  // If restrictions are enforced and there are ALLOW rules, only listed countries get in
  if ((await getSetting("security.geographic_restriction_enabled", companyId)) === true) {
    const allowRules = rules.filter((r) => r.action === "ALLOW")
    if (allowRules.length > 0 && !allowRules.some((rule) => rule.countryCode === countryCode)) {
      return { allowed: false, reason: `Access from ${where} is not allowed`, countryCode }
    }
  }

  return { allowed: true, countryCode }
}

/**
 * Check for suspicious location based on the countries stored with the user's
 * previous successful logins. Older login rows without a stored country are skipped.
 */
export async function checkSuspiciousLocation(
  ipAddress: string,
  userId: string,
  resolveGeo: GeoResolver = createGeoResolver(ipAddress)
): Promise<{ suspicious: boolean; reason?: string; geo?: unknown }> {
  const currentGeo = await resolveGeo()

  if (!currentGeo || !currentGeo.countryCode) {
    return { suspicious: false }
  }

  // Recent login history (last 10 logins in 90 days)
  const recentLogins = await prisma.auditLog.findMany({
    where: {
      userId,
      action: "LOGIN_SUCCESS",
      createdAt: {
        gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { details: true },
  })

  const recentCountries = new Set<string>()
  for (const login of recentLogins) {
    const code = (login.details as { countryCode?: unknown } | null)?.countryCode
    if (typeof code === "string" && code) recentCountries.add(code)
  }

  // If user has never logged in from this country before, it's suspicious
  if (recentCountries.size > 0 && !recentCountries.has(currentGeo.countryCode)) {
    return {
      suspicious: true,
      reason: `Login from new location: ${currentGeo.country || currentGeo.countryCode}`,
      geo: currentGeo,
    }
  }

  // Check for VPN/proxy usage
  if (currentGeo.isVpn || currentGeo.isProxy) {
    return {
      suspicious: true,
      reason: "VPN or proxy detected",
      geo: currentGeo,
    }
  }

  return { suspicious: false, geo: currentGeo }
}

/**
 * Validate IP address format
 */
export function isValidIpAddress(ip: string): boolean {
  // Check for IPv4
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/
  if (ipv4Regex.test(ip)) {
    const parts = ip.split("/")[0].split(".")
    return parts.every((part) => {
      const num = parseInt(part, 10)
      return num >= 0 && num <= 255
    })
  }

  // Check for CIDR notation
  if (ip.includes("/")) {
    const [network, prefix] = ip.split("/")
    const prefixNum = parseInt(prefix, 10)
    if (prefixNum < 0 || prefixNum > 32) {
      return false
    }
    return isValidIpAddress(network)
  }

  return false
}
