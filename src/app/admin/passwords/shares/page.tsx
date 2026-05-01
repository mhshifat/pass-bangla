import { Suspense } from "react"
import { HydrationBoundary } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { prefetchSharesData } from "@/modules/passwords/server/prefetch"
import { SharesPageClient } from "./shares-page-client"

export default async function SharesPage() {
  const dehydratedState = await prefetchSharesData()

  return (
    <HydrationBoundary state={dehydratedState}>
      <div className="p-6 space-y-6">
        <Suspense fallback={<SharesPageSkeleton />}>
          <SharesPageClient />
        </Suspense>
      </div>
    </HydrationBoundary>
  )
}

function SharesPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
