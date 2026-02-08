"use client"

import * as React from "react"
import { useState, useTransition } from "react"
import { useTranslation } from "react-i18next"
import { Shield, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { bulkUpdateStrengthAction } from "@/app/admin/passwords/bulk-actions"
import { FormErrorDisplay } from "@/components/shared/form-error-display"
import { toast } from "sonner"

interface BulkStrengthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  passwordIds: string[]
  onSuccess?: () => void
}

export function BulkStrengthDialog({
  open,
  onOpenChange,
  passwordIds,
  onSuccess,
}: BulkStrengthDialogProps) {
  const { t } = useTranslation()
  const [strength, setStrength] = useState<"WEAK" | "MEDIUM" | "STRONG">("MEDIUM")
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleUpdate = async () => {
    setIsUpdating(true)
    setError(null)

    startTransition(async () => {
      try {
        const result = await bulkUpdateStrengthAction({
          passwordIds,
          strength,
        })

        if (result.success) {
          toast.success(
            t("passwords.bulk.strengthSuccess", { count: result.updated })
          )
          onSuccess?.()
          handleClose()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("passwords.bulk.strengthError"))
      } finally {
        setIsUpdating(false)
      }
    })
  }

  const handleClose = () => {
    setStrength("MEDIUM")
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("passwords.bulk.updateStrength")}
          </DialogTitle>
          <DialogDescription>
            {t("passwords.bulk.strengthDescription", { count: passwordIds.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("passwords.strength")}</Label>
            <Select value={strength} onValueChange={(value) => setStrength(value as "WEAK" | "MEDIUM" | "STRONG")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WEAK">{t("passwords.weak")}</SelectItem>
                <SelectItem value="MEDIUM">{t("passwords.medium")}</SelectItem>
                <SelectItem value="STRONG">{t("passwords.strong")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <FormErrorDisplay error={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isUpdating || isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleUpdate} disabled={isUpdating || isPending}>
            {isUpdating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              <>
                <Shield className="mr-2 h-4 w-4" />
                {t("common.save")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
