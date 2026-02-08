"use client"

import * as React from "react"
import { useState, useTransition } from "react"
import { useTranslation } from "react-i18next"
import { Trash2, Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { bulkDeletePasswordsAction } from "@/app/admin/passwords/bulk-actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FormErrorDisplay } from "@/components/shared/form-error-display"
import { toast } from "sonner"

interface BulkDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  passwordIds: string[]
  onSuccess?: () => void
}

export function BulkDeleteDialog({
  open,
  onOpenChange,
  passwordIds,
  onSuccess,
}: BulkDeleteDialogProps) {
  const { t } = useTranslation()
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleDelete = async () => {
    setIsDeleting(true)
    setError(null)

    startTransition(async () => {
      try {
        const result = await bulkDeletePasswordsAction({
          passwordIds,
        })

        if (result.success) {
          toast.success(
            t("passwords.bulk.deleteSuccess", { count: result.deleted })
          )
          onSuccess?.()
          handleClose()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("passwords.bulk.deleteError"))
      } finally {
        setIsDeleting(false)
      }
    })
  }

  const handleClose = () => {
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            {t("passwords.bulk.delete")}
          </DialogTitle>
          <DialogDescription>
            {t("passwords.bulk.deleteDescription", { count: passwordIds.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t("passwords.bulk.deleteWarning", { count: passwordIds.length })}
            </AlertDescription>
          </Alert>

          <FormErrorDisplay error={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isDeleting || isPending}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting || isPending}>
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("passwords.bulk.deleting")}
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                {t("common.delete")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
