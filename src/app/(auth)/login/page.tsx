import { LoginForm } from "@/modules/auth/client/login-form"
import { LoginPageHeader } from "./login-page-header"
import { headers } from "next/headers"
import { getEnabledOAuthProviders } from "@/lib/oauth"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ oauth_error?: string }>
}) {
  const headersList = await headers()
  const subdomain = headersList.get("x-subdomain") || ""
  const isMainDomain = subdomain.length === 0
  const { oauth_error: oauthError } = await searchParams

  return (
    <LoginPageHeader>
      <LoginForm
        isMainDomain={isMainDomain}
        oauthProviders={getEnabledOAuthProviders()}
        oauthError={typeof oauthError === "string" ? oauthError : null}
      />
    </LoginPageHeader>
  )
}
