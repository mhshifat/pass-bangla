"use client"

import * as React from "react"
import { useState, useTransition } from "react"
import { useTranslation } from "react-i18next"
import { Trash2, Merge, Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { bulkResolveDuplicatesAction } from "@/app/admin/passwords/duplicate-actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FormErrorDisplay } from "@/components/shared/form-error-display"
import { toast } from "sonner"

interface BulkResolveDuplicatesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  passwordIds: string[]
  keepPasswordId?: string
  onSuccess?: () => void
}

export function BulkResolveDuplicatesDialog({
  open,
  onOpenChange,
  passwordIds,
  keepPasswordId,
  onSuccess,
}: BulkResolveDuplicatesDialogProps) {
  const { t } = useTranslation()
  const [isResolving, setIsResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const action = keepPasswordId ? "merge" : "delete"

  const handleResolve = async () => {
    setIsResolving(true)
    setError(null)

    startTransition(async () => {
      try {
        const result = await bulkResolveDuplicatesAction({
          action,
          passwordIds,
          keepPasswordId,
        })

        if (result.success) {
          if (action === "delete") {
            toast.success(
              t("passwords.duplicates.deleteSuccess", { count: result.deleted || 0 })
            )
          } else {
            toast.success(
              t("passwords.duplicates.mergeSuccess", { count: result.merged || 0 })
            )
          }
          onSuccess?.()
          handleClose()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("passwords.duplicates.resolveError"))
      } finally {
        setIsResolving(false)
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
          <DialogTitle className="flex items-center gap-2">
            {action === "delete" ? (
              <>
                <Trash2 className="h-5 w-5 text-destructive" />
                {t("passwords.duplicates.deleteAll")}
              </>
            ) : (
              <>
                <Merge className="h-5 w-5" />
                {t("passwords.duplicates.merge")}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {action === "delete"
              ? t("passwords.duplicates.deleteDescription", { count: passwordIds.length })
              : t("passwords.duplicates.mergeDescription", { count: passwordIds.length - 1 })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {action === "delete"
                ? t("passwords.duplicates.deleteWarning", { count: passwordIds.length })
                : t("passwords.duplicates.mergeWarning", { count: passwordIds.length - 1 })}
            </AlertDescription>
          </Alert>

          <FormErrorDisplay error={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isResolving || isPending}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={action === "delete" ? "destructive" : "default"}
            onClick={handleResolve}
            disabled={isResolving || isPending}
          >
            {isResolving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {action === "delete"
                  ? t("passwords.duplicates.deleting")
                  : t("passwords.duplicates.merging")}
              </>
            ) : (
              <>
                {action === "delete" ? (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("common.delete")}
                  </>
                ) : (
                  <>
                    <Merge className="mr-2 h-4 w-4" />
                    {t("passwords.duplicates.merge")}
                  </>
                )}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
