import { RegisterForm } from "@/modules/auth/client/register-form"
import { RegisterPageHeader } from "./register-page-header"
import { getEnabledOAuthProviders } from "@/lib/oauth"

export default function RegisterPage() {
  return (
    <RegisterPageHeader>
      <RegisterForm oauthProviders={getEnabledOAuthProviders()} />
    </RegisterPageHeader>
  )
}
