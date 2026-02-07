"use client"

import { useTranslation } from "react-i18next"
import { trpc } from "@/trpc/client"
import { StatsCards } from "@/modules/dashboard/client"

export function DashboardStats() {
  const { t } = useTranslation()
  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  if (!stats) {
    return null
  }

  const statsData = [
    {
      name: t("dashboard.totalUsers"),
      value: stats.users.total.toLocaleString(),
      change: stats.users.change,
      changeType: stats.users.changeType,
      icon: "Users",
    },
    {
      name: t("dashboard.activePasswords"),
      value: stats.passwords.total.toLocaleString(),
      change: stats.passwords.change,
      changeType: stats.passwords.changeType,
      icon: "Lock",
    },
    {
      name: t("dashboard.teams"),
      value: stats.teams.total.toLocaleString(),
      change: stats.teams.change,
      changeType: stats.teams.changeType,
      icon: "Shield",
    },
    {
      name: t("dashboard.securityEvents"),
      value: stats.securityEvents.total.toLocaleString(),
      change: stats.securityEvents.change,
      changeType: stats.securityEvents.changeType,
      icon: "AlertTriangle",
    },
  ]

  return <StatsCards stats={statsData} />
}


