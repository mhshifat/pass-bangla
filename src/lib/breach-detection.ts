/**
 * Password Breach Detection using Have I Been Pwned API
 * Uses k-anonymity model: only sends first 5 chars of SHA-1 hash
 */

import crypto from "crypto"

const HIBP_API_URL = "https://api.pwnedpasswords.com/range"

/**
 * Check if a password has been breached using Have I Been Pwned API
 * Uses k-anonymity model for privacy (only sends first 5 chars of hash)
 * 
 * @param password - The plain text password to check
 * @returns Object with isBreached flag and breachCount (number of times found)
 */
export async function checkPasswordBreach(password: string): Promise<{
  isBreached: boolean
  breachCount: number
  hashPrefix: string
}> {
  // Generate SHA-1 hash of the password
  const hash = crypto.createHash("sha1").update(password).digest("hex").toUpperCase()
  
  // Get first 5 characters (k-anonymity)
  const hashPrefix = hash.substring(0, 5)
  const hashSuffix = hash.substring(5)

  try {
    // Fetch from Have I Been Pwned API
    const response = await fetch(`${HIBP_API_URL}/${hashPrefix}`, {
      headers: {
        "User-Agent": "PassBangla-Breach-Checker/1.0",
      },
      signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
    })

    if (!response.ok) {
      // If API is unavailable, don't fail - just return not breached
      console.error(`HIBP API error: ${response.status} ${response.statusText}`)
      return {
        isBreached: false,
        breachCount: 0,
        hashPrefix,
      }
    }

    const text = await response.text()
    const lines = text.split("\n")

    // Search for matching hash suffix in the response
    for (const line of lines) {
      const [suffix, count] = line.split(":")
      if (suffix.trim() === hashSuffix) {
        const breachCount = parseInt(count.trim(), 10) || 0
        return {
          isBreached: breachCount > 0,
          breachCount,
          hashPrefix,
        }
      }
    }

    // Hash suffix not found in breach database
    return {
      isBreached: false,
      breachCount: 0,
      hashPrefix,
    }
  } catch (error) {
    // Network error or API unavailable
    console.error("Error checking password breach:", error)
    return {
      isBreached: false,
      breachCount: 0,
      hashPrefix,
    }
  }
}

const HIBP_TIMEOUT_MS = 8000
const HIBP_CONCURRENCY = 5

function sha1Upper(password: string): string {
  return crypto.createHash("sha1").update(password).digest("hex").toUpperCase()
}

/** Fetches one range response; null when the API is unavailable or slow. */
async function fetchRange(hashPrefix: string): Promise<string | null> {
  try {
    const response = await fetch(`${HIBP_API_URL}/${hashPrefix}`, {
      headers: { "User-Agent": "PassBangla-Breach-Checker/1.0" },
      signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
    })
    if (!response.ok) {
      console.error(`HIBP API error: ${response.status} ${response.statusText}`)
      return null
    }
    return await response.text()
  } catch (error) {
    console.error("Error checking password breach:", error)
    return null
  }
}

/**
 * Check multiple passwords for breaches. Identical passwords are checked once,
 * one range request is made per distinct hash prefix, and requests run with a
 * small concurrency. Results are returned in input order (plaintext is not echoed).
 */
export async function checkMultiplePasswords(
  passwords: string[]
): Promise<Array<{
  isBreached: boolean
  breachCount: number
  hashPrefix: string
}>> {
  const hashes = passwords.map(sha1Upper)
  const prefixes = [...new Set(hashes.map((h) => h.substring(0, 5)))]
  const ranges = new Map<string, string | null>()

  let next = 0
  const worker = async () => {
    while (next < prefixes.length) {
      const prefix = prefixes[next++]!
      ranges.set(prefix, await fetchRange(prefix))
    }
  }
  await Promise.all(Array.from({ length: Math.min(HIBP_CONCURRENCY, prefixes.length) }, worker))

  const counts = new Map<string, Map<string, number>>()
  for (const [prefix, text] of ranges) {
    const suffixes = new Map<string, number>()
    if (text) {
      for (const line of text.split(/\r?\n/)) {
        const [suffix, count] = line.split(":")
        if (suffix && count) suffixes.set(suffix.trim(), parseInt(count.trim(), 10) || 0)
      }
    }
    counts.set(prefix, suffixes)
  }

  return hashes.map((hash) => {
    const hashPrefix = hash.substring(0, 5)
    const breachCount = counts.get(hashPrefix)?.get(hash.substring(5)) ?? 0
    return { isBreached: breachCount > 0, breachCount, hashPrefix }
  })
}
