import { HydrationBoundary } from "@tanstack/react-query"
import { MfaSettings } from "@/modules/settings/client"
import { MfaSettingsPageHeader } from "./mfa-settings-page-header"
import { prefetchMfaSettingsData } from "@/modules/settings/server/prefetch"

export default async function MfaSettingsPage() {
  const dehydratedState = await prefetchMfaSettingsData()

  return (
    <HydrationBoundary state={dehydratedState}>
      <div className="p-6 space-y-6">
        <MfaSettingsPageHeader />
        <MfaSettings />
      </div>
    </HydrationBoundary>
  )
}
