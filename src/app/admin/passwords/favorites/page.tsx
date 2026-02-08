import { Suspense } from "react"
import { HydrationBoundary } from "@tanstack/react-query"
import { FavoritesPageClient } from "./favorites-page-client"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { prefetchFavoritesData } from "@/modules/passwords/server/prefetch"

interface FavoritesPageProps {
  searchParams: Promise<{
    page?: string
    search?: string
  }>
}

export default async function FavoritesPage({ searchParams }: FavoritesPageProps) {
  const params = await searchParams
  const currentPage = Number(params.page) || 1
  const search = params.search || undefined

  // Prefetch favorites data on the server to avoid exposing sensitive data in client API calls
  const dehydratedState = await prefetchFavoritesData({
    page: currentPage,
    pageSize: 20,
    search,
  })

  return (
    <HydrationBoundary state={dehydratedState}>
      <div className="p-6 space-y-6">
        <Suspense fallback={<FavoritesPageSkeleton />}>
          <FavoritesPageClient />
        </Suspense>
      </div>
    </HydrationBoundary>
  )
}

function FavoritesPageSkeleton() {
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
