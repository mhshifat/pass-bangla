"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "@/trpc/client"
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
import { Skeleton } from "@/components/ui/skeleton"
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
import { Download, Trash2, FileText } from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"
import { usePermissions } from "@/hooks/use-permissions"
import { downloadBase64File } from "@/lib/download-file"
import { useIsMobile } from "@/hooks/use-mobile"
import { Card } from "@/components/ui/card"
import { showErrorFromException } from "@/lib/error-toast"

export function ReportsList() {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  const isMobile = useIsMobile()
  const [page, setPage] = React.useState(1)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [reportToDelete, setReportToDelete] = React.useState<string | null>(null)
  const pageSize = 20

  const { data, isLoading, refetch } = trpc.reports.list.useQuery({
    page,
    pageSize,
  })

  const deleteMutation = trpc.reports.delete.useMutation({
    onSuccess: () => {
      toast.success(t("reports.deleteSuccess"))
      refetch()
      setDeleteDialogOpen(false)
      setReportToDelete(null)
    },
    onError: (error) => {
      showErrorFromException(error, t("reports.deleteError"))
    },
  })

  const canDelete = hasPermission("report.delete")
  const canDownload = hasPermission("report.view")

  const downloadMutation = trpc.reports.download.useMutation({
    onSuccess: async (data) => {
      // Decode off the main thread (worker) so large reports don't hitch the UI.
      await downloadBase64File({
        base64: data.content,
        mimeType: data.mimeType,
        fileName: `${data.fileName}.${data.fileExtension}`,
      })
      toast.success(t("reports.downloadSuccess", { defaultValue: "Report downloaded successfully" }))
    },
    onError: (error) => {
      showErrorFromException(error, t("reports.downloadError", { defaultValue: "Failed to download report" }))
    },
  })

  const handleDownload = (report: {
    id: string
    name: string
    format: string
    status: string
  }) => {
    if (report.status !== "COMPLETED") {
      toast.error(t("reports.notReady"))
      return
    }
    downloadMutation.mutate({ id: report.id })
  }

  const handleDeleteClick = (id: string) => {
    setReportToDelete(id)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = () => {
    if (reportToDelete) {
      deleteMutation.mutate({ id: reportToDelete })
    }
  }

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      DRAFT: { label: t("reports.status.draft"), variant: "outline" },
      GENERATING: { label: t("reports.status.generating"), variant: "secondary" },
      COMPLETED: { label: t("reports.status.completed"), variant: "default" },
      FAILED: { label: t("reports.status.failed"), variant: "destructive" },
    }
    const statusInfo = statusMap[status] || { label: status, variant: "outline" as const }
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const reports = data?.reports || []
  const pagination = data?.pagination

  return (
    <div className="space-y-4">
      {reports.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>{t("reports.noReports")}</p>
        </div>
      ) : isMobile ? (
        // Mobile card layout
        <div className="space-y-4 md:hidden">
          {reports.map((report) => (
            <Card key={report.id} className="p-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{report.name}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {t(`reports.types.${report.reportType}`)} • {report.format}
                    </div>
                  </div>
                  {getStatusBadge(report.status)}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t("reports.table.createdAt")}:</span>
                    <span className="text-sm">
                      {report.createdAt
                        ? format(new Date(report.createdAt), "PPp")
                        : "N/A"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t">
                  {report.status === "COMPLETED" && canDownload && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(report)}
                      disabled={downloadMutation.isPending}
                      className="flex-1"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {t("reports.download", { defaultValue: "Download" })}
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteClick(report.id)}
                      disabled={deleteMutation.isPending}
                      className="flex-1"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t("common.delete")}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports.table.name")}</TableHead>
                  <TableHead>{t("reports.table.type")}</TableHead>
                  <TableHead>{t("reports.table.format")}</TableHead>
                  <TableHead>{t("reports.table.status")}</TableHead>
                  <TableHead>{t("reports.table.createdAt")}</TableHead>
                  <TableHead>{t("reports.table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">{report.name}</TableCell>
                    <TableCell>{t(`reports.types.${report.reportType}`)}</TableCell>
                    <TableCell>{report.format}</TableCell>
                    <TableCell>{getStatusBadge(report.status)}</TableCell>
                    <TableCell>
                      {report.createdAt
                        ? format(new Date(report.createdAt), "PPp")
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {report.status === "COMPLETED" && canDownload && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(report)}
                            disabled={downloadMutation.isPending}
                            title={t("reports.download", { defaultValue: "Download report" })}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(report.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t("reports.paginationInfo", {
                  start: (pagination.page - 1) * pagination.pageSize + 1,
                  end: Math.min(pagination.page * pagination.pageSize, pagination.total),
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
                  {t("common.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= pagination.totalPages}
                >
                  {t("common.next")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("reports.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("reports.deleteWarning", { defaultValue: "This action cannot be undone. The report will be permanently deleted." })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReportToDelete(null)}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? t("common.loading") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}




