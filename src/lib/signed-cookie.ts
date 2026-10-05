import "server-only"

import { cookies } from "next/headers"
import { SignJWT, jwtVerify } from "jose"

const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET || "default-secret-change-in-production"
)

/**
 * Short-lived signed httpOnly cookies, used to carry challenge state across
 * serverless instances (WebAuthn challenges) instead of per-instance memory.
 */
export async function setSignedCookie(
  name: string,
  payload: Record<string, unknown>,
  ttlSeconds: number
): Promise<void> {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(name)
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret)

  const cookieStore = await cookies()
  cookieStore.set(name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ttlSeconds,
    path: "/",
  })
}

/** Read and clear a signed cookie. Returns null when missing, expired or tampered with. */
export async function takeSignedCookie<T extends Record<string, unknown>>(name: string): Promise<T | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(name)?.value
  if (!token) return null
  cookieStore.delete(name)
  try {
    const { payload } = await jwtVerify(token, secret, { audience: name })
    return payload as T
  } catch {
    return null
  }
}
