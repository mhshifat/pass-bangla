import { FormErrorDisplay } from "@/components/shared/form-error-display"
import React from "react"

export function MfaVerifyAlert({ error }: { error: string | null }) {
  return <FormErrorDisplay error={error} />
}
