"use client"

import * as React from "react"
import { useState, useTransition } from "react"
import { useTranslation } from "react-i18next"
import { Folder, Loader2 } from "lucide-react"
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
import { bulkMovePasswordsAction } from "@/app/admin/passwords/bulk-actions"
import { FormErrorDisplay } from "@/components/shared/form-error-display"
import { toast } from "sonner"
import { trpc } from "@/trpc/client"

interface BulkMoveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  passwordIds: string[]
  onSuccess?: () => void
}

export function BulkMoveDialog({
  open,
  onOpenChange,
  passwordIds,
  onSuccess,
}: BulkMoveDialogProps) {
  const { t } = useTranslation()
  const [folderId, setFolderId] = useState<string>("all")
  const [isMoving, setIsMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Fetch folders
  const { data: foldersData } = trpc.folders.list.useQuery(undefined, {
    enabled: open,
  })

  const folders = foldersData?.folders || []

  const handleMove = async () => {
    setIsMoving(true)
    setError(null)

    startTransition(async () => {
      try {
        const result = await bulkMovePasswordsAction({
          passwordIds,
          folderId: folderId === "all" ? null : folderId,
        })

        if (result.success) {
          toast.success(
            t("passwords.bulk.moveSuccess", { count: result.updated })
          )
          onSuccess?.()
          handleClose()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("passwords.bulk.moveError"))
      } finally {
        setIsMoving(false)
      }
    })
  }

  const handleClose = () => {
    setFolderId("all")
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="h-5 w-5" />
            {t("passwords.bulk.moveToFolder")}
          </DialogTitle>
          <DialogDescription>
            {t("passwords.bulk.moveDescription", { count: passwordIds.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("passwords.folder")}</Label>
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger>
                <SelectValue placeholder={t("passwords.export.allFolders")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("passwords.export.allFolders")}</SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <FormErrorDisplay error={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isMoving || isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleMove} disabled={isMoving || isPending}>
            {isMoving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("passwords.bulk.moving")}
              </>
            ) : (
              <>
                <Folder className="mr-2 h-4 w-4" />
                {t("common.save")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
