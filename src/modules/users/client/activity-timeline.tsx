"use client"

import * as React from "react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { trpc } from "@/trpc/client"
import { Loader2, ChevronLeft, ChevronRight, Activity as ActivityIcon } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface ActivityTimelineProps {
  userId: string
}

export function ActivityTimeline({ userId }: ActivityTimelineProps) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data, isLoading, error } = trpc.users.getUserActivity.useQuery({
    page,
    pageSize,
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return "default"
      case "FAILED":
        return "destructive"
      case "WARNING":
        return "secondary"
      case "BLOCKED":
        return "destructive"
      default:
        return "secondary"
    }
  }

  const getActionLabel = (action: string) => {
    // Try to get translation key
    const key = `audit.actions.${action.toLowerCase()}`
    const translated = t(key)
    // If translation exists and is different from key, use it
    if (translated !== key) {
      return translated
    }
    // Otherwise format the action name
    return action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase())
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("profile.activity")}</CardTitle>
          <CardDescription>{t("profile.activityDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("profile.activity")}</CardTitle>
          <CardDescription>{t("profile.activityDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-destructive">
            <p>{error.message}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const logs = (data?.logs ?? []) as unknown as Array<{
    id: string
    action: string
    status: string
    resource: string
    resourceId?: string | null
    ipAddress?: string | null
    createdAt: string | Date
  }>
  const pagination = data?.pagination

  if (logs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("profile.activity")}</CardTitle>
          <CardDescription>{t("profile.activityDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ActivityIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t("profile.noActivity")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("profile.noActivityDescription")}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.activity")}</CardTitle>
        <CardDescription>{t("profile.activityDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{getActionLabel(log.action)}</span>
                  <Badge variant={getStatusColor(log.status)} className="text-xs">
                    {log.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("profile.resource")}: {log.resource}
                  {log.resourceId && ` (${log.resourceId})`}
                </p>
                {log.ipAddress && (
                  <p className="text-xs text-muted-foreground">
                    {t("profile.ipAddress")}: {log.ipAddress}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-muted-foreground">
              {t("profile.showing", {
                from: (pagination.page - 1) * pagination.pageSize + 1,
                to: Math.min(pagination.page * pagination.pageSize, pagination.total),
                total: pagination.total,
              })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
