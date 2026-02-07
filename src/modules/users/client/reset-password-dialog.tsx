"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput, generateStrongPassword } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

interface ResetPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (newPassword: string) => Promise<void>
  userName?: string
}

export function ResetPasswordDialog({
  open,
  onOpenChange,
  onConfirm,
  userName,
}: ResetPasswordDialogProps) {
  const { t } = useTranslation()
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleConfirm = async () => {
    setError("")

    if (!newPassword || newPassword.length < 8) {
      setError(t("errors.passwordTooShort"))
      return
    }

    if (newPassword !== confirmPassword) {
      setError(t("errors.passwordsDoNotMatch"))
      return
    }

    setIsLoading(true)
    try {
      await onConfirm(newPassword)
      setNewPassword("")
      setConfirmPassword("")
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("users.passwordResetFailed"))
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setNewPassword("")
    setConfirmPassword("")
    setError("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("users.resetPassword")}</DialogTitle>
          <DialogDescription>
            {userName 
              ? t("users.resetPasswordDescription", { userName })
              : t("users.resetPasswordDescriptionGeneric")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="newPassword">{t("users.newPassword")}</Label>
            <PasswordInput
              id="newPassword"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isLoading}
              showToggleButton={true}
              showGenerateButton={true}
              onGenerate={() => setNewPassword(generateStrongPassword(16))}
            />
            <p className="text-xs text-muted-foreground">
              {t("users.resetPasswordHint")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("users.confirmPassword")}</Label>
            <PasswordInput
              id="confirmPassword"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              showToggleButton={true}
              showGenerateButton={false}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? t("users.resetting") : t("users.resetPassword")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
