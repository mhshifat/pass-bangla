import { Suspense } from "react"
import { HydrationBoundary } from "@tanstack/react-query"
import { InsightsContent } from "@/modules/insights/client/insights-content"
import { InsightsSkeleton } from "@/modules/insights/client/insights-skeleton"
import { prefetchInsightsData } from "@/modules/insights/server/prefetch"

export default async function InsightsPage() {
  const dehydratedState = await prefetchInsightsData()

  return (
    <HydrationBoundary state={dehydratedState}>
      <Suspense fallback={<InsightsSkeleton />}>
        <InsightsContent />
      </Suspense>
    </HydrationBoundary>
  )
}

