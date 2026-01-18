"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, User, Settings, Activity, BarChart3, History, Shield } from "lucide-react"
import { trpc } from "@/trpc/client"
import { ProfileInformation } from "./profile-information"
import { UserPreferences } from "./user-preferences"
import { ActivityTimeline } from "./activity-timeline"
import { UserStatistics } from "./user-statistics"
import { ActiveSessions } from "./active-sessions"
import { LoginHistory } from "./login-history"
import { DeviceManagement } from "./device-management"
import { AccessibilitySettings } from "@/modules/accessibility/client/accessibility-settings"
import { Monitor, Accessibility } from "lucide-react"
import { AccountRecovery } from "./account-recovery"
import { MfaManagement } from "./mfa-management"
import { PasskeyManagement } from "./passkey-management"

export function EnhancedProfilePage() {
  const { t } = useTranslation()
  const { data, isLoading, error, refetch } = trpc.users.getProfile.useQuery()

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <p>{t("profile.loadFailed", { error: error.message })}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data?.user) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p>{t("profile.userNotFound")}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("profile.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("profile.description")}</p>
      </div>

      <Tabs defaultValue="information" className="space-y-6">
        <TabsList className='flex items-center justify-start flex-wrap h-auto space-y-1'>
          <TabsTrigger value="information" className="gap-2">
            <User className="h-4 w-4" />
            {t("profile.information")}
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <Settings className="h-4 w-4" />
            {t("profile.preferences")}
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="h-4 w-4" />
            {t("profile.activity")}
          </TabsTrigger>
          <TabsTrigger value="statistics" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            {t("profile.statistics")}
          </TabsTrigger>
          <TabsTrigger value="sessions" className="gap-2">
            <Monitor className="h-4 w-4" />
            {t("sessions.activeSessions")}
          </TabsTrigger>
          <TabsTrigger value="loginHistory" className="gap-2">
            <History className="h-4 w-4" />
            {t("sessions.loginHistory")}
          </TabsTrigger>
          <TabsTrigger value="accountRecovery" className="gap-2">
            <Shield className="h-4 w-4" />
            {t("profile.accountRecovery")}
          </TabsTrigger>
          <TabsTrigger value="accessibility" className="gap-2">
            <Accessibility className="h-4 w-4" />
            {t("accessibility.title")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="information" className="space-y-6">
          <ProfileInformation user={data.user} onUpdate={refetch} />
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6">
          <UserPreferences user={data.user} onUpdate={refetch} />
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          <ActivityTimeline userId={data.user.id} />
        </TabsContent>

        <TabsContent value="statistics" className="space-y-6">
          <UserStatistics userId={data.user.id} />
        </TabsContent>

        <TabsContent value="sessions" className="space-y-6">
          <ActiveSessions />
          <DeviceManagement />
        </TabsContent>

        <TabsContent value="loginHistory" className="space-y-6">
          <LoginHistory />
        </TabsContent>

        <TabsContent value="accountRecovery" className="space-y-6">
          <PasskeyManagement />
          <MfaManagement user={data.user} onUpdate={refetch} />
          <AccountRecovery user={data.user} onUpdate={refetch} />
        </TabsContent>

        <TabsContent value="accessibility" className="space-y-6">
          <AccessibilitySettings user={data.user} onUpdate={refetch} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
