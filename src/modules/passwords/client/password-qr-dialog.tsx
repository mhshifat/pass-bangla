"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Copy, QrCode } from "lucide-react"
import { useClipboard } from "@/hooks/use-clipboard"
import { useCurrentUser } from "@/hooks/use-current-user"
import { toast } from "sonner"
import QRCode from "react-qr-code"
import { trpc } from "@/trpc/client"
import { decryptPasswordClient } from "@/lib/client-crypto"
import { authenticator } from "otplib"

interface PasswordQrDialogProps {
  passwordId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PasswordQrDialog({ passwordId, open, onOpenChange }: PasswordQrDialogProps) {
  const { t } = useTranslation()
  const { copy: copyToClipboard } = useClipboard()
  const { user } = useCurrentUser()

  const { data: password, isLoading: isPasswordLoading } = trpc.passwords.getById.useQuery(
    { id: passwordId! },
    { enabled: !!passwordId && open }
  )

  const [decryptedData, setDecryptedData] = React.useState<{
    username?: string
    url?: string
    password?: string
    totpSecret?: string
  } | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)

  React.useEffect(() => {
    if (password && open && user?.id) {
      setIsLoading(true)
      // getById returns server-decrypted plaintext (passwordEncrypted:false). Only
      // run client-side decryption if the payload is actually flagged encrypted
      // (legacy transport) — otherwise decrypting plaintext throws "invalid format".
      const resolvePassword = password.passwordEncrypted
        ? decryptPasswordClient(password.password, user.id)
        : Promise.resolve(password.password)
      const resolveTotp = password.totpSecret
        ? (password.totpEncrypted
            ? decryptPasswordClient(password.totpSecret, user.id)
            : Promise.resolve(password.totpSecret))
        : Promise.resolve(undefined)
      Promise.all([resolvePassword, resolveTotp]).then(([decryptedPassword, decryptedTotp]) => {
        setDecryptedData({
          username: password.username,
          url: password.url ?? undefined,
          password: decryptedPassword,
          totpSecret: decryptedTotp
        })
        setIsLoading(false)
      }).catch((error) => {
        console.error("Failed to decrypt password data:", error)
        toast.error(t("qrCode.qrCodeDecryptError"))
        setIsLoading(false)
      })
    } else {
      setDecryptedData(null)
    }
  }, [password, open, user?.id, t])

  const qrData = React.useMemo(() => {
    if (!decryptedData) return null

    // Generate TOTP code if secret is available
    let totpCode: string | undefined
    if (decryptedData.totpSecret) {
      try {
        totpCode = authenticator.generate(decryptedData.totpSecret)
      } catch (error) {
        console.error("Failed to generate TOTP code:", error)
        totpCode = undefined
      }
    }

    // Create a JSON object with the password data
    const data = {
      name: password?.name,
      username: decryptedData.username,
      url: decryptedData.url,
      password: decryptedData.password,
      totpCode: totpCode
    }

    return JSON.stringify(data)
  }, [decryptedData, password?.name])

  const handleCopyData = async () => {
    if (!decryptedData) return

    // Generate TOTP code if secret is available
    let totpCode: string | undefined
    if (decryptedData.totpSecret) {
      try {
        totpCode = authenticator.generate(decryptedData.totpSecret)
      } catch (error) {
        console.error("Failed to generate TOTP code:", error)
        totpCode = undefined
      }
    }

    const text = [
      `Name: ${password?.name}`,
      decryptedData.username && `Username: ${decryptedData.username}`,
      decryptedData.url && `URL: ${decryptedData.url}`,
      decryptedData.password && `Password: ${decryptedData.password}`,
      totpCode && `TOTP Code: ${totpCode}`
    ].filter(Boolean).join('\n')

    await copyToClipboard(text)
    toast.success(t("qrCodeDataCopied"))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            {t("qrCode.qrCodeTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("qrCode.qrCodeDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center space-y-4">
          {isPasswordLoading || isLoading ? (
            <div className="flex items-center justify-center h-48 w-48 border rounded-lg">
              <div className="text-muted-foreground">{t("common.loading")}</div>
            </div>
          ) : qrData ? (
            <div className="p-4 bg-white rounded-lg border">
              <QRCode value={qrData} size={200} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 w-48 border rounded-lg">
              <div className="text-muted-foreground">{t("qrCode.qrCodeError")}</div>
            </div>
          )}

          <Button
            onClick={handleCopyData}
            disabled={!decryptedData || isPasswordLoading || isLoading}
            variant="outline"
            className="w-full"
          >
            <Copy className="mr-2 h-4 w-4" />
            {t("qrCode.copyData")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}