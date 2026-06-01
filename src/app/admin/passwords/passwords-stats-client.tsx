"use client"

import { useTranslation } from "react-i18next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SecurityAlerts } from "@/modules/passwords/client"
import { Star } from "lucide-react"

interface PasswordsStatsClientProps {
  stats: {
    total: number
    strong: number
    weak: number
    expiringSoon: number
    strongPercentage: number
    recentCount: number
    favorites: number
  }
}

export function PasswordsStatsClient({ stats }: PasswordsStatsClientProps) {
  const { t } = useTranslation()

  const securityAlerts = [
    ...(stats.weak > 0
      ? [
          {
            type: "weak" as const,
            count: stats.weak,
            message: t("passwords.weakPasswordMessage", { count: stats.weak }),
          },
        ]
      : []),
    ...(stats.expiringSoon > 0
      ? [
          {
            type: "expiring" as const,
            count: stats.expiringSoon,
            message: t("passwords.expiringPasswordMessage", { count: stats.expiringSoon }),
          },
        ]
      : []),
  ]

  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t("passwords.totalPasswords")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {stats.recentCount > 0 
                ? t("passwords.recentAdditions", { count: stats.recentCount })
                : t("passwords.noRecentAdditions")}
            </p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t("passwords.strongPasswords")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.strong.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{t("passwords.percentageOfTotal", { percentage: stats.strongPercentage })}</p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t("passwords.weakPasswords")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.weak.toLocaleString()}</div>
            <p className={`text-xs ${stats.weak > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
              {stats.weak > 0 ? t("passwords.needAttention") : t("passwords.allSecure")}
            </p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t("passwords.expiringSoon")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.expiringSoon.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{t("passwords.within7Days")}</p>
          </CardContent>
        </Card>
      </div>

      {securityAlerts.length > 0 && <SecurityAlerts alerts={securityAlerts} />}
    </>
  )
}


