"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { Loader2, Shield, CheckCircle2, AlertTriangle, QrCode } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Image from "next/image"

interface MfaManagementProps {
  user: {
    id: string
    mfaEnabled: boolean
    mfaMethod?: string | null
  }
  onUpdate?: () => void
}

export function MfaManagement({ user, onUpdate }: MfaManagementProps) {
  const { t } = useTranslation()
  const [isSetupDialogOpen, setIsSetupDialogOpen] = React.useState(false)
  const [isDisableDialogOpen, setIsDisableDialogOpen] = React.useState(false)
  const [verificationCode, setVerificationCode] = React.useState("")
  const [qrCode, setQrCode] = React.useState("")

  const utils = trpc.useUtils()

  const generateQrMutation = trpc.auth.generateMfaQr.useQuery(
    undefined,
    {
      enabled: false,
    }
  )

  const enableMfaMutation = trpc.auth.setupMfa.useMutation({
    onSuccess: () => {
      toast.success(t("mfa.setupSuccess"))
      setIsSetupDialogOpen(false)
      setVerificationCode("")
      onUpdate?.()
    },
    onError: (error) => {
      toast.error(error.message || t("mfa.setupError"))
    },
  })

  const disableMfaMutation = trpc.auth.disableMfa.useMutation({
    onSuccess: () => {
      toast.success(t("mfa.disableSuccess"))
      setIsDisableDialogOpen(false)
      onUpdate?.()
    },
    onError: (error) => {
      toast.error(error.message || t("mfa.disableError"))
    },
  })

  const handleSetupMfa = async () => {
    try {
      // Generate QR code
      const result = await generateQrMutation.refetch()
      if (result.data?.qr) {
        setQrCode(result.data.qr)
        setIsSetupDialogOpen(true)
      }
    } catch (error) {
      toast.error(t("mfa.generateQrError"))
    }
  }

  const handleVerifySetup = () => {
    if (!verificationCode || verificationCode.length !== 6) {
      toast.error(t("mfa.invalidCode"))
      return
    }
    enableMfaMutation.mutate({ code: verificationCode })
  }

  const handleDisableMfa = () => {
    disableMfaMutation.mutate()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("mfa.title")}
          </CardTitle>
          <CardDescription>{t("mfa.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{t("mfa.status")}</p>
                <Badge variant={user.mfaEnabled ? "default" : "secondary"}>
                  {user.mfaEnabled ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {t("mfa.enabled")}
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {t("mfa.disabled")}
                    </>
                  )}
                </Badge>
                {user.mfaEnabled && user.mfaMethod && (
                  <Badge variant="outline">{user.mfaMethod}</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {user.mfaEnabled
                  ? t("mfa.enabledDescription")
                  : t("mfa.disabledDescription")}
              </p>
            </div>
            {user.mfaEnabled ? (
              <Button
                variant="destructive"
                onClick={() => setIsDisableDialogOpen(true)}
              >
                {t("mfa.disable")}
              </Button>
            ) : (
              <Button onClick={handleSetupMfa}>
                <QrCode className="mr-2 h-4 w-4" />
                {t("mfa.setup")}
              </Button>
            )}
          </div>

          {!user.mfaEnabled && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {t("mfa.recommendationMessage")}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Setup Dialog */}
      <Dialog open={isSetupDialogOpen} onOpenChange={setIsSetupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("mfa.setupTitle")}</DialogTitle>
            <DialogDescription>{t("mfa.setupDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {qrCode && (
              <div className="flex flex-col items-center space-y-4">
                <div className="bg-white p-4 rounded-lg">
                  <Image
                    src={qrCode}
                    alt="MFA QR Code"
                    width={200}
                    height={200}
                    className="mx-auto"
                  />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  {t("mfa.scanQrCode")}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="verification-code">{t("mfa.verificationCode")}</Label>
              <Input
                id="verification-code"
                type="text"
                placeholder="000000"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                disabled={enableMfaMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                {t("mfa.enterCodeFromApp")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsSetupDialogOpen(false)
                setVerificationCode("")
              }}
              disabled={enableMfaMutation.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleVerifySetup}
              disabled={enableMfaMutation.isPending || verificationCode.length !== 6}
            >
              {enableMfaMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                t("mfa.verify")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable Dialog */}
      <Dialog open={isDisableDialogOpen} onOpenChange={setIsDisableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("mfa.disableTitle")}</DialogTitle>
            <DialogDescription>{t("mfa.disableDescription")}</DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t("mfa.disableWarning")}
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDisableDialogOpen(false)}
              disabled={disableMfaMutation.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisableMfa}
              disabled={disableMfaMutation.isPending}
            >
              {disableMfaMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                t("mfa.disableConfirm")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

