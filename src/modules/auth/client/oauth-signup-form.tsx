"use client"

import { useActionState, useState } from "react"
import { useTranslation } from "react-i18next"
import { Mail, User, Building2 } from "lucide-react"
import { AuthCard } from "./auth-card"
import { Button } from "@/components/ui/button"
import { CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FormErrorDisplay } from "@/components/shared/form-error-display"
import { completeOAuthSignupAction } from "@/app/(auth)/register/oauth/actions"
import type { OAuthProviderId } from "./oauth-buttons"

interface OAuthSignupFormProps {
  email: string
  name: string
  provider: OAuthProviderId
}

const PROVIDER_NAMES: Record<OAuthProviderId, string> = {
  google: "Google",
  github: "GitHub",
}

/**
 * Last step of signing up with Google / GitHub: the provider supplied the
 * (verified) email, the user confirms their name and picks a company name.
 */
export function OAuthSignupForm({ email, name: initialName, provider }: OAuthSignupFormProps) {
  const { t } = useTranslation()
  const [state, formAction, isPending] = useActionState(completeOAuthSignupAction, null)
  const [name, setName] = useState(initialName)
  const [companyName, setCompanyName] = useState("")

  return (
    <AuthCard
      title={t("auth.oauthSignup.title", "Finish creating your account")}
      description={t("auth.oauthSignup.description", "Signed in with {{provider}}. Choose a name for your company to continue.", {
        provider: PROVIDER_NAMES[provider],
      })}
    >
      <CardContent>
        <form action={formAction} id="oauth-signup-form" className="space-y-4">
          <FormErrorDisplay error={state?.error} />

          <div className="space-y-2">
            <Label htmlFor="oauth-email">{t("auth.email")}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input id="oauth-email" type="email" value={email} readOnly disabled className="pl-10" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="oauth-name">{t("users.fullName")}</Label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="oauth-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("auth.namePlaceholder")}
                className="pl-10"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="oauth-company">{t("auth.companyName")}</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="oauth-company"
                name="companyName"
                type="text"
                autoComplete="organization"
                required
                minLength={2}
                value={companyName}
                onChange={(e) =>
                  // Lowercase, with spaces and special characters turned into hyphens
                  setCompanyName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"))
                }
                placeholder={t("auth.companyNamePlaceholder")}
                className="pl-10"
                disabled={isPending}
              />
            </div>
            <p className="text-sm text-muted-foreground">{t("auth.companyNameDescription")}</p>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col space-y-4">
        <Button type="submit" className="w-full" disabled={isPending} form="oauth-signup-form">
          {isPending ? t("auth.signingUp") : t("auth.createAccount")}
        </Button>
        <a href="/register" className="text-sm text-muted-foreground hover:text-primary hover:underline">
          {t("auth.oauthSignup.useDifferent", "Use a different sign-up method")}
        </a>
      </CardFooter>
    </AuthCard>
  )
}
