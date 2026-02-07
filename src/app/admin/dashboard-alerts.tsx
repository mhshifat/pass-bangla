"use client"

import { trpc } from "@/trpc/client"
import { SecurityAlerts, SecurityAlertsSkeleton } from "@/modules/dashboard/client"

export function DashboardAlerts() {
  const { data: alerts, isLoading } = trpc.dashboard.securityAlerts.useQuery(undefined, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  if (isLoading) {
    return <SecurityAlertsSkeleton />
  }

  return <SecurityAlerts alerts={alerts || []} />
}


