"use client"

import * as React from "react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { trpc } from "@/trpc/client"
import { Loader2, Monitor, Smartphone, Tablet, Shield, ShieldOff, LogOut, AlertCircle } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { parseUserAgent } from "@/lib/device-parser"
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

export function ActiveSessions() {
  const { t } = useTranslation()
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)
  const [revokeAllDialogOpen, setRevokeAllDialogOpen] = useState(false)
  const [sessionToRevoke, setSessionToRevoke] = useState<string | null>(null)

  const { data, isLoading, error, refetch } = trpc.users.listSessions.useQuery()
  const utils = trpc.useUtils()

  const revokeSessionMutation = trpc.users.revokeSession.useMutation({
    onSuccess: () => {
      toast.success(t("sessions.revoked"))
      refetch()
      // Also invalidate trusted devices query to refresh Device Management component
      utils.users.getTrustedDevices.invalidate()
      setRevokeDialogOpen(false)
      setSessionToRevoke(null)
    },
    onError: (error) => {
      showErrorFromException(error, t("sessions.revokeError"))
    },
  })

  const revokeAllSessionsMutation = trpc.users.revokeAllSessions.useMutation({
    onSuccess: (result) => {
      toast.success(t("sessions.allRevoked", { count: result.revokedCount }))
      refetch()
      // Also invalidate trusted devices query to refresh Device Management component
      utils.users.getTrustedDevices.invalidate()
      setRevokeAllDialogOpen(false)
    },
    onError: (error) => {
      showErrorFromException(error, t("sessions.revokeAllError"))
    },
  })

  const markTrustedMutation = trpc.users.markSessionAsTrusted.useMutation({
    onSuccess: () => {
      toast.success(t("sessions.trustedUpdated"))
      refetch()
      // Also invalidate trusted devices query to refresh Device Management component
      utils.users.getTrustedDevices.invalidate()
    },
    onError: (error) => {
      showErrorFromException(error, t("sessions.trustedUpdateError"))
    },
  })

  const handleRevoke = () => {
    if (!sessionToRevoke) return
    revokeSessionMutation.mutate({ sessionId: sessionToRevoke })
  }

  const handleRevokeAll = () => {
    revokeAllSessionsMutation.mutate()
  }

  const getDeviceIcon = (deviceType?: string | null) => {
    switch (deviceType) {
      case "mobile":
        return <Smartphone className="h-4 w-4" />
      case "tablet":
        return <Tablet className="h-4 w-4" />
      case "desktop":
        return <Monitor className="h-4 w-4" />
      default:
        return <Monitor className="h-4 w-4" />
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("sessions.activeSessions")}</CardTitle>
          <CardDescription>{t("sessions.activeSessionsDescription")}</CardDescription>
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
          <CardTitle>{t("sessions.activeSessions")}</CardTitle>
          <CardDescription>{t("sessions.activeSessionsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-destructive">
            <p>{error.message}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const sessions = data?.sessions || []
  const currentSessionId = data?.currentSessionId || null // Current session from server

  if (sessions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("sessions.activeSessions")}</CardTitle>
          <CardDescription>{t("sessions.activeSessionsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Monitor className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t("sessions.noActiveSessions")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("sessions.noActiveSessionsDescription")}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("sessions.activeSessions")}</CardTitle>
              <CardDescription>{t("sessions.activeSessionsDescription")}</CardDescription>
            </div>
            {sessions.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRevokeAllDialogOpen(true)}
                disabled={revokeAllSessionsMutation.isPending}
              >
                <LogOut className="h-4 w-4 mr-2" />
                {t("sessions.revokeAll")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sessions.map((session) => {
              const isCurrent = session.id === currentSessionId
              const deviceInfo = parseUserAgent(session.userAgent)

              return (
                <div
                  key={session.id}
                  className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="mt-1">
                    {getDeviceIcon(session.deviceType || deviceInfo.deviceType)}
                  </div>
                  <div className="flex-1 space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {session.deviceName || deviceInfo.deviceName}
                      </span>
                      {isCurrent && (
                        <Badge variant="default" className="text-xs">
                          {t("sessions.current")}
                        </Badge>
                      )}
                      {session.isTrusted && (
                        <Badge variant="secondary" className="text-xs flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          {t("sessions.trusted")}
                        </Badge>
                      )}
                      {session.requireMfa && (
                        <Badge variant="outline" className="text-xs">
                          {t("sessions.requiresMfa")}
                        </Badge>
                      )}
                    </div>
                    {session.ipAddress && (
                      <p className="text-sm text-muted-foreground">
                        {t("sessions.ipAddress")}: {session.ipAddress}
                      </p>
                    )}
                    {session.deviceFingerprint && (
                      <p className="text-xs text-muted-foreground font-mono">
                        {t("sessions.fingerprint")}: {session.deviceFingerprint.substring(0, 16)}...
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        {t("sessions.lastActive")}: {formatDistanceToNow(new Date(session.lastActiveAt), { addSuffix: true })}
                      </span>
                      <span>
                        {t("sessions.created")}: {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        markTrustedMutation.mutate({
                          sessionId: session.id,
                          isTrusted: !session.isTrusted,
                        })
                      }}
                      disabled={markTrustedMutation.isPending}
                    >
                      {session.isTrusted ? (
                        <ShieldOff className="h-4 w-4" />
                      ) : (
                        <Shield className="h-4 w-4" />
                      )}
                    </Button>
                    {!isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSessionToRevoke(session.id)
                          setRevokeDialogOpen(true)
                        }}
                        disabled={revokeSessionMutation.isPending}
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Revoke Session Dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sessions.revokeConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sessions.revokeConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-red-600 hover:bg-red-700"
            >
              {t("sessions.revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke All Sessions Dialog */}
      <AlertDialog open={revokeAllDialogOpen} onOpenChange={setRevokeAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              {t("sessions.revokeAllConfirm")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("sessions.revokeAllConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeAll}
              className="bg-red-600 hover:bg-red-700"
              disabled={revokeAllSessionsMutation.isPending}
            >
              {revokeAllSessionsMutation.isPending
                ? t("common.loading")
                : t("sessions.revokeAll")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

