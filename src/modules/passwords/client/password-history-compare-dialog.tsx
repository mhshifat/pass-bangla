"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { GitCompare, CheckCircle2, X, ArrowRight, Calendar, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { trpc } from "@/trpc/client"
import { formatDistanceToNow } from "date-fns"

interface PasswordHistoryCompareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  passwordId: string
  historyId1?: string
  historyId2?: string
}

export function PasswordHistoryCompareDialog({
  open,
  onOpenChange,
  passwordId,
  historyId1,
  historyId2,
}: PasswordHistoryCompareDialogProps) {
  const { t } = useTranslation()

  const { data, isLoading } = trpc.passwords.compareVersions.useQuery(
    {
      passwordId,
      historyId1,
      historyId2,
    },
    { enabled: open }
  )

  const getStrengthBadge = (strength: string) => {
    switch (strength) {
      case "STRONG":
        return <Badge className="bg-green-100 text-green-800 border-green-200">{t("passwords.strong")}</Badge>
      case "MEDIUM":
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">{t("passwords.medium")}</Badge>
      case "WEAK":
        return <Badge className="bg-red-100 text-red-800 border-red-200">{t("passwords.weak")}</Badge>
      default:
        return <Badge variant="outline">{strength}</Badge>
    }
  }

  if (!data || isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("passwords.history.comparing")}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">{t("common.loading")}</div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  const version1 = data.version1
  // If version2 is null but version1 exists, use current version as version2
  const version2 = data.version2 || (version1 && data.current ? {
    ...data.current,
    id: "current",
    changeType: "CURRENT",
    changedBy: null,
    createdAt: data.current.updatedAt,
  } : null)

  // Calculate differences
  const differences: Array<{ field: string; value1: string; value2: string }> = []
  if (version1 && version2) {
    if (version1.name !== version2.name) differences.push({ field: t("common.name"), value1: version1.name, value2: version2.name })
    if (version1.username !== version2.username) differences.push({ field: t("passwords.username"), value1: version1.username, value2: version2.username })
    if (version1.url !== version2.url) differences.push({ field: t("passwords.url"), value1: version1.url || "-", value2: version2.url || "-" })
    if (version1.notes !== version2.notes) differences.push({ field: t("passwords.notes"), value1: version1.notes || "-", value2: version2.notes || "-" })
    if (version1.strength !== version2.strength) differences.push({ field: t("passwords.strength"), value1: String(version1.strength), value2: String(version2.strength) })
    if (version1.hasTotp !== version2.hasTotp) differences.push({ field: t("passwords.hasTotp"), value1: version1.hasTotp ? t("common.yes") : t("common.no"), value2: version2.hasTotp ? t("common.yes") : t("common.no") })
    if (version1.expiresAt?.getTime() !== version2.expiresAt?.getTime()) {
      differences.push({ 
        field: t("passwords.expiresAt"), 
        value1: version1.expiresAt ? new Date(version1.expiresAt).toLocaleDateString() : "-", 
        value2: version2.expiresAt ? new Date(version2.expiresAt).toLocaleDateString() : "-" 
      })
    }
  }

  const hasChanges = differences.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            {t("passwords.history.compareVersions")}
          </DialogTitle>
          <DialogDescription>
            {t("passwords.history.compareDescription")}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6">
            {/* Summary Card */}
            {version1 && version2 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("passwords.history.summary")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${hasChanges ? "bg-yellow-500" : "bg-green-500"}`} />
                      <span className="text-sm font-medium">
                        {hasChanges 
                          ? t("passwords.history.changesFound", { count: differences.length })
                          : t("passwords.history.noChanges")
                        }
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Side by Side Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Version 1 */}
              <Card className={version1 && version2 && hasChanges ? "border-2 border-blue-200" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      {version1?.id === "current" ? t("passwords.history.currentVersion") : t("passwords.history.version1")}
                    </CardTitle>
                    {version1 && getStrengthBadge(version1.strength)}
                  </div>
                  {version1 && (
                    <div className="flex flex-col gap-1 mt-2 text-xs text-muted-foreground">
                      {version1.changedBy && (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{version1.changedBy.name}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDistanceToNow(new Date(version1.createdAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {version1 ? (
                    <>
                      <div className="space-y-2">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">{t("common.name")}</div>
                          <div className="text-sm font-medium">{version1.name}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">{t("passwords.username")}</div>
                          <div className="text-sm font-mono">{version1.username}</div>
                        </div>
                        {version1.url && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground mb-1">{t("passwords.url")}</div>
                            <div className="text-sm break-all">{version1.url}</div>
                          </div>
                        )}
                        {version1.notes && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground mb-1">{t("passwords.notes")}</div>
                            <div className="text-sm whitespace-pre-wrap">{version1.notes}</div>
                          </div>
                        )}
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">{t("passwords.strength")}</div>
                          <div>{getStrengthBadge(version1.strength)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">{t("passwords.hasTotp")}</div>
                          <div className="text-sm">{version1.hasTotp ? t("common.yes") : t("common.no")}</div>
                        </div>
                        {version1.expiresAt && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground mb-1">{t("passwords.expiresAt")}</div>
                            <div className="text-sm">{new Date(version1.expiresAt).toLocaleDateString()}</div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground py-4 text-center">
                      {t("passwords.history.selectVersionToCompare")}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Version 2 */}
              <Card className={version1 && version2 && hasChanges ? "border-2 border-purple-200" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-purple-500" />
                      {version2 ? t("passwords.history.version2") : t("passwords.history.currentVersion")}
                    </CardTitle>
                    {version2 && getStrengthBadge(version2.strength)}
                  </div>
                  {version2 && (
                    <div className="flex flex-col gap-1 mt-2 text-xs text-muted-foreground">
                      {version2.changedBy && (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{version2.changedBy.name}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDistanceToNow(new Date(version2.createdAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {version2 ? (
                    <>
                      <div className="space-y-2">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">{t("common.name")}</div>
                          <div className={`text-sm font-medium ${version1 && version1.name !== version2.name ? "bg-yellow-100 dark:bg-yellow-900/20 px-1 rounded" : ""}`}>
                            {version2.name}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">{t("passwords.username")}</div>
                          <div className={`text-sm font-mono ${version1 && version1.username !== version2.username ? "bg-yellow-100 dark:bg-yellow-900/20 px-1 rounded" : ""}`}>
                            {version2.username}
                          </div>
                        </div>
                        {version2.url && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground mb-1">{t("passwords.url")}</div>
                            <div className={`text-sm break-all ${version1 && version1.url !== version2.url ? "bg-yellow-100 dark:bg-yellow-900/20 px-1 rounded" : ""}`}>
                              {version2.url}
                            </div>
                          </div>
                        )}
                        {version2.notes && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground mb-1">{t("passwords.notes")}</div>
                            <div className={`text-sm whitespace-pre-wrap ${version1 && version1.notes !== version2.notes ? "bg-yellow-100 dark:bg-yellow-900/20 px-1 rounded" : ""}`}>
                              {version2.notes}
                            </div>
                          </div>
                        )}
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">{t("passwords.strength")}</div>
                          <div className={version1 && version1.strength !== version2.strength ? "bg-yellow-100 dark:bg-yellow-900/20 px-1 rounded w-fit" : ""}>
                            {getStrengthBadge(version2.strength)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">{t("passwords.hasTotp")}</div>
                          <div className={`text-sm ${version1 && version1.hasTotp !== version2.hasTotp ? "bg-yellow-100 dark:bg-yellow-900/20 px-1 rounded" : ""}`}>
                            {version2.hasTotp ? t("common.yes") : t("common.no")}
                          </div>
                        </div>
                        {version2.expiresAt && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground mb-1">{t("passwords.expiresAt")}</div>
                            <div className={`text-sm ${version1 && version1.expiresAt?.getTime() !== version2.expiresAt?.getTime() ? "bg-yellow-100 dark:bg-yellow-900/20 px-1 rounded" : ""}`}>
                              {new Date(version2.expiresAt).toLocaleDateString()}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground py-4 text-center">
                      {t("passwords.history.selectVersionToCompare")}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Changes List */}
            {hasChanges && version1 && version2 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <X className="h-4 w-4 text-yellow-600" />
                    {t("passwords.history.changes")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {differences.map((diff, index) => (
                      <div key={index} className="border-l-4 border-yellow-500 pl-4 py-2 bg-yellow-50 dark:bg-yellow-950/20 rounded-r">
                        <div className="font-medium text-sm mb-2">{diff.field}</div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                              <div className="h-2 w-2 rounded-full bg-blue-500" />
                              {version1.id === "current" ? t("passwords.history.currentVersion") : t("passwords.history.version1")}
                            </div>
                            <div className="font-medium line-through text-muted-foreground">{diff.value1 || "-"}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                              <div className="h-2 w-2 rounded-full bg-purple-500" />
                              {version2.id === "current" ? t("passwords.history.currentVersion") : t("passwords.history.version2")}
                            </div>
                            <div className="font-medium text-green-700 dark:text-green-400">{diff.value2 || "-"}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* No Changes */}
            {!hasChanges && version1 && version2 && (
              <Card>
                <CardContent className="py-8">
                  <div className="flex flex-col items-center justify-center gap-2 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-600" />
                    <div className="font-medium">{t("passwords.history.noChanges")}</div>
                    <div className="text-sm text-muted-foreground">
                      {t("passwords.history.versionsIdentical")}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
