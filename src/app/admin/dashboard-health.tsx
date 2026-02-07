"use client"

import { trpc } from "@/trpc/client"
import { SystemHealth, SystemHealthSkeleton } from "@/modules/dashboard/client"

export function DashboardHealth() {
  const { data: metrics, isLoading } = trpc.dashboard.healthMetrics.useQuery(undefined, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  if (isLoading) {
    return <SystemHealthSkeleton />
  }

  return <SystemHealth metrics={metrics || []} />
}


