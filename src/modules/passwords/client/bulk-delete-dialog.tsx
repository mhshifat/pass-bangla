"use client"

import * as React from "react"
import { useState, useTransition } from "react"
import { useTranslation } from "react-i18next"
import { Trash2, AlertTriangle } from "lucide-react"
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
  /**
   * Called the instant the user confirms, before the server responds, so the
   * caller can optimistically remove the rows from its list.
   */
  onOptimisticRemove?: (ids: string[]) => void
}

export function BulkDeleteDialog({
  open,
  onOpenChange,
  passwordIds,
  onSuccess,
  onOptimisticRemove,
}: BulkDeleteDialogProps) {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const handleDelete = () => {
    setError(null)

    // Optimistically remove the rows and close the dialog immediately; the
    // server call runs in the background and the list reconciles on settle.
    const ids = passwordIds
    onOptimisticRemove?.(ids)
    onOpenChange(false)

    startTransition(async () => {
      try {
        const result = await bulkDeletePasswordsAction({ passwordIds: ids })

        if (result.success) {
          toast.success(
            t("passwords.bulk.deleteSuccess", { count: result.deleted })
          )
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : t("passwords.bulk.deleteError")
        )
      } finally {
        // Reconcile the underlying list (restores rows if the delete failed).
        onSuccess?.()
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
          <Button variant="outline" onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
