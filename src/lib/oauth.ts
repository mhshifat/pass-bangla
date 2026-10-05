import "server-only"

import { createHash, randomBytes } from "crypto"
import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose"
import prisma from "@/lib/prisma"

/**
 * Social sign-in (Google, GitHub).
 *
 * The provider only redirects back to ONE fixed address, so the whole provider
 * round trip happens on the main domain. The app itself lives on the company
 * subdomain and its session cookie is host-only, so after the provider confirms
 * who the user is we hand over to the subdomain with a single-use, 60 second
 * token and create the real session there (see /api/auth/oauth/finish).
 */

export const OAUTH_PROVIDERS = ["google", "github"] as const
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]
export type OAuthIntent = "login" | "register"

export const OAUTH_STATE_COOKIE = "pb_oauth_state"
export const OAUTH_SIGNUP_COOKIE = "pb_oauth_signup"

const STATE_TTL_SECONDS = 10 * 60
const SIGNUP_TTL_SECONDS = 15 * 60
const HANDOFF_TTL_SECONDS = 60
const HANDOFF_SESSION_PREFIX = "oauth-handoff:"

const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET || "default-secret-change-in-production"
)

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value)
}

function providerCredentials(provider: OAuthProvider): { clientId: string; clientSecret: string } | null {
  const clientId = provider === "google" ? process.env.GOOGLE_CLIENT_ID : process.env.GITHUB_CLIENT_ID
  const clientSecret = provider === "google" ? process.env.GOOGLE_CLIENT_SECRET : process.env.GITHUB_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

/** Providers that have credentials configured — only these get a button */
export function getEnabledOAuthProviders(): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter((provider) => providerCredentials(provider) !== null)
}

// ── Hosts ────────────────────────────────────────────────────────────────

export interface RequestOrigin {
  protocol: string // "https"
  host: string // host as requested, including port
  baseDomain: string // "passbangla.com" / "localhost:3000"
  subdomain: string | null
  /** Origin the provider redirects back to */
  mainOrigin: string
}

export function getRequestOrigin(headersList: Headers): RequestOrigin {
  const host = headersList.get("x-forwarded-host") || headersList.get("host") || "localhost:3000"
  const protocol =
    headersList.get("x-forwarded-proto")?.split(",")[0].trim() ||
    (process.env.NODE_ENV === "production" ? "https" : "http")

  const [hostname, port] = host.split(":")
  const parts = hostname.split(".")
  const isLocalhost = hostname.endsWith("localhost")

  let subdomain: string | null = null
  let baseHostname = hostname
  if (isLocalhost) {
    if (parts.length >= 2) {
      subdomain = parts[0]
      baseHostname = "localhost"
    }
  } else if (parts.length >= 3) {
    baseHostname = parts.slice(-2).join(".")
    if (parts[0] !== "www") subdomain = parts[0]
  }

  const baseDomain = port ? `${baseHostname}:${port}` : baseHostname
  // On the main domain, keep exactly the host the user is on (www or apex) so the
  // state cookie and the provider callback land on the same host.
  const configured = process.env.OAUTH_BASE_URL?.replace(/\/$/, "")
  const mainOrigin = configured || (subdomain ? `${protocol}://${baseDomain}` : `${protocol}://${host}`)

  return { protocol, host, baseDomain, subdomain, mainOrigin }
}

export function isOnMainOrigin(origin: RequestOrigin): boolean {
  return !origin.subdomain && `${origin.protocol}://${origin.host}` === origin.mainOrigin
}

export function subdomainOrigin(origin: RequestOrigin, subdomain: string): string {
  return `${origin.protocol}://${subdomain}.${origin.baseDomain}`
}

export function callbackUrl(origin: RequestOrigin, provider: OAuthProvider): string {
  return `${origin.mainOrigin}/api/auth/oauth/${provider}/callback`
}

export function normalizeCompany(value: string | null | undefined): string | null {
  const company = (value || "").trim().toLowerCase()
  return /^[a-z0-9-]{2,63}$/.test(company) ? company : null
}

// ── Signed, short-lived tokens ───────────────────────────────────────────

async function sign(payload: Record<string, unknown>, audience: string, ttlSeconds: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret)
}

async function verify<T>(token: string | undefined | null, audience: string): Promise<T | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret, { audience })
    return payload as unknown as T
  } catch {
    return null
  }
}

export type OAuthClient = "web" | "extension"

export interface OAuthState {
  state: string
  nonce: string
  provider: OAuthProvider
  intent: OAuthIntent
  company: string | null
  /** Who started the flow; missing on states signed before the extension existed (= web) */
  client?: OAuthClient
  /** Validated browser-extension redirect, only set when client is "extension" */
  extRedirect?: string | null
}

/**
 * The only places a browser extension can receive the result: the identity API
 * redirect hosts of Chrome/Edge (32 chars, a-p) and Firefox. Anything else would
 * turn the handoff token into an open redirect, so this is strict and returns a
 * normalized URL without query or fragment.
 */
export function parseExtensionRedirect(value: string | null | undefined): string | null {
  if (!value || value.length > 512) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null
  const chrome = /^[a-p]{32}\.chromiumapp\.org$/.test(url.hostname)
  const firefox = /^[a-z0-9]{8,64}\.extensions\.allizom\.org$/.test(url.hostname)
  if (!chrome && !firefox) return null
  return `https://${url.hostname}${url.pathname}`
}

/** Result of the flow for the extension: back to its redirect URL with ?token= or ?error= */
export function extensionResultUrl(extRedirect: string, result: { token: string } | { error: string }): string {
  const url = new URL(extRedirect)
  if ("token" in result) url.searchParams.set("token", result.token)
  else url.searchParams.set("error", result.error)
  return url.toString()
}

export const stateCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth/oauth",
  maxAge: STATE_TTL_SECONDS,
}

export const signupCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SIGNUP_TTL_SECONDS,
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url")
}

export const signState = (state: OAuthState) => sign({ ...state }, "pb-oauth-state", STATE_TTL_SECONDS)
export const verifyState = (token: string | undefined | null) => verify<OAuthState>(token, "pb-oauth-state")

/** Identity confirmed by the provider, waiting for the user to pick a company name */
export interface PendingOAuthSignup {
  provider: OAuthProvider
  providerAccountId: string
  email: string
  name: string
}

export const signPendingSignup = (signup: PendingOAuthSignup) =>
  sign({ ...signup }, "pb-oauth-signup", SIGNUP_TTL_SECONDS)
export const verifyPendingSignup = (token: string | undefined | null) =>
  verify<PendingOAuthSignup>(token, "pb-oauth-signup")

// ── Provider round trip ──────────────────────────────────────────────────

export interface OAuthProfile {
  providerAccountId: string
  email: string
  name: string
}

export function buildAuthorizeUrl(
  provider: OAuthProvider,
  origin: RequestOrigin,
  state: OAuthState
): string | null {
  const credentials = providerCredentials(provider)
  if (!credentials) return null

  if (provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    url.searchParams.set("client_id", credentials.clientId)
    url.searchParams.set("redirect_uri", callbackUrl(origin, provider))
    url.searchParams.set("response_type", "code")
    url.searchParams.set("scope", "openid email profile")
    url.searchParams.set("state", state.state)
    url.searchParams.set("nonce", state.nonce)
    url.searchParams.set("prompt", "select_account")
    return url.toString()
  }

  const url = new URL("https://github.com/login/oauth/authorize")
  url.searchParams.set("client_id", credentials.clientId)
  url.searchParams.set("redirect_uri", callbackUrl(origin, provider))
  url.searchParams.set("scope", "read:user user:email")
  url.searchParams.set("state", state.state)
  return url.toString()
}

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"))

async function fetchGoogleProfile(code: string, origin: RequestOrigin, nonce: string): Promise<OAuthProfile> {
  const credentials = providerCredentials("google")!
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: callbackUrl(origin, "google"),
      grant_type: "authorization_code",
    }),
  })
  const tokens = (await tokenResponse.json().catch(() => null)) as { id_token?: string } | null
  if (!tokenResponse.ok || !tokens?.id_token) {
    throw new Error("Google token exchange failed")
  }

  const { payload } = await jwtVerify(tokens.id_token, googleJwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: credentials.clientId,
  })
  if (payload.nonce !== nonce) throw new Error("Google nonce mismatch")
  if (!payload.sub || typeof payload.email !== "string" || payload.email_verified !== true) {
    throw new OAuthEmailError()
  }

  return {
    providerAccountId: payload.sub,
    email: payload.email.toLowerCase(),
    name: typeof payload.name === "string" && payload.name ? payload.name : payload.email.split("@")[0],
  }
}

async function fetchGithubProfile(code: string, origin: RequestOrigin): Promise<OAuthProfile> {
  const credentials = providerCredentials("github")!
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code,
      redirect_uri: callbackUrl(origin, "github"),
    }),
  })
  const tokens = (await tokenResponse.json().catch(() => null)) as { access_token?: string } | null
  if (!tokenResponse.ok || !tokens?.access_token) {
    throw new Error("GitHub token exchange failed")
  }

  const apiHeaders = {
    Authorization: `Bearer ${tokens.access_token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "PassBangla",
  }
  const [userResponse, emailsResponse] = await Promise.all([
    fetch("https://api.github.com/user", { headers: apiHeaders }),
    fetch("https://api.github.com/user/emails", { headers: apiHeaders }),
  ])
  if (!userResponse.ok || !emailsResponse.ok) throw new Error("GitHub profile request failed")

  const user = (await userResponse.json()) as { id?: number; login?: string; name?: string | null }
  const emails = (await emailsResponse.json()) as Array<{ email: string; primary: boolean; verified: boolean }>
  // Only a verified address proves the person owns the email we match accounts on
  const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) : undefined
  if (!user.id || !primary) throw new OAuthEmailError()

  return {
    providerAccountId: String(user.id),
    email: primary.email.toLowerCase(),
    name: user.name || user.login || primary.email.split("@")[0],
  }
}

/** The provider account has no verified email address */
export class OAuthEmailError extends Error {
  constructor() {
    super("No verified email on provider account")
  }
}

export async function fetchOAuthProfile(
  provider: OAuthProvider,
  code: string,
  origin: RequestOrigin,
  nonce: string
): Promise<OAuthProfile> {
  return provider === "google" ? fetchGoogleProfile(code, origin, nonce) : fetchGithubProfile(code, origin)
}

// ── Account links ────────────────────────────────────────────────────────

export async function linkOAuthAccount(userId: string, provider: OAuthProvider, providerAccountId: string) {
  try {
    await prisma.account.upsert({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      update: {},
      create: { userId, type: "oauth", provider, providerAccountId },
    })
  } catch (error) {
    // Linking is a convenience (it survives an email change); never block sign-in on it
    console.warn("Failed to link OAuth account:", error)
  }
}

// ── Handoff to the company subdomain ─────────────────────────────────────

interface HandoffPayload {
  uid: string
  nonce: string
  provider: OAuthProvider
  client?: OAuthClient
}

const handoffKey = (nonce: string) =>
  HANDOFF_SESSION_PREFIX + createHash("sha256").update(nonce).digest("hex")

/**
 * Creates the single-use token that lets the subdomain start a session for `userId`.
 * The matching placeholder row is what makes it single-use: it can never act as a
 * session itself (it is not a signed session token) and is deleted when redeemed.
 */
export async function createHandoffToken(
  userId: string,
  companyId: string | null,
  provider: OAuthProvider,
  client: OAuthClient = "web"
): Promise<string> {
  const nonce = randomToken()
  await prisma.session.create({
    data: {
      sessionToken: handoffKey(nonce),
      userId,
      companyId,
      expires: new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000),
      deviceName: "Sign-in in progress",
    },
  })
  return sign({ uid: userId, nonce, provider, client }, "pb-oauth-handoff", HANDOFF_TTL_SECONDS)
}

/** A token only redeems for the kind of client it was minted for (checked before it is consumed) */
export async function redeemHandoffToken(
  token: string | null,
  client: OAuthClient = "web"
): Promise<{ userId: string; provider: OAuthProvider } | null> {
  const payload = await verify<HandoffPayload>(token, "pb-oauth-handoff")
  if (!payload?.uid || !payload.nonce) return null
  if ((payload.client ?? "web") !== client) return null

  const redeemed = await prisma.session.deleteMany({
    where: {
      sessionToken: handoffKey(payload.nonce),
      userId: payload.uid,
      expires: { gt: new Date() },
    },
  })
  if (redeemed.count !== 1) return null

  return { userId: payload.uid, provider: payload.provider }
}

export function finishUrl(origin: RequestOrigin, subdomain: string, token: string): string {
  return `${subdomainOrigin(origin, subdomain)}/api/auth/oauth/finish?token=${encodeURIComponent(token)}`
}
