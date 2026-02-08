import { HydrationBoundary } from "@tanstack/react-query"
import { prefetchGeneralSettingsData } from "@/modules/settings/server/prefetch"
import { GeneralSettingsPageContent } from "./general-settings-content"

export default async function GeneralSettingsPage() {
  const dehydratedState = await prefetchGeneralSettingsData()
  
  return (
    <HydrationBoundary state={dehydratedState}>
      <GeneralSettingsPageContent />
    </HydrationBoundary>
  )
}
