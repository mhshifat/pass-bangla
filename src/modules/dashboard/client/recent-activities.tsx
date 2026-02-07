"use client"

import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface Activity {
  user: string
  action?: string
  actionKey?: string
  resource: string
  resourceType?: string
  time: string
  avatar: string
}

interface RecentActivitiesProps {
  activities: Activity[]
}

const EmptyActivitiesIllustration = () => (
  <svg
    width="120"
    height="120"
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="mx-auto"
  >
    <circle cx="60" cy="60" r="50" fill="#F3F4F6" />
    <path
      d="M40 50C40 45.5817 43.5817 42 48 42C52.4183 42 56 45.5817 56 50C56 54.4183 52.4183 58 48 58C43.5817 58 40 54.4183 40 50Z"
      fill="#9CA3AF"
    />
    <path
      d="M64 50C64 45.5817 67.5817 42 72 42C76.4183 42 80 45.5817 80 50C80 54.4183 76.4183 58 72 58C67.5817 58 64 54.4183 64 50Z"
      fill="#9CA3AF"
    />
    <path
      d="M30 75C30 70.5817 33.5817 67 38 67C42.4183 67 46 70.5817 46 75C46 79.4183 42.4183 83 38 83C33.5817 83 30 79.4183 30 75Z"
      fill="#D1D5DB"
    />
    <path
      d="M74 75C74 70.5817 77.5817 67 82 67C86.4183 67 90 70.5817 90 75C90 79.4183 86.4183 83 82 83C77.5817 83 74 79.4183 74 75Z"
      fill="#D1D5DB"
    />
    <path
      d="M52 75C52 70.5817 55.5817 67 60 67C64.4183 67 68 70.5817 68 75C68 79.4183 64.4183 83 60 83C55.5817 83 52 79.4183 52 75Z"
      fill="#D1D5DB"
    />
    <path
      d="M35 50L45 60M75 50L65 60M50 75L55 80M70 75L65 80"
      stroke="#9CA3AF"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)

export function RecentActivities({ activities }: RecentActivitiesProps) {
  const { t } = useTranslation();
  
  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle>{t("dashboard.recentActivities")}</CardTitle>
        <CardDescription>
          {t("dashboard.recentActivitiesDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <EmptyActivitiesIllustration />
            <h3 className="text-sm font-semibold mt-4 mb-1">{t("dashboard.noActivities")}</h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              {t("dashboard.noActivitiesDescription")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity, index) => (
              <div key={index} className="flex items-start gap-4">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={activity.avatar} alt={activity.user} />
                  <AvatarFallback>{activity.user.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium leading-none">
                      {activity.user}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activity.time}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {activity.actionKey 
                      ? t(activity.actionKey, { defaultValue: activity.action || activity.actionKey })
                      : activity.action} • {activity.resourceType 
                        ? t(`audit.resourceTypes.${activity.resourceType.toLowerCase()}`, { defaultValue: activity.resource })
                        : activity.resource}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
