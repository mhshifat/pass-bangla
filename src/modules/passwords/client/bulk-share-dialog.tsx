"use client"

import * as React from "react"
import { useState, useTransition } from "react"
import { useTranslation } from "react-i18next"
import { Share2, Loader2, Users } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { bulkSharePasswordsAction, bulkUnsharePasswordsAction } from "@/app/admin/passwords/bulk-actions"
import { FormErrorDisplay } from "@/components/shared/form-error-display"
import { toast } from "sonner"
import { trpc } from "@/trpc/client"

interface BulkShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  passwordIds: string[]
  mode: "share" | "unshare"
  onSuccess?: () => void
}

export function BulkShareDialog({
  open,
  onOpenChange,
  passwordIds,
  mode,
  onSuccess,
}: BulkShareDialogProps) {
  const { t } = useTranslation()
  const [teamId, setTeamId] = useState<string>("")
  const [expiresAt, setExpiresAt] = useState<string>("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Fetch teams
  const { data: teamsData } = trpc.teams.list.useQuery(
    {
      page: 1,
      pageSize: 100,
    },
    {
      enabled: open,
    }
  )

  const teams = teamsData?.teams || []

  const handleSubmit = async () => {
    if (mode === "share" && !teamId) {
      setError(t("passwords.bulk.selectTeam"))
      return
    }

    setIsProcessing(true)
    setError(null)

    startTransition(async () => {
      try {
        if (mode === "share") {
          const result = await bulkSharePasswordsAction({
            passwordIds,
            teamId,
            expiresAt: expiresAt || undefined,
          })

          if (result.success) {
            toast.success(
              t("passwords.bulk.shareSuccess", { count: result.shared })
            )
            onSuccess?.()
            handleClose()
          }
        } else {
          const result = await bulkUnsharePasswordsAction({
            passwordIds,
            teamId: teamId || undefined,
          })

          if (result.success) {
            toast.success(
              t("passwords.bulk.unshareSuccess", { count: result.unshared })
            )
            onSuccess?.()
            handleClose()
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("passwords.bulk.shareError"))
      } finally {
        setIsProcessing(false)
      }
    })
  }

  const handleClose = () => {
    setTeamId("")
    setExpiresAt("")
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            {mode === "share"
              ? t("passwords.bulk.share")
              : t("passwords.bulk.unshare")}
          </DialogTitle>
          <DialogDescription>
            {mode === "share"
              ? t("passwords.bulk.shareDescription", { count: passwordIds.length })
              : t("passwords.bulk.unshareDescription", { count: passwordIds.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t("teams.title")}
            </Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger>
                <SelectValue placeholder={t("passwords.bulk.selectTeam")} />
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === "share" && (
            <div className="space-y-2">
              <Label>{t("passwords.expiresAt")} ({t("common.optional")})</Label>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          )}

          <FormErrorDisplay error={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isProcessing || isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isProcessing || isPending || (mode === "share" && !teamId)}>
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              <>
                <Share2 className="mr-2 h-4 w-4" />
                {t("common.save")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
