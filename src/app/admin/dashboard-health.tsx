"use client"

import { trpc } from "@/trpc/client"
import { SystemHealth, SystemHealthSkeleton } from "@/modules/dashboard/client"

export function DashboardHealth() {
  const { data: metrics, isLoading } = trpc.dashboard.healthMetrics.useQuery()

  if (isLoading) {
    return <SystemHealthSkeleton />
  }

  return <SystemHealth metrics={metrics || []} />
}


