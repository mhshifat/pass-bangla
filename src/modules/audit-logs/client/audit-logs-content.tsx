"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Download, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AuditLogsTable,
  LogDetailsDialog,
  AuditLogsEmptyState,
  AdvancedAuditSearch,
  AuditLogAnalytics,
  AuditLogArchive,
  AuditLogStreaming,
} from "@/modules/audit-logs/client"
import { trpc } from "@/trpc/client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { showErrorFromException } from "@/lib/error-toast"

type AuditLog = {
  id: string
  user: string
  userEmail: string
  action: string
  resource: string
  ipAddress: string
  timestamp: string
  status: "success" | "failed" | "warning" | "blocked"
  avatar: string | null
  details?: Record<string, unknown>
}

export function AuditLogsContent() {
  const { t } = useTranslation()
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = React.useState(false)
  const [selectedLog, setSelectedLog] = React.useState<AuditLog | null>(null)
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState("")
  const [action, setAction] = React.useState<string>("")
  const [status, setStatus] = React.useState<"SUCCESS" | "FAILED" | "WARNING" | "BLOCKED" | undefined>(undefined)
  const [advancedFilters, setAdvancedFilters] = React.useState<Record<string, unknown> | null>(null)
  const [activeTab, setActiveTab] = React.useState("logs")

  const { data: statsData } = trpc.auditLogs.stats.useQuery({ days: 30 })
  const { data: actionTypesData } = trpc.auditLogs.getActionTypes.useQuery()
  
  // Use advanced search if filters are set, otherwise use regular search
  const { data: advancedSearchData, isLoading: isLoadingAdvanced } = trpc.auditLogs.advancedSearch.useQuery(
    {
      ...advancedFilters,
      page,
      pageSize: 20,
    },
    {
      enabled: !!advancedFilters,
    }
  )

  const { data: logsData, isLoading: isLoadingRegular } = trpc.auditLogs.list.useQuery(
    {
      page,
      pageSize: 20,
      search: search || undefined,
      action: action === t("audit.allActions") ? undefined : action,
      status,
    },
    {
      enabled: !advancedFilters,
    }
  )

  const isLoading = advancedFilters ? isLoadingAdvanced : isLoadingRegular
  const logsDataToUse = advancedFilters ? advancedSearchData : logsData

  const handleViewDetails = (log: AuditLog) => {
    setSelectedLog(log)
    setIsDetailsDialogOpen(true)
  }

  const exportMutation = trpc.auditLogs.exportLogs.useMutation({
    onSuccess: (data) => {
      // Create blob and download
      const blob = new Blob([data.content], { type: data.mimeType })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `audit-logs-${new Date().toISOString().split("T")[0]}.${data.fileExtension}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      toast.success(
        t("audit.export.success", { count: data.count, format: data.fileExtension.toUpperCase() })
      )
    },
    onError: (error) => {
      toast.error(t("audit.export.failed", { error: error.message }))
    },
  })

  const handleExport = () => {
    // Prepare export filters based on current search/filters
    const exportFilters: Record<string, unknown> = {
      format: "csv" as const,
    }

    if (advancedFilters) {
      // Use advanced filters
      if (advancedFilters.actions) exportFilters.actions = advancedFilters.actions
      if (advancedFilters.resources) exportFilters.resources = advancedFilters.resources
      if (advancedFilters.statuses) exportFilters.statuses = advancedFilters.statuses
      if (advancedFilters.userIds) exportFilters.userIds = advancedFilters.userIds
      if (advancedFilters.ipAddresses) exportFilters.ipAddresses = advancedFilters.ipAddresses
      if (advancedFilters.dateRange) {
        exportFilters.startDate = (advancedFilters.dateRange as unknown as { start: Date }).start
        exportFilters.endDate = (advancedFilters.dateRange as unknown as { end: Date }).end
      }
      if (advancedFilters.searchText) exportFilters.search = advancedFilters.searchText
      if (advancedFilters.hasDetails !== undefined) exportFilters.hasDetails = advancedFilters.hasDetails
    } else {
      // Use simple filters
      if (search) exportFilters.search = search
      if (action && action !== "" && action !== t("audit.allActions")) exportFilters.action = action
      if (status) exportFilters.status = status
    }

    exportMutation.mutate(exportFilters)
  }

  const handleAdvancedSearch = (filters: Record<string, unknown>) => {
    setAdvancedFilters(filters)
    setPage(1)
  }

  const handleClearAdvancedSearch = () => {
    setAdvancedFilters(null)
    setPage(1)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("audit.title")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("audit.description")}
          </p>
        </div>
        <div className="flex gap-2">
          <AdvancedAuditSearch
            onSearch={handleAdvancedSearch}
            onClear={handleClearAdvancedSearch}
          />
          <Button 
            onClick={handleExport}
            disabled={exportMutation.isPending}
          >
            {exportMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("audit.export.exporting")}
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {t("audit.exportLogs")}
              </>
            )}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className='flex items-center justify-start flex-wrap h-auto space-y-1'>
          <TabsTrigger value="logs">{t("audit.tabs.logs")}</TabsTrigger>
          <TabsTrigger value="analytics">{t("audit.tabs.analytics")}</TabsTrigger>
          <TabsTrigger value="streaming">{t("audit.tabs.streaming")}</TabsTrigger>
          <TabsTrigger value="archive">{t("audit.tabs.archive")}</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="space-y-6">

      {/* Stats Cards */}
      {statsData && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{t("audit.totalEvents")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsData.totalEvents.value.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {statsData.totalEvents.labelKey 
                  ? t(statsData.totalEvents.labelKey, statsData.totalEvents.labelParams || {})
                  : (statsData.totalEvents as unknown as { label: string }).label}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{t("audit.failedLogins")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsData.failedLogins.value.toLocaleString()}</div>
              <p className={`text-xs ${statsData.failedLogins.changeType === "negative" ? "text-red-600" : "text-green-600"}`}>
                {t("audit.fromLastPeriod", { change: statsData.failedLogins.change })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{t("audit.passwordChanges")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsData.passwordChanges.value.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {statsData.passwordChanges.labelKey 
                  ? t(statsData.passwordChanges.labelKey, statsData.passwordChanges.labelParams || {})
                  : (statsData.passwordChanges as unknown as { label: string }).label}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{t("audit.securityAlerts")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsData.securityAlerts.value.toLocaleString()}</div>
              <p className={`text-xs ${statsData.securityAlerts.changeType === "negative" ? "text-red-600" : "text-green-600"}`}>
                {t("audit.fromLastPeriod", { change: statsData.securityAlerts.change })}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">{t("audit.loading")}</div>
        </div>
      ) : logsDataToUse && logsDataToUse.logs.length > 0 ? (
        <AuditLogsTable
          logs={logsDataToUse.logs}
          actionTypes={actionTypesData || []}
          onViewDetails={handleViewDetails}
          pagination={logsDataToUse.pagination}
          onPageChange={setPage}
          search={search}
          onSearchChange={setSearch}
          selectedAction={action}
          onActionChange={(value) => {
            setAction(value || "")
            setPage(1)
          }}
          selectedStatus={status}
          onStatusChange={setStatus}
        />
      ) : (
        <AuditLogsEmptyState />
      )}

      <LogDetailsDialog
        open={isDetailsDialogOpen}
        onOpenChange={setIsDetailsDialogOpen}
        log={selectedLog}
      />
        </TabsContent>

        <TabsContent value="analytics">
          <AuditLogAnalytics />
        </TabsContent>

        <TabsContent value="streaming">
          <AuditLogStreaming />
        </TabsContent>

        <TabsContent value="archive">
          <AuditLogArchive />
        </TabsContent>
      </Tabs>
    </div>
  )
}
