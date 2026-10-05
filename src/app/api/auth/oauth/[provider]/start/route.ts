import { NextRequest, NextResponse } from "next/server"
import {
  OAUTH_STATE_COOKIE,
  buildAuthorizeUrl,
  extensionResultUrl,
  getEnabledOAuthProviders,
  parseExtensionRedirect,
  getRequestOrigin,
  isOAuthProvider,
  isOnMainOrigin,
  normalizeCompany,
  randomToken,
  signState,
  stateCookieOptions,
  type OAuthState,
} from "@/lib/oauth"

export const runtime = "nodejs"

/**
 * Step 1: send the browser to Google / GitHub.
 * Always runs on the main domain — a request arriving on a company subdomain is
 * bounced there first, carrying the company along.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const origin = getRequestOrigin(req.headers)

  // Browser extension: the result goes back to its own redirect URL, which must pass the strict check
  const isExtension = req.nextUrl.searchParams.get("client") === "extension"
  const extRedirect = isExtension ? parseExtensionRedirect(req.nextUrl.searchParams.get("ext_redirect")) : null
  if (isExtension && !extRedirect) {
    return NextResponse.json({ error: "invalid_ext_redirect" }, { status: 400 })
  }

  if (!isOAuthProvider(provider) || !getEnabledOAuthProviders().includes(provider)) {
    return NextResponse.redirect(
      extRedirect
        ? extensionResultUrl(extRedirect, { error: "provider_failed" })
        : new URL("/login?oauth_error=unavailable", `${origin.protocol}://${origin.host}`)
    )
  }

  const intent = !isExtension && req.nextUrl.searchParams.get("intent") === "register" ? "register" : "login"
  const company = origin.subdomain ?? normalizeCompany(req.nextUrl.searchParams.get("company"))

  if (!isOnMainOrigin(origin)) {
    const url = new URL(`/api/auth/oauth/${provider}/start`, origin.mainOrigin)
    url.searchParams.set("intent", intent)
    if (company) url.searchParams.set("company", company)
    if (extRedirect) {
      url.searchParams.set("client", "extension")
      url.searchParams.set("ext_redirect", extRedirect)
    }
    return NextResponse.redirect(url)
  }

  const state: OAuthState = {
    state: randomToken(),
    nonce: randomToken(),
    provider,
    intent,
    company,
    ...(extRedirect ? { client: "extension" as const, extRedirect } : {}),
  }
  const authorizeUrl = buildAuthorizeUrl(provider, origin, state)
  if (!authorizeUrl) {
    return NextResponse.redirect(
      extRedirect
        ? extensionResultUrl(extRedirect, { error: "provider_failed" })
        : new URL("/login?oauth_error=unavailable", origin.mainOrigin)
    )
  }

  const response = NextResponse.redirect(authorizeUrl)
  response.cookies.set(OAUTH_STATE_COOKIE, await signState(state), stateCookieOptions)
  return response
}
