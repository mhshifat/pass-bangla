"use client"

import { useTranslation } from "react-i18next"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FormErrorDisplay } from "@/components/shared/form-error-display"

export function MfaSetupAlert({ error, success }: { error: string | null; success: boolean }) {
  const { t } = useTranslation()
  
  if (error) return <FormErrorDisplay error={error} />
  if (success)
    return (
      <Alert>
        <AlertDescription>{t("mfa.setupComplete")}</AlertDescription>
      </Alert>
    )
  return null
}
