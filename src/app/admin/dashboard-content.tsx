"use client"

import { useTranslation } from "react-i18next"
import { DashboardStats } from "./dashboard-stats"
import { DashboardActivities } from "./dashboard-activities"
import { DashboardAlerts } from "./dashboard-alerts"
import { DashboardHealth } from "./dashboard-health"
import { GettingStartedChecklist, StartTourButton } from "@/modules/onboarding/client"
import { Stagger, StaggerItem } from "@/components/motion"

export function DashboardContent() {
  const { t } = useTranslation()

  return (
    <Stagger className="p-6 space-y-6" id="tour-dashboard">
      {/* Header */}
      <StaggerItem className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("dashboard.description")}
          </p>
        </div>
        <StartTourButton />
      </StaggerItem>

      {/* Getting Started Checklist */}
      <StaggerItem>
        <GettingStartedChecklist />
      </StaggerItem>

      {/* Stats Grid */}
      <StaggerItem>
        <DashboardStats />
      </StaggerItem>

      <StaggerItem className="grid gap-6 lg:grid-cols-2">
        <DashboardActivities />
        <DashboardAlerts />
      </StaggerItem>

      <StaggerItem>
        <DashboardHealth />
      </StaggerItem>
    </Stagger>
  )
}


