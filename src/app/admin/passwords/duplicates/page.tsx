import { Suspense } from "react"
import { HydrationBoundary } from "@tanstack/react-query"
import { DuplicatesPageClient } from "./duplicates-page-client"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { prefetchDuplicatesData } from "@/modules/passwords/server/prefetch"

export default async function DuplicatesPage() {
  const dehydratedState = await prefetchDuplicatesData()

  return (
    <HydrationBoundary state={dehydratedState}>
      <div className="p-6 space-y-6">
        <Suspense fallback={<DuplicatesPageSkeleton />}>
          <DuplicatesPageClient />
        </Suspense>
      </div>
    </HydrationBoundary>
  )
}

function DuplicatesPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
