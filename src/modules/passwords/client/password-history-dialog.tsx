"use client"

import * as React from "react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { History, RotateCcw, GitCompare, X, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { PasswordHistoryCompareDialog } from "./password-history-compare-dialog"
import { showErrorFromException } from "@/lib/error-toast"

interface PasswordHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  passwordId: string
  passwordName: string
  onRestore?: () => void
}

export function PasswordHistoryDialog({
  open,
  onOpenChange,
  passwordId,
  passwordName,
  onRestore,
}: PasswordHistoryDialogProps) {
  const { t } = useTranslation()
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [isCompareOpen, setIsCompareOpen] = useState(false)
  const [compareHistoryId1, setCompareHistoryId1] = useState<string | null>(null)
  const [compareHistoryId2, setCompareHistoryId2] = useState<string | null>(null)

  const { data, isLoading, refetch } = trpc.passwords.getHistory.useQuery(
    { passwordId },
    { enabled: open }
  )

  const restoreMutation = trpc.passwords.restoreVersion.useMutation({
    onSuccess: () => {
      toast.success(t("passwords.history.restoreSuccess"))
      refetch()
      onRestore?.()
      setSelectedHistoryId(null)
    },
    onError: (error) => {
      showErrorFromException(error, t("passwords.history.restoreError"))
    },
  })

  const handleRestore = (historyId: string) => {
    if (confirm(t("passwords.history.restoreConfirm"))) {
      restoreMutation.mutate({ passwordId, historyId })
    }
  }

  const handleCompare = (historyId1: string, historyId2?: string) => {
    setCompareHistoryId1(historyId1)
    setCompareHistoryId2(historyId2 || null)
    setIsCompareOpen(true)
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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              {t("passwords.history.title")}
            </DialogTitle>
          <DialogDescription>
            {t("passwords.history.description", { name: passwordName })}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-muted-foreground">{t("common.loading")}</div>
              </div>
            ) : !data?.history || data.history.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{t("passwords.history.noHistory")}</AlertDescription>
              </Alert>
            ) : (
              <ScrollArea className="h-[600px]">
                <div className="min-w-full">
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
                                className="h-7 whitespace-nowrap"
                              >
                                <GitCompare className="h-3 w-3 mr-1" />
                                <span className="hidden sm:inline">{t("passwords.history.compare")}</span>
                                <span className="sm:hidden">{t("common.compare")}</span>
                              </Button>
                              {index > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRestore(version.id)}
                                  disabled={restoreMutation.isPending}
                                  className="h-7 whitespace-nowrap"
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
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {isCompareOpen && (
        <PasswordHistoryCompareDialog
          open={isCompareOpen}
          onOpenChange={setIsCompareOpen}
          passwordId={passwordId}
          historyId1={compareHistoryId1 || undefined}
          historyId2={compareHistoryId2 || undefined}
        />
      )}
    </>
  )
}
