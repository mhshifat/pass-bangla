"use client"

import * as React from "react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { trpc } from "@/trpc/client"
import { Loader2, Monitor, Smartphone, Tablet, Shield, ShieldOff, LogOut, AlertCircle, Fingerprint } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { parseUserAgent } from "@/lib/device-parser"
import { useIsMobile } from "@/hooks/use-mobile"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function DeviceManagement() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)
  const [untrustDialogOpen, setUntrustDialogOpen] = useState(false)
  const [deviceToManage, setDeviceToManage] = useState<{
    fingerprint: string
    deviceName: string | null
  } | null>(null)

  const { data, isLoading, error, refetch } = trpc.users.getTrustedDevices.useQuery()
  const utils = trpc.useUtils()

  const trustDeviceMutation = trpc.users.trustDeviceByFingerprint.useMutation({
    onSuccess: (result) => {
      toast.success(t("devices.trusted", { count: result.sessionsUpdated }))
      refetch()
      // Also invalidate sessions list to refresh Active Sessions component
      utils.users.listSessions.invalidate()
    },
    onError: (error) => {
      showErrorFromException(error, t("devices.trustError"))
    },
  })

  const untrustDeviceMutation = trpc.users.untrustDeviceByFingerprint.useMutation({
    onSuccess: (result) => {
      toast.success(t("devices.untrusted", { count: result.sessionsUpdated }))
      setUntrustDialogOpen(false)
      setDeviceToManage(null)
      refetch()
      // Also invalidate sessions list to refresh Active Sessions component
      utils.users.listSessions.invalidate()
    },
    onError: (error) => {
      showErrorFromException(error, t("devices.untrustError"))
    },
  })

  const revokeDeviceMutation = trpc.users.revokeDeviceSessions.useMutation({
    onSuccess: (result) => {
      toast.success(t("devices.revoked", { count: result.sessionsRevoked }))
      if (result.currentSessionRevoked) {
        toast.warning(t("devices.currentSessionRevoked"))
        // Redirect to login after a short delay
        setTimeout(() => {
          window.location.href = "/login"
        }, 2000)
      }
      setRevokeDialogOpen(false)
      setDeviceToManage(null)
      refetch()
      // Also invalidate sessions list to refresh Active Sessions component
      utils.users.listSessions.invalidate()
    },
    onError: (error) => {
      showErrorFromException(error, t("devices.revokeError"))
    },
  })

  const getDeviceIcon = (deviceType?: string | null) => {
    switch (deviceType) {
      case "mobile":
        return <Smartphone className="h-5 w-5" />
      case "tablet":
        return <Tablet className="h-5 w-5" />
      case "desktop":
        return <Monitor className="h-5 w-5" />
      default:
        return <Monitor className="h-5 w-5" />
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("devices.trustedDevices")}</CardTitle>
          <CardDescription>{t("devices.trustedDevicesDescription")}</CardDescription>
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
          <CardTitle>{t("devices.trustedDevices")}</CardTitle>
          <CardDescription>{t("devices.trustedDevicesDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-destructive">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>{t("devices.loadError")}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const devices = data?.devices || []

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("devices.trustedDevices")}
          </CardTitle>
          <CardDescription>{t("devices.trustedDevicesDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t("devices.noTrustedDevices")}</p>
              <p className="text-sm mt-2">{t("devices.noTrustedDevicesDescription")}</p>
            </div>
          ) : isMobile ? (
            // Mobile card layout
            <div className="space-y-4 md:hidden">
              {devices.map((device) => {
                const deviceInfo = parseUserAgent(device.userAgent)
                return (
                  <Card key={device.deviceFingerprint} className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="mt-1">
                            {getDeviceIcon(device.deviceType || deviceInfo.deviceType)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">
                              {device.deviceName || deviceInfo.deviceName}
                            </div>
                            {device.ipAddress && (
                              <div className="text-sm text-muted-foreground">
                                {device.ipAddress}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeviceToManage({
                                fingerprint: device.deviceFingerprint!,
                                deviceName: device.deviceName,
                              })
                              setUntrustDialogOpen(true)
                            }}
                            disabled={untrustDeviceMutation.isPending}
                          >
                            <ShieldOff className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeviceToManage({
                                fingerprint: device.deviceFingerprint!,
                                deviceName: device.deviceName,
                              })
                              setRevokeDialogOpen(true)
                            }}
                            disabled={revokeDeviceMutation.isPending}
                          >
                            <LogOut className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{t("devices.sessions")}:</span>
                          <Badge variant="secondary">
                            {device.sessionCount} {t("devices.activeSessions")}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{t("devices.lastActive")}:</span>
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(device.lastActiveAt), { addSuffix: true })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{t("devices.fingerprint")}:</span>
                          <div className="flex items-center gap-2">
                            <Fingerprint className="h-4 w-4 text-muted-foreground" />
                            <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                              {device.deviceFingerprint?.substring(0, 8)}...
                            </code>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("devices.device")}</TableHead>
                  <TableHead>{t("devices.sessions")}</TableHead>
                  <TableHead>{t("devices.lastActive")}</TableHead>
                  <TableHead>{t("devices.fingerprint")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => {
                  const deviceInfo = parseUserAgent(device.userAgent)
                  return (
                    <TableRow key={device.deviceFingerprint}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="mt-1">
                            {getDeviceIcon(device.deviceType || deviceInfo.deviceType)}
                          </div>
                          <div>
                            <div className="font-medium">
                              {device.deviceName || deviceInfo.deviceName}
                            </div>
                            {device.ipAddress && (
                              <div className="text-sm text-muted-foreground">
                                {device.ipAddress}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {device.sessionCount} {t("devices.activeSessions")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(device.lastActiveAt), { addSuffix: true })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Fingerprint className="h-4 w-4 text-muted-foreground" />
                          <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                            {device.deviceFingerprint?.substring(0, 8)}...
                          </code>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeviceToManage({
                                fingerprint: device.deviceFingerprint!,
                                deviceName: device.deviceName,
                              })
                              setUntrustDialogOpen(true)
                            }}
                            disabled={untrustDeviceMutation.isPending}
                          >
                            <ShieldOff className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeviceToManage({
                                fingerprint: device.deviceFingerprint!,
                                deviceName: device.deviceName,
                              })
                              setRevokeDialogOpen(true)
                            }}
                            disabled={revokeDeviceMutation.isPending}
                          >
                            <LogOut className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Untrust Device Dialog */}
      <AlertDialog open={untrustDialogOpen} onOpenChange={setUntrustDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("devices.untrustConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("devices.untrustConfirmDescription", {
                deviceName: deviceToManage?.deviceName || t("devices.thisDevice"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deviceToManage) {
                  untrustDeviceMutation.mutate({
                    deviceFingerprint: deviceToManage.fingerprint,
                  })
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {untrustDeviceMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                t("devices.untrust")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke Device Sessions Dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("devices.revokeConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("devices.revokeConfirmDescription", {
                deviceName: deviceToManage?.deviceName || t("devices.thisDevice"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deviceToManage) {
                  revokeDeviceMutation.mutate({
                    deviceFingerprint: deviceToManage.fingerprint,
                  })
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeDeviceMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                t("devices.revoke")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
