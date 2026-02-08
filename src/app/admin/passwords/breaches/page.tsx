import { Suspense } from "react"
import { HydrationBoundary } from "@tanstack/react-query"
import { BreachesPageClient } from "./breaches-page-client"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { prefetchBreachesData } from "@/modules/passwords/server/prefetch"

export default async function BreachesPage() {
  const dehydratedState = await prefetchBreachesData()

  return (
    <HydrationBoundary state={dehydratedState}>
      <div className="p-6 space-y-6">
        <Suspense fallback={<BreachesPageSkeleton />}>
          <BreachesPageClient />
        </Suspense>
      </div>
    </HydrationBoundary>
  )
}

function BreachesPageSkeleton() {
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
