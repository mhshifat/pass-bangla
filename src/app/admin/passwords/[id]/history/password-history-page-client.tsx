"use client"

import * as React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { History, RotateCcw, GitCompare, ArrowLeft, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { showErrorFromException } from "@/lib/error-toast"

interface PasswordHistoryPageClientProps {
  passwordId: string
  passwordName: string
}

export function PasswordHistoryPageClient({
  passwordId,
  passwordName,
}: PasswordHistoryPageClientProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false)
  const [historyToRestore, setHistoryToRestore] = useState<{ id: string; name: string; createdAt: Date } | null>(null)

  const { data, isLoading, refetch } = trpc.passwords.getHistory.useQuery(
    { passwordId },
    { enabled: true }
  )

  const restoreMutation = trpc.passwords.restoreVersion.useMutation({
    onSuccess: () => {
      toast.success(t("passwords.history.restoreSuccess"))
      refetch()
      router.refresh()
      setSelectedHistoryId(null)
    },
    onError: (error) => {
      showErrorFromException(error, t("passwords.history.restoreError"))
    },
  })

  const handleRestore = (historyId: string) => {
    const version = data?.history.find((h) => h.id === historyId)
    if (version) {
      setHistoryToRestore({
        id: historyId,
        name: version.name,
        createdAt: new Date(version.createdAt),
      })
      setIsRestoreDialogOpen(true)
    }
  }

  const confirmRestore = () => {
    if (historyToRestore) {
      restoreMutation.mutate({ passwordId, historyId: historyToRestore.id })
      setIsRestoreDialogOpen(false)
      setHistoryToRestore(null)
    }
  }

  const handleCompare = (historyId1: string, historyId2?: string) => {
    const params = new URLSearchParams()
    if (historyId1) params.set("historyId1", historyId1)
    if (historyId2) params.set("historyId2", historyId2)
    router.push(`/admin/passwords/${passwordId}/compare?${params.toString()}`)
  }

  const getChangeTypeBadge = (changeType: string) => {
    switch (changeType) {
      case "CREATE":
        return <Badge variant="default">{t("passwords.history.created")}</Badge>
      case "UPDATE":
        return <Badge variant="outline">{t("passwords.history.updated")}</Badge>
      case "RESTORE":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">{t("passwords.history.restored")}</Badge>
      default:
        return <Badge variant="outline">{changeType}</Badge>
    }
  }

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

  return (
    <>
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
                <History className="h-8 w-8" />
                {t("passwords.history.title")}
              </h1>
              <p className="text-muted-foreground mt-1">
                {t("passwords.history.description", { name: passwordName })}
              </p>
            </div>
          </div>
        </div>

        {/* History Table */}
        <Card>
          <CardHeader>
            <CardTitle>{t("passwords.history.versionHistory")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-muted-foreground">{t("common.loading")}</div>
              </div>
            ) : !data?.history || data.history.length === 0 ? (
              <Alert>
                <AlertDescription>{t("passwords.history.noHistory")}</AlertDescription>
              </Alert>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">{t("passwords.history.version")}</TableHead>
                      <TableHead className="min-w-[150px]">{t("passwords.history.changedBy")}</TableHead>
                      <TableHead className="w-24">{t("passwords.history.changeType")}</TableHead>
                      <TableHead className="w-24">{t("passwords.history.strength")}</TableHead>
                      <TableHead className="min-w-[180px]">{t("passwords.history.date")}</TableHead>
                      <TableHead className="text-right min-w-[200px]">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.history.map((version, index) => (
                      <TableRow key={version.id}>
                        <TableCell className="font-medium">
                          {t("passwords.history.versionNumber", { number: data.history.length - index })}
                        </TableCell>
                        <TableCell>
                          {version.changedBy ? (
                            <div className="min-w-0">
                              <div className="font-medium truncate">{version.changedBy.name}</div>
                              <div className="text-xs text-muted-foreground truncate">{version.changedBy.email}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{getChangeTypeBadge(version.changeType)}</TableCell>
                        <TableCell>{getStrengthBadge(version.strength)}</TableCell>
                        <TableCell>
                          <div className="text-sm whitespace-nowrap">
                            {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(version.createdAt).toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCompare(version.id)}
                              className="h-8 whitespace-nowrap"
                            >
                              <GitCompare className="h-3 w-3 mr-1" />
                              {t("passwords.history.compare")}
                            </Button>
                            {index > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRestore(version.id)}
                                disabled={restoreMutation.isPending}
                                className="h-8 whitespace-nowrap"
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                {t("passwords.history.restore")}
                              </Button>
                            )}
                          </div>
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

      <AlertDialog open={isRestoreDialogOpen} onOpenChange={setIsRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              {t("passwords.history.restoreConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>{t("passwords.history.restoreConfirm")}</p>
              {historyToRestore && (
                <div className="mt-4 p-3 bg-muted rounded-lg space-y-1">
                  <div className="text-sm font-medium">{t("passwords.history.versionDetails")}</div>
                  <div className="text-sm text-muted-foreground">
                    <div><span className="font-medium">{t("common.name")}:</span> {historyToRestore.name}</div>
                    <div>
                      <span className="font-medium">{t("passwords.history.date")}:</span>{" "}
                      {formatDistanceToNow(historyToRestore.createdAt, { addSuffix: true })} ({historyToRestore.createdAt.toLocaleString()})
                    </div>
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setHistoryToRestore(null)}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRestore}
              disabled={restoreMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {restoreMutation.isPending ? t("common.loading") : t("passwords.history.restore")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
