import { Suspense } from "react"
import { HydrationBoundary } from "@tanstack/react-query"
import { MfaCredentialsSettings, MfaCredentialsSettingsSkeleton } from "@/modules/settings/client"
import { MfaCredentialsPageHeader } from "./mfa-credentials-page-header"
import { prefetchMfaCredentialsData } from "@/modules/settings/server/prefetch"

export default async function MfaCredentialsSettingsPage() {
  const dehydratedState = await prefetchMfaCredentialsData()

  return (
    <HydrationBoundary state={dehydratedState}>
      <div className="p-6 space-y-6">
        <MfaCredentialsPageHeader />
        <Suspense fallback={<MfaCredentialsSettingsSkeleton />}>
          <MfaCredentialsSettings />
        </Suspense>
      </div>
    </HydrationBoundary>
  )
}
