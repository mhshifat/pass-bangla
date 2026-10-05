import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { OAUTH_SIGNUP_COOKIE, verifyPendingSignup } from "@/lib/oauth"
import { OAuthSignupForm } from "@/modules/auth/client/oauth-signup-form"

export default async function OAuthSignupPage() {
  const cookieStore = await cookies()
  const pending = await verifyPendingSignup(cookieStore.get(OAUTH_SIGNUP_COOKIE)?.value)

  // Nothing to finish (opened directly, or the 15 minute window passed)
  if (!pending) {
    redirect("/register")
  }

  return <OAuthSignupForm email={pending.email} name={pending.name} provider={pending.provider} />
}
