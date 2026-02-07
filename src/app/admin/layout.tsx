import { AdminRouteGuard } from "./admin-route-guard"
import { AdminLayoutClient } from "./admin-layout-client"
import { prefetchCurrentUser } from "@/trpc/server-prefetch"
import { HydrationBoundary } from "@tanstack/react-query"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Prefetch user data on the server to avoid client-side API calls
  const dehydratedState = await prefetchCurrentUser()
  
  return (
    <AdminRouteGuard>
      <HydrationBoundary state={dehydratedState}>
        <AdminLayoutClient>{children}</AdminLayoutClient>
      </HydrationBoundary>
    </AdminRouteGuard>
  )
}
