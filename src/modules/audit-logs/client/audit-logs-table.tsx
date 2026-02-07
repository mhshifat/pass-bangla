"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, Activity, Filter, Group, X } from "lucide-react"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface AuditLog {
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

interface AuditLogsTableProps {
  logs: AuditLog[]
  actionTypes: string[]
  onViewDetails: (log: AuditLog) => void
  pagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  onPageChange?: (page: number) => void
  search?: string
  onSearchChange?: (search: string) => void
  selectedAction?: string
  onActionChange?: (action: string) => void
  selectedStatus?: "SUCCESS" | "FAILED" | "WARNING" | "BLOCKED" | undefined
  onStatusChange?: (status: "SUCCESS" | "FAILED" | "WARNING" | "BLOCKED" | undefined) => void
}

type GroupByOption = "none" | "action" | "user" | "status" | "date"

export function AuditLogsTable({ 
  logs, 
  actionTypes, 
  onViewDetails,
  pagination,
  onPageChange,
  search,
  onSearchChange,
  selectedAction,
  onActionChange,
  selectedStatus,
  onStatusChange
}: AuditLogsTableProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [searchQuery, setSearchQuery] = React.useState(search || "")
  const [localSelectedAction, setLocalSelectedAction] = React.useState(selectedAction || t("audit.allActions"))
  const [groupBy, setGroupBy] = React.useState<GroupByOption>("none")

  const statusOptions = React.useMemo<Array<{ label: string; value: AuditLogsTableProps["selectedStatus"] }>>(() => [
    { label: t("audit.allStatuses"), value: undefined },
    { label: t("audit.success"), value: "SUCCESS" },
    { label: t("audit.failed"), value: "FAILED" },
    { label: t("audit.warning"), value: "WARNING" },
    { label: t("audit.blocked"), value: "BLOCKED" },
  ], [t])

  const getInitialStatusLabel = () => {
    if (selectedStatus) {
      return statusOptions.find(opt => opt.value === selectedStatus)?.label || t("audit.allStatuses")
    }
    return t("audit.allStatuses")
  }

  const [localSelectedStatus, setLocalSelectedStatus] = React.useState<string>(getInitialStatusLabel())

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.resource.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.ipAddress.includes(searchQuery)

    const matchesAction = localSelectedAction === t("audit.allActions") || log.action === localSelectedAction
    // Find the status option that matches the selected status label
    const selectedStatusOption = statusOptions.find(opt => opt.label === localSelectedStatus)
    const matchesStatus = !selectedStatusOption?.value || log.status.toUpperCase() === selectedStatusOption.value

    return matchesSearch && matchesAction && matchesStatus
  })

  // Update local state when props change
  React.useEffect(() => {
    if (selectedAction) {
      setLocalSelectedAction(selectedAction)
    }
  }, [selectedAction])

  React.useEffect(() => {
    if (selectedStatus !== undefined) {
      const statusOption = statusOptions.find(opt => opt.value === selectedStatus)
      setLocalSelectedStatus(statusOption?.label || t("audit.allStatuses"))
    } else {
      setLocalSelectedStatus(t("audit.allStatuses"))
    }
  }, [selectedStatus, statusOptions, t])

  // Group logs
  const groupedLogs = React.useMemo(() => {
    if (groupBy === "none") {
      return { "": filteredLogs }
    }

    const groups: Record<string, typeof filteredLogs> = {}

    filteredLogs.forEach((log) => {
      let key = ""
      switch (groupBy) {
        case "action":
          key = log.action
          break
        case "user":
          key = log.user
          break
        case "status":
          key = log.status
          break
        case "date":
          // Group by date (YYYY-MM-DD)
          const date = new Date(log.timestamp)
          key = date.toISOString().split("T")[0]
          break
      }

      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(log)
    })

    // Sort groups
    const sortedGroups: Record<string, typeof filteredLogs> = {}
    Object.keys(groups)
      .sort()
      .forEach((key) => {
        sortedGroups[key] = groups[key]
      })

    return sortedGroups
  }, [filteredLogs, groupBy])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-green-100 text-green-800 border-green-200">{t("audit.success")}</Badge>
      case "failed":
        return <Badge className="bg-red-100 text-red-800 border-red-200">{t("audit.failed")}</Badge>
      case "warning":
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">{t("audit.warning")}</Badge>
      case "blocked":
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200">{t("audit.blocked")}</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("audit.searchPlaceholder")}
              className="pl-8"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                onSearchChange?.(e.target.value)
              }}
            />
          </div>
          <div className="flex gap-2">
            <Select value={localSelectedAction} onValueChange={(value) => {
              setLocalSelectedAction(value)
              onActionChange?.(value)
            }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("audit.filterByAction")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={t("audit.allActions")}>
                  {t("audit.allActions")}
                </SelectItem>
                {actionTypes.map((action) => {
                  const actionKey = `audit.actions.${action.toLowerCase()}`
                  return (
                    <SelectItem key={action} value={action}>
                      {t(actionKey, { defaultValue: action })}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <Select value={localSelectedStatus} onValueChange={(value) => {
              setLocalSelectedStatus(value)
              const selectedOption = statusOptions.find(opt => opt.label === value)
              onStatusChange?.(selectedOption?.value)
            }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t("audit.filterByStatus")} />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => (
                  <SelectItem key={status.label} value={status.label}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Group className="h-4 w-4" />
                  {t("audit.groupBy")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("audit.groupBy")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setGroupBy("none")}>
                  {t("audit.groupByNone")} {groupBy === "none" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setGroupBy("action")}>
                  {t("audit.action")} {groupBy === "action" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setGroupBy("user")}>
                  {t("audit.user")} {groupBy === "user" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setGroupBy("status")}>
                  {t("audit.status")} {groupBy === "status" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setGroupBy("date")}>
                  {t("audit.date")} {groupBy === "date" && "✓"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {(localSelectedAction !== t("audit.allActions") || localSelectedStatus !== t("audit.allStatuses") || searchQuery) && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setSearchQuery("")
                  setLocalSelectedAction(t("audit.allActions"))
                  setLocalSelectedStatus(t("audit.allStatuses"))
                  onSearchChange?.("")
                  onActionChange?.(t("audit.allActions"))
                  onStatusChange?.(undefined)
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {Object.keys(groupedLogs).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t("audit.noLogsMatchingFilters")}
          </div>
        ) : (
          Object.entries(groupedLogs).map(([groupKey, groupLogs]) => (
            <div key={groupKey} className={groupBy !== "none" ? "mb-6" : ""}>
              {groupBy !== "none" && (
                <div className="mb-3 pb-2 border-b">
                  <h3 className="font-semibold text-sm">
                    {groupBy === "date"
                      ? new Date(groupKey).toLocaleDateString("en-US", {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : groupKey}
                    <span className="ml-2 text-muted-foreground font-normal">
                      ({t("audit.eventsCount", { count: groupLogs.length })})
                    </span>
                  </h3>
                </div>
              )}
              {isMobile ? (
                // Mobile card layout
                <div className="space-y-4 md:hidden">
                  {groupLogs.map((log) => (
                    <Card key={log.id} className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={log.avatar || undefined} alt={log.user} />
                              <AvatarFallback>
                                {log.user
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm">{log.user}</div>
                              <div className="text-xs text-muted-foreground truncate">{log.userEmail}</div>
                            </div>
                          </div>
                          {getStatusBadge(log.status)}
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">{t("audit.action")}:</span>
                            <div className="flex items-center gap-2">
                              <Activity className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">
                                {t(`audit.actions.${log.action.toLowerCase()}`, { defaultValue: log.action })}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">{t("audit.resource")}:</span>
                            <span className="text-sm">{log.resource}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">{t("audit.ipAddress")}:</span>
                            <code className="text-xs bg-muted px-2 py-1 rounded">{log.ipAddress}</code>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">{t("audit.time")}:</span>
                            <span className="text-sm text-muted-foreground">{log.timestamp}</span>
                          </div>
                        </div>
                        <div className="pt-2 border-t">
                          <Button variant="ghost" size="sm" onClick={() => onViewDetails(log)} className="w-full">
                            {t("audit.view")}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("audit.user")}</TableHead>
                    <TableHead>{t("audit.action")}</TableHead>
                    <TableHead>{t("audit.resource")}</TableHead>
                    <TableHead>{t("audit.ipAddress")}</TableHead>
                    <TableHead>{t("audit.time")}</TableHead>
                    <TableHead>{t("audit.status")}</TableHead>
                    <TableHead className="text-right">{t("audit.details")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={log.avatar || undefined} alt={log.user} />
                            <AvatarFallback>
                              {log.user
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-sm">{log.user}</div>
                            <div className="text-xs text-muted-foreground">{log.userEmail}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {t(`audit.actions.${log.action.toLowerCase()}`, { defaultValue: log.action })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{log.resource}</span>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{log.ipAddress}</code>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{log.timestamp}</TableCell>
                      <TableCell>{getStatusBadge(log.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => onViewDetails(log)}>
                          {t("audit.view")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
