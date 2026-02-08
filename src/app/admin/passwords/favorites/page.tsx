import { Suspense } from "react"
import { FavoritesPageClient } from "./favorites-page-client"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { serverTrpc } from "@/trpc/server-caller"

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

  // Fetch data on the server to avoid client-side API calls
  const trpc = await serverTrpc()
  const favoritesData = await trpc.passwords.getFavorites({ page: currentPage, pageSize: 20, search })

  return (
    <div className="p-6 space-y-6">
      <Suspense fallback={<FavoritesPageSkeleton />}>
        <FavoritesPageClient 
          initialData={favoritesData}
          initialPage={currentPage}
          initialSearch={search}
        />
      </Suspense>
    </div>
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
