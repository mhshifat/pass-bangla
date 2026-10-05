import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getRequestMetadata } from "@/lib/audit-log"
import { getRequestOrigin, redeemHandoffToken } from "@/lib/oauth"
import { completeOAuthLogin } from "@/lib/oauth-login"

export const runtime = "nodejs"

/**
 * Step 3: runs on the company subdomain. Redeems the single-use handoff token
 * and starts the real session here, where the session cookie belongs.
 */
export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req.headers)
  const here = `${origin.protocol}://${origin.host}`
  const fail = (error: string) => NextResponse.redirect(new URL(`/login?oauth_error=${error}`, here))

  const handoff = await redeemHandoffToken(req.nextUrl.searchParams.get("token"))
  if (!handoff || !origin.subdomain) return fail("expired")

  const user = await prisma.user.findUnique({
    where: { id: handoff.userId },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      companyId: true,
      emailVerified: true,
      mfaEnabled: true,
      mfaMethod: true,
      mfaSecret: true,
      phoneNumber: true,
      company: { select: { subdomain: true } },
    },
  })

  // The token is only good on the user's own company address
  if (!user || user.company?.subdomain !== origin.subdomain) return fail("expired")

  const result = await completeOAuthLogin(user, handoff.provider, getRequestMetadata(req.headers))
  if (!result.ok) return fail(result.error)

  // The admin area sends the user on to MFA setup / verification when required
  return NextResponse.redirect(new URL("/admin", here))
}
