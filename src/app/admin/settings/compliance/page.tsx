import { HydrationBoundary } from "@tanstack/react-query"
import { prefetchComplianceSettingsData } from "@/modules/settings/server/prefetch"
import { ComplianceSettingsPageContent } from "./compliance-settings-content"

export default async function ComplianceSettingsPage() {
  const dehydratedState = await prefetchComplianceSettingsData()
  
  return (
    <HydrationBoundary state={dehydratedState}>
      <ComplianceSettingsPageContent />
    </HydrationBoundary>
  )
}


