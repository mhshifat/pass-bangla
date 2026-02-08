import { Suspense } from "react"
import { HydrationBoundary } from "@tanstack/react-query"
import { ReportsContent, ReportsSkeleton } from "@/modules/reports/client"
import { prefetchReportsData } from "@/modules/reports/server/prefetch"

export default async function ReportsPage() {
  const dehydratedState = await prefetchReportsData()

  return (
    <HydrationBoundary state={dehydratedState}>
      <Suspense fallback={<ReportsSkeleton />}>
        <ReportsContent />
      </Suspense>
    </HydrationBoundary>
  )
}



