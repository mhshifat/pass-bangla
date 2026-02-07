"use client"

import { useTranslation } from "react-i18next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Lock, Shield, AlertTriangle, LucideIcon } from "lucide-react"

interface Stat {
  name: string
  value: string
  change: string
  changeType: "positive" | "negative" | "neutral"
  icon: string
}

interface StatsCardsProps {
  stats: Stat[]
}

const iconMap: Record<string, LucideIcon> = {
  Users,
  Lock,
  Shield,
  AlertTriangle,
}

export function StatsCards({ stats }: StatsCardsProps) {
  const { t } = useTranslation()
  
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const IconComponent = iconMap[stat.icon] || Users
        return (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.name}
              </CardTitle>
              <IconComponent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className={`text-xs ${
                stat.changeType === 'positive' 
                  ? 'text-green-600' 
                  : stat.changeType === 'negative' 
                    ? 'text-red-600' 
                    : 'text-muted-foreground'
              }`}>
                {t("dashboard.changeFromLastMonth", { change: stat.change })}
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
