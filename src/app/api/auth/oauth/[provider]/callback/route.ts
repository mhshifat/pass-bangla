import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import {
  OAUTH_SIGNUP_COOKIE,
  OAUTH_STATE_COOKIE,
  OAuthEmailError,
  createHandoffToken,
  extensionResultUrl,
  fetchOAuthProfile,
  parseExtensionRedirect,
  finishUrl,
  getRequestOrigin,
  isOAuthProvider,
  linkOAuthAccount,
  signPendingSignup,
  signupCookieOptions,
  stateCookieOptions,
  subdomainOrigin,
  verifyState,
} from "@/lib/oauth"

export const runtime = "nodejs"

/**
 * Step 2: the provider sends the user back here (main domain).
 * Works out which account the provider identity belongs to, then hands over to
 * that company's subdomain — or to the "finish signing up" page for a new user.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const origin = getRequestOrigin(req.headers)
  const state = await verifyState(req.cookies.get(OAUTH_STATE_COOKIE)?.value)

  // Where a failure is shown: the company's login page if we know the company
  // The extension redirect comes from the signed state only, never from this request's query
  const extRedirect = state?.client === "extension" ? parseExtensionRedirect(state.extRedirect) : null

  const fail = (error: string) => {
    if (extRedirect) {
      const response = NextResponse.redirect(extensionResultUrl(extRedirect, { error }))
      response.cookies.set(OAUTH_STATE_COOKIE, "", { ...stateCookieOptions, maxAge: 0 })
      return response
    }
    const base = state?.company ? subdomainOrigin(origin, state.company) : origin.mainOrigin
    const response = NextResponse.redirect(new URL(`/login?oauth_error=${error}`, base))
    response.cookies.set(OAUTH_STATE_COOKIE, "", { ...stateCookieOptions, maxAge: 0 })
    return response
  }

  const code = req.nextUrl.searchParams.get("code")
  if (req.nextUrl.searchParams.get("error")) return fail("cancelled")
  if (
    !isOAuthProvider(provider) ||
    !state ||
    state.provider !== provider ||
    !code ||
    req.nextUrl.searchParams.get("state") !== state.state
  ) {
    return fail("invalid_state")
  }

  let profile
  try {
    profile = await fetchOAuthProfile(provider, code, origin, state.nonce)
  } catch (error) {
    if (error instanceof OAuthEmailError) return fail("unverified_email")
    console.error(`[oauth] ${provider} sign-in failed:`, error)
    return fail("provider_failed")
  }

  const userSelect = {
    id: true,
    companyId: true,
    company: { select: { subdomain: true } },
  } as const
  const emailMatch = { equals: profile.email, mode: "insensitive" } as const

  let user: { id: string; companyId: string | null; company: { subdomain: string } | null } | null = null

  if (state.company) {
    // Signing in to a specific company: the account must exist there
    const company = await prisma.company.findUnique({
      where: { subdomain: state.company },
      select: { id: true },
    })
    if (!company) return fail("no_account")

    user = await prisma.user.findFirst({
      where: {
        companyId: company.id,
        OR: [
          { email: emailMatch },
          { accounts: { some: { provider, providerAccountId: profile.providerAccountId } } },
        ],
      },
      select: userSelect,
    })
    if (!user) return fail("no_account")
  } else {
    // Main domain: find the account by its provider link, then by email
    const linked = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId } },
      select: { user: { select: userSelect } },
    })
    user = linked?.user ?? null

    if (!user) {
      const matches = await prisma.user.findMany({
        where: { email: emailMatch },
        select: userSelect,
        take: 2,
      })
      if (matches.length > 1) return fail("multiple_companies")
      user = matches[0] ?? null
    }
  }

  // Registration stays on the web
  if (!user && extRedirect) return fail("no_account")

  if (!user) {
    // New here: keep the confirmed identity and ask for a company name
    const response = NextResponse.redirect(new URL("/register/oauth", origin.mainOrigin))
    response.cookies.set(OAUTH_STATE_COOKIE, "", { ...stateCookieOptions, maxAge: 0 })
    response.cookies.set(
      OAUTH_SIGNUP_COOKIE,
      await signPendingSignup({
        provider,
        providerAccountId: profile.providerAccountId,
        email: profile.email,
        name: profile.name,
      }),
      signupCookieOptions
    )
    return response
  }

  if (!user.company?.subdomain) return fail("no_account")

  await linkOAuthAccount(user.id, provider, profile.providerAccountId)
  const token = await createHandoffToken(user.id, user.companyId, provider, extRedirect ? "extension" : "web")

  const response = NextResponse.redirect(
    extRedirect ? extensionResultUrl(extRedirect, { token }) : finishUrl(origin, user.company.subdomain, token)
  )
  response.cookies.set(OAUTH_STATE_COOKIE, "", { ...stateCookieOptions, maxAge: 0 })
  return response
}
