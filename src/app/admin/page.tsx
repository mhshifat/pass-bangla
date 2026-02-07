import { DashboardContent } from "./dashboard-content"
import { prefetchDashboardData } from "@/trpc/server-prefetch"
import { HydrationBoundary } from "@tanstack/react-query"

export default async function AdminDashboard() {
  const dehydratedState = await prefetchDashboardData()
  
  return (
    <HydrationBoundary state={dehydratedState}>
      <DashboardContent />
    </HydrationBoundary>
  )
}
