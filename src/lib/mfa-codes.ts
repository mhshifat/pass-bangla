import { randomInt, timingSafeEqual } from "crypto"

/**
 * Generate a 6-digit verification code
 */
export function generateMfaCode(): string {
  return randomInt(100000, 999999).toString()
}

const CODE_EXPIRY_MINUTES = 10
const CODE_TTL_MS = CODE_EXPIRY_MINUTES * 60 * 1000
/** Max wrong guesses before the code is invalidated (brute-force protection). */
const MAX_ATTEMPTS = 5

interface MfaEntry {
  code: string
  expiresAt: number
  attempts: number
}

/**
 * Storage backend for short-lived MFA codes. Redis is used when REDIS_URL is set
 * (so codes work across multiple / serverless instances); otherwise an in-memory
 * Map is used (single-instance dev/default). The API is async either way.
 */
interface MfaBackend {
  set(key: string, entry: MfaEntry): Promise<void>
  update(key: string, entry: MfaEntry): Promise<void>
  get(key: string): Promise<MfaEntry | null>
  del(key: string): Promise<void>
}

// ---- In-memory backend (default; per-instance) -----------------------------
const memMap = new Map<string, MfaEntry>()
const memoryBackend: MfaBackend = {
  async set(key, entry) {
    memMap.set(key, entry)
    setTimeout(() => memMap.delete(key), CODE_TTL_MS)
  },
  async update(key, entry) {
    memMap.set(key, entry)
  },
  async get(key) {
    return memMap.get(key) ?? null
  },
  async del(key) {
    memMap.delete(key)
  },
}

// ---- Redis backend (lazy; only when REDIS_URL is configured) ----------------
let redisBackend: MfaBackend | null = null
let redisInitAttempted = false

async function getRedisBackend(): Promise<MfaBackend | null> {
  if (!process.env.REDIS_URL) return null
  if (redisBackend) return redisBackend
  if (redisInitAttempted) return redisBackend
  redisInitAttempted = true
  try {
    const { default: IORedis } = await import("ioredis")
    const client = new IORedis(process.env.REDIS_URL)
    redisBackend = {
      async set(key, entry) {
        await client.set(key, JSON.stringify(entry), "PX", CODE_TTL_MS)
      },
      async update(key, entry) {
        // Preserve the remaining TTL when rewriting (e.g. on a failed attempt).
        const ttl = await client.pttl(key)
        await client.set(key, JSON.stringify(entry), "PX", ttl > 0 ? ttl : CODE_TTL_MS)
      },
      async get(key) {
        const raw = await client.get(key)
        return raw ? (JSON.parse(raw) as MfaEntry) : null
      },
      async del(key) {
        await client.del(key)
      },
    }
    return redisBackend
  } catch (err) {
    // If Redis can't be initialized, fall back to in-memory rather than failing.
    console.error("MFA code store: Redis init failed, falling back to in-memory:", err)
    return null
  }
}

async function backend(): Promise<MfaBackend> {
  return (await getRedisBackend()) ?? memoryBackend
}

function keyFor(userId: string, method: "SMS" | "EMAIL"): string {
  return `mfa:${userId}:${method}`
}

/** Constant-time string comparison (guards against timing leaks on the code). */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8")
  const bufB = Buffer.from(b, "utf8")
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function storeMfaCode(
  userId: string,
  method: "SMS" | "EMAIL",
  code: string
): Promise<void> {
  const be = await backend()
  await be.set(keyFor(userId, method), {
    code,
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
  })
}

export async function verifyMfaCode(
  userId: string,
  method: "SMS" | "EMAIL",
  code: string
): Promise<boolean> {
  const be = await backend()
  const key = keyFor(userId, method)
  const entry = await be.get(key)

  if (!entry) {
    return false
  }

  if (Date.now() > entry.expiresAt) {
    await be.del(key)
    return false
  }

  if (!safeEqual(entry.code, code)) {
    // Count the failed attempt; invalidate the code after too many guesses so a
    // 6-digit code can't be brute-forced within its validity window.
    entry.attempts += 1
    if (entry.attempts >= MAX_ATTEMPTS) {
      await be.del(key)
    } else {
      await be.update(key, entry)
    }
    return false
  }

  // Code is valid, remove it (one-time use)
  await be.del(key)
  return true
}

export async function clearMfaCode(userId: string, method: "SMS" | "EMAIL"): Promise<void> {
  const be = await backend()
  await be.del(keyFor(userId, method))
}
