import { Suspense } from "react"
import { HydrationBoundary } from "@tanstack/react-query"
import { TemplatesPageClient } from "./templates-page-client"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { prefetchTemplatesData } from "@/modules/passwords/server/prefetch"

export default async function TemplatesPage() {
  const dehydratedState = await prefetchTemplatesData()

  return (
    <HydrationBoundary state={dehydratedState}>
      <div className="p-6 space-y-6">
        <Suspense fallback={<TemplatesPageSkeleton />}>
          <TemplatesPageClient />
        </Suspense>
      </div>
    </HydrationBoundary>
  )
}

function TemplatesPageSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
