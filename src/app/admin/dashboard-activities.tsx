"use client"

import { trpc } from "@/trpc/client"
import { RecentActivities, RecentActivitiesSkeleton } from "@/modules/dashboard/client"

export function DashboardActivities() {
  const { data: activities, isLoading } = trpc.dashboard.recentActivities.useQuery()

  if (isLoading) {
    return <RecentActivitiesSkeleton />
  }

  return <RecentActivities activities={activities || []} />
}


