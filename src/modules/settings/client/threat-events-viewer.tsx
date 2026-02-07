"use client"

import * as React from "react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { trpc } from "@/trpc/client"
import { Loader2, AlertTriangle, Shield, CheckCircle2, XCircle } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { toast } from "sonner"
import { showErrorFromException } from "@/lib/error-toast"

export function ThreatEventsViewer() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [severityFilter, setSeverityFilter] = useState<string | undefined>(undefined)
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>(undefined)
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false)
  const [threatToResolve, setThreatToResolve] = useState<string | null>(null)

  const { data, isLoading, error, refetch } = trpc.settings.getThreatEvents.useQuery({
    page,
    limit: 20,
    severity: severityFilter as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined,
    threatType: typeFilter as
      | "BRUTE_FORCE"
      | "RATE_LIMIT_EXCEEDED"
      | "UNUSUAL_ACCESS_PATTERN"
      | "SUSPICIOUS_LOCATION"
      | "MULTIPLE_FAILED_LOGINS"
      | "ANOMALY_DETECTED"
      | undefined,
    isResolved: statusFilter,
  })

  const resolveMutation = trpc.settings.resolveThreatEvent.useMutation({
    onSuccess: () => {
      toast.success(t("threats.resolveSuccess"))
      setResolveDialogOpen(false)
      setThreatToResolve(null)
      refetch()
    },
    onError: (error) => {
      showErrorFromException(error, t("threats.resolveError"))
    },
  })

  const handleResolve = () => {
    if (!threatToResolve) return
    resolveMutation.mutate({ threatEventId: threatToResolve })
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return <Badge className="bg-red-600 text-white">{t(`threats.severity.${severity}`)}</Badge>
      case "HIGH":
        return <Badge className="bg-orange-600 text-white">{t(`threats.severity.${severity}`)}</Badge>
      case "MEDIUM":
        return <Badge className="bg-yellow-600 text-white">{t(`threats.severity.${severity}`)}</Badge>
      case "LOW":
        return <Badge className="bg-blue-600 text-white">{t(`threats.severity.${severity}`)}</Badge>
      default:
        return <Badge variant="outline">{severity}</Badge>
    }
  }

  const getThreatTypeLabel = (type: string) => {
    return t(`threats.types.${type}`) || type
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("threats.title")}</CardTitle>
          <CardDescription>{t("threats.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("threats.title")}</CardTitle>
          <CardDescription>{t("threats.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-destructive">
            <p>{error.message}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const threats = data?.threats || []
  const pagination = data?.pagination

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("threats.title")}</CardTitle>
              <CardDescription>{t("threats.description")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-4 mb-6 flex-wrap">
            <Select value={severityFilter || "all"} onValueChange={(value) => setSeverityFilter(value === "all" ? undefined : value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("threats.filterBySeverity")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("threats.allSeverities")}</SelectItem>
                <SelectItem value="LOW">{t("threats.severity.LOW")}</SelectItem>
                <SelectItem value="MEDIUM">{t("threats.severity.MEDIUM")}</SelectItem>
                <SelectItem value="HIGH">{t("threats.severity.HIGH")}</SelectItem>
                <SelectItem value="CRITICAL">{t("threats.severity.CRITICAL")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter || "all"} onValueChange={(value) => setTypeFilter(value === "all" ? undefined : value)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t("threats.filterByType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("threats.allTypes")}</SelectItem>
                <SelectItem value="BRUTE_FORCE">{t("threats.types.BRUTE_FORCE")}</SelectItem>
                <SelectItem value="RATE_LIMIT_EXCEEDED">{t("threats.types.RATE_LIMIT_EXCEEDED")}</SelectItem>
                <SelectItem value="UNUSUAL_ACCESS_PATTERN">{t("threats.types.UNUSUAL_ACCESS_PATTERN")}</SelectItem>
                <SelectItem value="SUSPICIOUS_LOCATION">{t("threats.types.SUSPICIOUS_LOCATION")}</SelectItem>
                <SelectItem value="MULTIPLE_FAILED_LOGINS">{t("threats.types.MULTIPLE_FAILED_LOGINS")}</SelectItem>
                <SelectItem value="ANOMALY_DETECTED">{t("threats.types.ANOMALY_DETECTED")}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={statusFilter === undefined ? "all" : statusFilter ? "resolved" : "unresolved"}
              onValueChange={(value) => setStatusFilter(value === "all" ? undefined : value === "resolved")}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("threats.filterByStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("threats.allStatuses")}</SelectItem>
                <SelectItem value="unresolved">{t("threats.unresolved")}</SelectItem>
                <SelectItem value="resolved">{t("threats.resolved")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {threats.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-semibold">{t("threats.noThreats")}</p>
              <p className="text-sm mt-2">{t("threats.noThreatsDescription")}</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.createdAt")}</TableHead>
                    <TableHead>Threat Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>{t("sessions.ipAddress")}</TableHead>
                    <TableHead>{t("common.user")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {threats.map((threat) => (
                    <TableRow key={threat.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{formatDistanceToNow(new Date(threat.createdAt), { addSuffix: true })}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(threat.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                          {getThreatTypeLabel(threat.threatType)}
                        </div>
                      </TableCell>
                      <TableCell>{getSeverityBadge(threat.severity)}</TableCell>
                      <TableCell>
                        {threat.ipAddress ? (
                          <span className="font-mono text-sm">{threat.ipAddress}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {threat.user ? (
                          <div className="flex flex-col">
                            <span>{threat.user.name}</span>
                            <span className="text-xs text-muted-foreground">{threat.user.email}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {threat.isResolved ? (
                          <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                            <CheckCircle2 className="h-3 w-3" />
                            {t("threats.resolved")}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                            <XCircle className="h-3 w-3" />
                            {t("threats.unresolved")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!threat.isResolved && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setThreatToResolve(threat.id)
                              setResolveDialogOpen(true)
                            }}
                            disabled={resolveMutation.isPending}
                          >
                            {t("threats.resolve")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    {t("common.showing", {
                      from: (pagination.page - 1) * pagination.limit + 1,
                      to: Math.min(pagination.page * pagination.limit, pagination.total),
                      total: pagination.total,
                    })}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={pagination.page === 1}
                    >
                      {t("common.previous")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                      disabled={pagination.page === pagination.totalPages}
                    >
                      {t("common.next")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Resolve Dialog */}
      <AlertDialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("threats.resolve")}</AlertDialogTitle>
            <AlertDialogDescription>{t("threats.resolveConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleResolve} disabled={resolveMutation.isPending}>
              {resolveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                t("threats.resolve")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
