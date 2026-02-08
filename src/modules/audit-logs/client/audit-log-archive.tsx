"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Archive, Loader2, Download } from "lucide-react"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { showErrorFromException } from "@/lib/error-toast"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { showErrorFromException } from "@/lib/error-toast"

export function AuditLogArchive() {
  const { t } = useTranslation()
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = React.useState(false)
  const [olderThanDays, setOlderThanDays] = React.useState("90")
  const [page, setPage] = React.useState(1)

  const archiveMutation = trpc.auditLogs.archiveLogs.useMutation({
    onSuccess: (data) => {
      toast.success(
        t("audit.archive.success", {
          count: data.archivedCount,
        })
      )
      setIsArchiveDialogOpen(false)
      utils.auditLogs.getArchives.invalidate()
    },
    onError: (error) => {
      showErrorFromException(error, t("audit.archive.failed"))
    },
  })

  const { data: archivesData, isLoading } = trpc.auditLogs.getArchives.useQuery(
    {
      page,
      pageSize: 20,
    }
  )

  const utils = trpc.useUtils()

  const handleArchive = () => {
    const days = parseInt(olderThanDays, 10)
    if (isNaN(days) || days < 1) {
      toast.error(t("audit.archive.invalidDays"))
      return
    }
    archiveMutation.mutate({ olderThanDays: days })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Archive className="h-5 w-5" />
                {t("audit.archive.title")}
              </CardTitle>
              <CardDescription>
                {t("audit.archive.description")}
              </CardDescription>
            </div>
            <Dialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Archive className="mr-2 h-4 w-4" />
                  {t("audit.archive.createArchive")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("audit.archive.createArchive")}</DialogTitle>
                  <DialogDescription>
                    {t("audit.archive.createDescription")}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>{t("audit.archive.olderThanDays")}</Label>
                    <Input
                      type="number"
                      min="1"
                      max="3650"
                      value={olderThanDays}
                      onChange={(e) => setOlderThanDays(e.target.value)}
                      placeholder="90"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("audit.archive.olderThanDaysDescription")}
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsArchiveDialogOpen(false)}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    onClick={handleArchive}
                    disabled={archiveMutation.isPending}
                  >
                    {archiveMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t("audit.archive.archive")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : archivesData && archivesData.archives.length > 0 ? (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("audit.archive.archiveDate")}</TableHead>
                    <TableHead>{t("audit.archive.dateRange")}</TableHead>
                    <TableHead>{t("audit.archive.logCount")}</TableHead>
                    <TableHead>{t("audit.archive.archivedBy")}</TableHead>
                    <TableHead>{t("audit.archive.status")}</TableHead>
                    <TableHead>{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archivesData.archives.map((archive) => (
                    <TableRow key={archive.id}>
                      <TableCell>
                        {format(new Date(archive.archiveDate), "PPP")}
                      </TableCell>
                      <TableCell>
                        {format(new Date(archive.startDate), "MMM dd")} -{" "}
                        {format(new Date(archive.endDate), "MMM dd")}
                      </TableCell>
                      <TableCell>{archive.logCount.toLocaleString()}</TableCell>
                      <TableCell>
                        {archive.archiver?.name || t("audit.archive.system")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            archive.status === "COMPLETED"
                              ? "default"
                              : archive.status === "FAILED"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {t(`audit.archive.statuses.${archive.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {archive.filePath && (
                          <Button variant="ghost" size="sm">
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {/* Pagination */}
              {archivesData.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {t("common.page")} {archivesData.pagination.page} of{" "}
                    {archivesData.pagination.totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                    >
                      {t("common.previous")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= archivesData.pagination.totalPages}
                    >
                      {t("common.next")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              {t("audit.archive.noArchives")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
