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
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { FormErrorDisplay } from "@/components/shared/form-error-display"

interface SendEmailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (subject: string, message: string) => Promise<void>
  userEmail?: string
  userName?: string
}

export function SendEmailDialog({
  open,
  onOpenChange,
  onConfirm,
  userEmail,
  userName,
}: SendEmailDialogProps) {
  const { t } = useTranslation()
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleConfirm = async () => {
    setError("")

    if (!subject.trim()) {
      setError(t("users.emailSubjectRequired"))
      return
    }

    if (!message.trim()) {
      setError(t("users.emailMessageRequired"))
      return
    }

    setIsLoading(true)
    try {
      await onConfirm(subject, message)
      setSubject("")
      setMessage("")
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("users.emailSendFailed"))
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setSubject("")
    setMessage("")
    setError("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{t("users.sendEmail")}</DialogTitle>
          <DialogDescription>
            {userName && userEmail
              ? t("users.sendEmailDescription", { userName, userEmail })
              : t("users.sendEmailDescriptionGeneric")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <FormErrorDisplay error={error} />

          <div className="space-y-2">
            <Label htmlFor="to">{t("users.emailTo")}</Label>
            <Input
              id="to"
              type="email"
              value={userEmail || ""}
              disabled
              className="bg-muted"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">{t("users.emailSubject")}</Label>
            <Input
              id="subject"
              placeholder={t("users.emailSubjectPlaceholder")}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">{t("users.emailMessage")}</Label>
            <Textarea
              id="message"
              placeholder={t("users.emailMessagePlaceholder")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isLoading}
              rows={8}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? t("users.sending") : t("users.sendEmail")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
