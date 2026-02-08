"use client"

import { ComplianceSettings } from "@/modules/settings/client"
import { useTranslation } from "react-i18next"

export function ComplianceSettingsPageContent() {
  const { t } = useTranslation()
  
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("settings.compliance.title")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("settings.compliance.description")}
        </p>
      </div>

      <ComplianceSettings />
    </div>
  )
}
