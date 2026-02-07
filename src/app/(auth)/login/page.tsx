import { LoginForm } from "@/modules/auth/client/login-form"
import { LoginPageHeader } from "./login-page-header"
import { headers } from "next/headers"

export default async function LoginPage() {
  const headersList = await headers()
  const subdomain = headersList.get("x-subdomain") || ""
  const isMainDomain = subdomain.length === 0

  return (
    <LoginPageHeader>
      <LoginForm isMainDomain={isMainDomain} />
    </LoginPageHeader>
  )
}
