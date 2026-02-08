import { HydrationBoundary } from "@tanstack/react-query"
import {
  SecuritySettings,
  ThreatDetectionSettings,
  ThreatEventsViewer,
  PasswordPolicySettings,
} from "@/modules/settings/client"
import { IpWhitelistManagement } from "@/modules/settings/client/ip-whitelist-management"
import { SecuritySettingsPageHeader } from "./security-settings-page-header"
import { prefetchSecuritySettingsData } from "@/modules/settings/server/prefetch"

export default async function SecuritySettingsPage() {
  const dehydratedState = await prefetchSecuritySettingsData()

  return (
    <HydrationBoundary state={dehydratedState}>
      <div className="p-6 space-y-6">
        <SecuritySettingsPageHeader />
        <PasswordPolicySettings />
        <SecuritySettings />
        <IpWhitelistManagement />
        <ThreatDetectionSettings />
        <ThreatEventsViewer />
      </div>
    </HydrationBoundary>
  )
}
