"use client"

import * as React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { showErrorFromException } from "@/lib/error-toast"
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle2,
  ArrowLeft,
  RefreshCw,
  X,
  ExternalLink,
  Clock
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"
import { resolveBreachAction } from "@/app/admin/passwords/breach-actions"
import { useTransition } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export function BreachesPageClient() {
  const { t } = useTranslation()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [resolvingBreachId, setResolvingBreachId] = useState<string | null>(null)
  const [isResolveDialogOpen, setIsResolveDialogOpen] = useState(false)

  const { data, isLoading, refetch } = trpc.passwords.getBreachHistory.useQuery(
    { includeResolved: false },
    { enabled: true }
  )

  const checkAllMutation = trpc.passwords.checkAllPasswordsBreach.useMutation({
    onSuccess: (result) => {
      toast.success(t("passwords.breach.checkAllSuccess", { checked: result.checked, breached: result.breached }))
      refetch()
      router.refresh()
    },
    onError: (error) => {
      showErrorFromException(error, t("passwords.breach.checkAllError"))
    },
  })

  const handleResolve = (breachId: string) => {
    setResolvingBreachId(breachId)
    setIsResolveDialogOpen(true)
  }

  const confirmResolve = () => {
    if (!resolvingBreachId) return

    startTransition(async () => {
      try {
        await resolveBreachAction(resolvingBreachId)
        toast.success(t("passwords.breach.resolveSuccess"))
        setIsResolveDialogOpen(false)
        setResolvingBreachId(null)
        refetch()
        router.refresh()
      } catch (error) {
        showErrorFromException(error, t("passwords.breach.resolveError"))
      }
    })
  }

  const getBreachBadge = (isBreached: boolean, breachCount: number) => {
    if (!isBreached) {
      return <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400">{t("passwords.breach.safe")}</Badge>
    }
    if (breachCount > 1000000) {
      return <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-400">{t("passwords.breach.critical")}</Badge>
    }
    if (breachCount > 100000) {
      return <Badge className="bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400">{t("passwords.breach.high")}</Badge>
    }
    return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400">{t("passwords.breach.medium")}</Badge>
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
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
                <Shield className="h-8 w-8" />
                {t("passwords.breach.title")}
              </h1>
              <p className="text-muted-foreground mt-1">
                {t("passwords.breach.description")}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={async () => {
                await refetch()
                router.refresh()
              }}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              {t("common.refresh")}
            </Button>
            <Button
              onClick={() => checkAllMutation.mutate()}
              disabled={checkAllMutation.isPending}
            >
              <Shield className="h-4 w-4 mr-2" />
              {checkAllMutation.isPending ? t("passwords.breach.checkingAll") : t("passwords.breach.checkAll")}
            </Button>
          </div>
        </div>

        {/* Summary Card */}
        {data && (
          <Card>
            <CardHeader>
              <CardTitle>{t("passwords.breach.summary")}</CardTitle>
              <CardDescription>
                {data.breached > 0
                  ? t("passwords.breach.breachedFound", { count: data.breached })
                  : t("passwords.breach.noBreaches")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">{t("passwords.breach.totalChecked")}</div>
                  <div className="text-2xl font-bold">{data.total}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">{t("passwords.breach.breached")}</div>
                  <div className={`text-2xl font-bold ${data.breached > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                    {data.breached}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">{t("passwords.breach.safe")}</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {data.total - data.breached}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Breaches Table */}
        <Card>
          <CardHeader>
            <CardTitle>{t("passwords.breach.breachHistory")}</CardTitle>
            <CardDescription>
              {t("passwords.breach.historyDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Skeleton className="h-64 w-full" />
              </div>
            ) : !data?.breaches || data.breaches.length === 0 ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{t("passwords.breach.noBreachHistory")}</AlertDescription>
              </Alert>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.name")}</TableHead>
                      <TableHead>{t("passwords.username")}</TableHead>
                      <TableHead>{t("passwords.breach.status")}</TableHead>
                      <TableHead>{t("passwords.breach.breachCount")}</TableHead>
                      <TableHead>{t("passwords.breach.checkedAt")}</TableHead>
                      <TableHead>{t("passwords.breach.checkedBy")}</TableHead>
                      <TableHead className="text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.breaches.map((breach) => (
                      <TableRow key={breach.id}>
                        <TableCell className="font-medium">{breach.password.name}</TableCell>
                        <TableCell className="font-mono text-sm">{breach.password.username}</TableCell>
                        <TableCell>
                          {getBreachBadge(breach.isBreached, breach.breachCount)}
                        </TableCell>
                        <TableCell>
                          {breach.isBreached ? (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{breach.breachCount.toLocaleString()}</span>
                              <a
                                href="https://haveibeenpwned.com/Passwords"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                                title={t("passwords.breach.learnMore")}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span>{formatDistanceToNow(new Date(breach.checkedAt), { addSuffix: true })}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(breach.checkedAt).toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          {breach.checkedByUser ? (
                            <div>
                              <div className="font-medium">{breach.checkedByUser.name}</div>
                              <div className="text-xs text-muted-foreground">{breach.checkedByUser.email}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {breach.isBreached && !breach.resolved && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResolve(breach.id)}
                              disabled={isPending}
                              className="h-8"
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              {t("passwords.breach.resolve")}
                            </Button>
                          )}
                          {breach.resolved && (
                            <Badge variant="outline" className="text-green-600 dark:text-green-400">
                              {t("passwords.breach.resolved")}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={isResolveDialogOpen} onOpenChange={setIsResolveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("passwords.breach.resolveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("passwords.breach.resolveDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResolvingBreachId(null)}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmResolve}
              disabled={isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {isPending ? t("common.loading") : t("passwords.breach.resolve")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
