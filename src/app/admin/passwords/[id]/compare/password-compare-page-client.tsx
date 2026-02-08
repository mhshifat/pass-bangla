"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { 
  GitCompare, 
  CheckCircle2, 
  X, 
  ArrowLeft, 
  Calendar, 
  User, 
  AlertCircle,
  Info,
  Shield,
  Key,
  Globe,
  FileText,
  Clock,
  TrendingUp
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FormErrorDisplay } from "@/components/shared/form-error-display"
import { Separator } from "@/components/ui/separator"
import { trpc } from "@/trpc/client"
import { formatDistanceToNow } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"

interface PasswordComparePageClientProps {
  passwordId: string
  passwordName: string
  historyId1?: string
  historyId2?: string
}

export function PasswordComparePageClient({
  passwordId,
  passwordName,
  historyId1,
  historyId2,
}: PasswordComparePageClientProps) {
  const { t } = useTranslation()
  const router = useRouter()

  const { data, isLoading } = trpc.passwords.compareVersions.useQuery(
    {
      passwordId,
      historyId1,
      historyId2,
    },
    { enabled: true }
  )

  const getStrengthBadge = (strength: string) => {
    switch (strength) {
      case "STRONG":
        return <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400">{t("passwords.strong")}</Badge>
      case "MEDIUM":
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400">{t("passwords.medium")}</Badge>
      case "WEAK":
        return <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-400">{t("passwords.weak")}</Badge>
      default:
        return <Badge variant="outline">{strength}</Badge>
    }
  }

  const getChangeTypeBadge = (changeType: string) => {
    switch (changeType) {
      case "CREATE":
        return <Badge variant="default">{t("passwords.history.created")}</Badge>
      case "UPDATE":
        return <Badge variant="outline">{t("passwords.history.updated")}</Badge>
      case "RESTORE":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400">{t("passwords.history.restored")}</Badge>
      case "CURRENT":
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400">{t("passwords.history.currentVersion")}</Badge>
      default:
        return <Badge variant="outline">{changeType}</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6">
        <FormErrorDisplay error={t("common.error")} />
      </div>
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
  const differences: Array<{ field: string; value1: unknown; value2: unknown; icon: React.ReactNode }> = []
  if (version1 && version2) {
    if (version1.name !== version2.name) differences.push({ 
      field: t("common.name"), 
      value1: version1.name, 
      value2: version2.name,
      icon: <FileText className="h-4 w-4" />
    })
    if (version1.username !== version2.username) differences.push({ 
      field: t("passwords.username"), 
      value1: version1.username, 
      value2: version2.username,
      icon: <User className="h-4 w-4" />
    })
    if (version1.url !== version2.url) differences.push({ 
      field: t("passwords.url"), 
      value1: version1.url || "-", 
      value2: version2.url || "-",
      icon: <Globe className="h-4 w-4" />
    })
    if (version1.notes !== version2.notes) differences.push({ 
      field: t("passwords.notes"), 
      value1: version1.notes || "-", 
      value2: version2.notes || "-",
      icon: <FileText className="h-4 w-4" />
    })
    if (version1.strength !== version2.strength) differences.push({ 
      field: t("passwords.strength"), 
      value1: version1.strength, 
      value2: version2.strength,
      icon: <Shield className="h-4 w-4" />
    })
    if (version1.hasTotp !== version2.hasTotp) differences.push({ 
      field: t("passwords.hasTotp"), 
      value1: version1.hasTotp ? t("common.yes") : t("common.no"), 
      value2: version2.hasTotp ? t("common.yes") : t("common.no"),
      icon: <Key className="h-4 w-4" />
    })
    if (version1.expiresAt?.getTime() !== version2.expiresAt?.getTime()) {
      differences.push({ 
        field: t("passwords.expiresAt"), 
        value1: version1.expiresAt ? new Date(version1.expiresAt).toLocaleDateString() : "-", 
        value2: version2.expiresAt ? new Date(version2.expiresAt).toLocaleDateString() : "-",
        icon: <Clock className="h-4 w-4" />
      })
    }
  }

  const hasChanges = differences.length > 0

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <GitCompare className="h-8 w-8" />
              {t("passwords.history.compareVersions")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("passwords.history.compareDescription")} - {passwordName}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Card */}
      {version1 && version2 && (
        <Card className="border-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  {t("passwords.history.summary")}
                </CardTitle>
                <CardDescription className="mt-1">
                  {t("passwords.history.compareSummaryDescription")}
                </CardDescription>
              </div>
              <div className={`flex items-center gap-3 px-4 py-2 rounded-lg ${hasChanges ? "bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900" : "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900"}`}>
                <div className={`h-4 w-4 rounded-full ${hasChanges ? "bg-yellow-500" : "bg-green-500"}`} />
                <div>
                  <div className="font-semibold text-sm">
                    {hasChanges 
                      ? t("passwords.history.changesFound", { count: differences.length })
                      : t("passwords.history.noChanges")
                    }
                  </div>
                  {hasChanges && (
                    <div className="text-xs text-muted-foreground">
                      {t("passwords.history.changesDetected")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Side by Side Comparison */}
      {version1 && version2 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Version 1 */}
          <Card className={`${hasChanges ? "border-2 border-blue-200 dark:border-blue-800" : ""} h-fit`}>
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg flex items-center gap-2 mb-2">
                    <div className="h-3 w-3 rounded-full bg-blue-500" />
                    {version1.id === "current" ? t("passwords.history.currentVersion") : t("passwords.history.version1")}
                  </CardTitle>
                  <div className="flex items-center gap-2 mb-3">
                    {getChangeTypeBadge(version1.changeType)}
                    {getStrengthBadge(version1.strength)}
                  </div>
                  {version1.changedBy && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <User className="h-3.5 w-3.5" />
                      <span className="font-medium">{version1.changedBy.name}</span>
                      <span className="text-xs">({version1.changedBy.email})</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{formatDistanceToNow(new Date(version1.createdAt), { addSuffix: true })}</span>
                    <span className="text-xs">({new Date(version1.createdAt).toLocaleString()})</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    {t("common.name")}
                  </div>
                  <div className="text-base font-medium">{version1.name}</div>
                </div>
                <Separator />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {t("passwords.username")}
                  </div>
                  <div className="text-sm font-mono bg-muted px-2 py-1 rounded">{version1.username}</div>
                </div>
                {version1.url && (
                  <>
                    <Separator />
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {t("passwords.url")}
                      </div>
                      <div className="text-sm break-all">{version1.url}</div>
                    </div>
                  </>
                )}
                {version1.notes && (
                  <>
                    <Separator />
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {t("passwords.notes")}
                      </div>
                      <div className="text-sm whitespace-pre-wrap bg-muted px-2 py-1 rounded">{version1.notes}</div>
                    </div>
                  </>
                )}
                <Separator />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    {t("passwords.strength")}
                  </div>
                  <div>{getStrengthBadge(version1.strength)}</div>
                </div>
                <Separator />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Key className="h-3 w-3" />
                    {t("passwords.hasTotp")}
                  </div>
                  <div className="text-sm">{version1.hasTotp ? t("common.yes") : t("common.no")}</div>
                </div>
                {version1.expiresAt && (
                  <>
                    <Separator />
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {t("passwords.expiresAt")}
                      </div>
                      <div className="text-sm">{new Date(version1.expiresAt).toLocaleDateString()}</div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Version 2 */}
          <Card className={`${hasChanges ? "border-2 border-purple-200 dark:border-purple-800" : ""} h-fit`}>
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg flex items-center gap-2 mb-2">
                    <div className="h-3 w-3 rounded-full bg-purple-500" />
                    {version2.id === "current" ? t("passwords.history.currentVersion") : t("passwords.history.version2")}
                  </CardTitle>
                  <div className="flex items-center gap-2 mb-3">
                    {getChangeTypeBadge(version2.changeType)}
                    {getStrengthBadge(version2.strength)}
                  </div>
                  {version2.changedBy && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <User className="h-3.5 w-3.5" />
                      <span className="font-medium">{version2.changedBy.name}</span>
                      <span className="text-xs">({version2.changedBy.email})</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{formatDistanceToNow(new Date(version2.createdAt), { addSuffix: true })}</span>
                    <span className="text-xs">({new Date(version2.createdAt).toLocaleString()})</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    {t("common.name")}
                  </div>
                  <div className={`text-base font-medium ${version1.name !== version2.name ? "bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded border border-yellow-300 dark:border-yellow-700" : ""}`}>
                    {version2.name}
                  </div>
                </div>
                <Separator />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {t("passwords.username")}
                  </div>
                  <div className={`text-sm font-mono px-2 py-1 rounded ${version1.username !== version2.username ? "bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700" : "bg-muted"}`}>
                    {version2.username}
                  </div>
                </div>
                {version2.url && (
                  <>
                    <Separator />
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {t("passwords.url")}
                      </div>
                      <div className={`text-sm break-all ${version1.url !== version2.url ? "bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded border border-yellow-300 dark:border-yellow-700" : ""}`}>
                        {version2.url}
                      </div>
                    </div>
                  </>
                )}
                {version2.notes && (
                  <>
                    <Separator />
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {t("passwords.notes")}
                      </div>
                      <div className={`text-sm whitespace-pre-wrap px-2 py-1 rounded ${version1.notes !== version2.notes ? "bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700" : "bg-muted"}`}>
                        {version2.notes}
                      </div>
                    </div>
                  </>
                )}
                <Separator />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    {t("passwords.strength")}
                  </div>
                  <div className={version1.strength !== version2.strength ? "bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded border border-yellow-300 dark:border-yellow-700 w-fit" : ""}>
                    {getStrengthBadge(version2.strength)}
                  </div>
                </div>
                <Separator />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Key className="h-3 w-3" />
                    {t("passwords.hasTotp")}
                  </div>
                  <div className={`text-sm ${version1.hasTotp !== version2.hasTotp ? "bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded border border-yellow-300 dark:border-yellow-700" : ""}`}>
                    {version2.hasTotp ? t("common.yes") : t("common.no")}
                  </div>
                </div>
                {version2.expiresAt && (
                  <>
                    <Separator />
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {t("passwords.expiresAt")}
                      </div>
                      <div className={`text-sm ${version1.expiresAt?.getTime() !== version2.expiresAt?.getTime() ? "bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded border border-yellow-300 dark:border-yellow-700" : ""}`}>
                        {new Date(version2.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>{t("passwords.history.selectVersionToCompare")}</AlertDescription>
        </Alert>
      )}

      {/* Changes List */}
      {hasChanges && version1 && version2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-yellow-600" />
              {t("passwords.history.changes")}
            </CardTitle>
            <CardDescription>
              {t("passwords.history.changesDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {differences.map((diff, index) => (
                <div 
                  key={index} 
                  className="border-l-4 border-yellow-500 dark:border-yellow-600 pl-4 py-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-r-lg"
                >
                  <div className="flex items-center gap-2 font-semibold text-sm mb-3">
                    {diff.icon}
                    {diff.field}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-blue-500" />
                        {version1.id === "current" ? t("passwords.history.currentVersion") : t("passwords.history.version1")}
                      </div>
                      <div className="font-medium line-through text-muted-foreground bg-muted px-2 py-1 rounded">
                        {diff.value1 || "-"}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-purple-500" />
                        {version2.id === "current" ? t("passwords.history.currentVersion") : t("passwords.history.version2")}
                      </div>
                      <div className="font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20 px-2 py-1 rounded border border-green-200 dark:border-green-900">
                        {diff.value2 || "-"}
                      </div>
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
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <div className="font-semibold text-lg">{t("passwords.history.noChanges")}</div>
              <div className="text-sm text-muted-foreground max-w-md">
                {t("passwords.history.versionsIdentical")}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
