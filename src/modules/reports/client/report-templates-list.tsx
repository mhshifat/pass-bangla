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
import { FileText, Trash2 } from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"
import { usePermissions } from "@/hooks/use-permissions"
import { showErrorFromException } from "@/lib/error-toast"

export function ReportTemplatesList() {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()

  const { data, isLoading, refetch } = trpc.reports.listTemplates.useQuery({
    includeSystem: true,
  })

  const deleteMutation = trpc.reports.deleteTemplate.useMutation({
    onSuccess: () => {
      toast.success(t("reports.templates.deleteSuccess"))
      refetch()
    },
    onError: (error) => {
      showErrorFromException(error, t("reports.templates.deleteError"))
    },
  })

  const canDelete = hasPermission("report.delete")

  const handleDelete = (id: string) => {
    if (confirm(t("reports.templates.confirmDelete"))) {
      deleteMutation.mutate({ id })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const templates = data?.templates || []

  return (
    <div className="space-y-4">
      {templates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>{t("reports.templates.noTemplates")}</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("reports.templates.table.name")}</TableHead>
                <TableHead>{t("reports.templates.table.type")}</TableHead>
                <TableHead>{t("reports.templates.table.category")}</TableHead>
                <TableHead>{t("reports.templates.table.usage")}</TableHead>
                <TableHead>{t("reports.templates.table.createdAt")}</TableHead>
                <TableHead>{t("reports.templates.table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="font-medium">
                    {template.name}
                    {template.isSystem && (
                      <Badge variant="secondary" className="ml-2">
                        {t("reports.templates.system")}
                      </Badge>
                    )}
                    {template.isPublic && (
                      <Badge variant="outline" className="ml-2">
                        {t("reports.templates.public")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{t(`reports.types.${template.reportType}`)}</TableCell>
                  <TableCell>{template.category || "N/A"}</TableCell>
                  <TableCell>{template.usageCount}</TableCell>
                  <TableCell>
                    {template.createdAt
                      ? format(new Date(template.createdAt), "PPp")
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    {canDelete && !template.isSystem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(template.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}



