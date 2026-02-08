"use client"

import { useTranslation } from "react-i18next"
import { GeneralSettings } from "@/modules/settings/client"

export function GeneralSettingsPageContent() {
  const { t } = useTranslation()
  
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("settings.generalSettings")}</h1>
        <p className="text-muted-foreground mt-1">{t("settings.generalSettingsDescription")}</p>
      </div>

      <GeneralSettings />
    </div>
  )
}
