"use client"

import * as React from "react"
import { useState, useTransition } from "react"
import { useTranslation } from "react-i18next"
import { Tag, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { bulkAssignTagsAction, bulkRemoveTagsAction } from "@/app/admin/passwords/bulk-actions"
import { toast } from "sonner"
import { trpc } from "@/trpc/client"

interface BulkTagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  passwordIds: string[]
  mode: "assign" | "remove"
  onSuccess?: () => void
}

export function BulkTagDialog({
  open,
  onOpenChange,
  passwordIds,
  mode,
  onSuccess,
}: BulkTagDialogProps) {
  const { t } = useTranslation()
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Fetch tags (uses SSR prefetch when available)
  const { data: filtersData } = trpc.passwords.getExportFilters.useQuery(undefined, {
    enabled: open,
    staleTime: 30_000, // 30 seconds - use SSR prefetched data
  })

  const tags = filtersData?.tags || []

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    )
  }

  const handleSubmit = async () => {
    if (selectedTagIds.length === 0) {
      setError(t("passwords.bulk.selectTags"))
      return
    }

    setIsProcessing(true)
    setError(null)

    startTransition(async () => {
      try {
        if (mode === "assign") {
          const result = await bulkAssignTagsAction({
            passwordIds,
            tagIds: selectedTagIds,
          })

          if (result.success) {
            toast.success(
              t("passwords.bulk.tagAssignSuccess", { count: result.updated })
            )
            onSuccess?.()
            handleClose()
          }
        } else {
          const result = await bulkRemoveTagsAction({
            passwordIds,
            tagIds: selectedTagIds,
          })

          if (result.success) {
            toast.success(
              t("passwords.bulk.tagRemoveSuccess", { count: result.removed })
            )
            onSuccess?.()
            handleClose()
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("passwords.bulk.tagError"))
      } finally {
        setIsProcessing(false)
      }
    })
  }

  const handleClose = () => {
    setSelectedTagIds([])
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            {mode === "assign"
              ? t("passwords.bulk.assignTags")
              : t("passwords.bulk.removeTags")}
          </DialogTitle>
          <DialogDescription>
            {mode === "assign"
              ? t("passwords.bulk.tagAssignDescription", { count: passwordIds.length })
              : t("passwords.bulk.tagRemoveDescription", { count: passwordIds.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {tags.length === 0 ? (
            <Alert>
              <AlertDescription>
                {t("passwords.bulk.noTagsAvailable")}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              <Label>{t("passwords.export.tags")}</Label>
              <ScrollArea className="h-64 border rounded-md p-3">
                <div className="space-y-2">
                  {tags.map((tag) => (
                    <div
                      key={tag.id}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={`bulk-tag-${tag.id}`}
                        checked={selectedTagIds.includes(tag.id)}
                        onCheckedChange={() => toggleTag(tag.id)}
                      />
                      <Label
                        htmlFor={`bulk-tag-${tag.id}`}
                        className="text-sm font-normal cursor-pointer flex items-center gap-2 flex-1"
                      >
                        {tag.color && (
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: tag.color }}
                          />
                        )}
                        {tag.icon && <span className="text-xs shrink-0">{tag.icon}</span>}
                        {tag.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isProcessing || isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isProcessing || isPending || tags.length === 0}>
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              <>
                <Tag className="mr-2 h-4 w-4" />
                {t("common.save")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
