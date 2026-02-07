"use client"

import { trpc } from "@/trpc/client"
import { RecentActivities, RecentActivitiesSkeleton } from "@/modules/dashboard/client"

export function DashboardActivities() {
  const { data: activities, isLoading } = trpc.dashboard.recentActivities.useQuery(undefined, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  if (isLoading) {
    return <RecentActivitiesSkeleton />
  }

  return <RecentActivities activities={activities || []} />
}


