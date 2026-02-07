"use client"

import { useState, useEffect } from "react"
import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Upload, Download } from "lucide-react"
import { PasswordFormDialog, ImportPasswordDialog, ExportPasswordDialog } from "@/modules/passwords/client"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { createPasswordAction } from "./actions"
import { usePermissions } from "@/hooks/use-permissions"
import { useTranslation } from "react-i18next"

export function PasswordsContent() {
  const { t } = useTranslation()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const router = useRouter()
  const { hasPermission } = usePermissions()
  const [state, formAction, isPending] = useActionState(createPasswordAction, null)

  useEffect(() => {
    if (state?.success) {
      toast.success(t("passwords.addPassword") + " " + t("common.success").toLowerCase())
      // Defer state update to prevent cascading renders
      const timer = setTimeout(() => {
        setIsCreateDialogOpen(false)
        router.refresh()
      }, 0)
      return () => clearTimeout(timer)
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, router, t])

  const canCreate = hasPermission("password.create")
  const canImport = hasPermission("password.create")
  const canExport = hasPermission("password.view")

  if (!canCreate && !canImport && !canExport) {
    return null
  }

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {canCreate && (
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("passwords.addPassword")}
          </Button>
        )}
        {canImport && (
          <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            {t("passwords.import.title")}
          </Button>
        )}
        {canExport && (
          <Button variant="outline" onClick={() => setIsExportDialogOpen(true)}>
            <Download className="mr-2 h-4 w-4" />
            {t("passwords.export.title")}
          </Button>
        )}
      </div>
      <PasswordFormDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        formAction={formAction}
        isPending={isPending}
        state={state}
      />
      <ImportPasswordDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onSuccess={() => router.refresh()}
      />
      <ExportPasswordDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        onSuccess={() => router.refresh()}
      />
    </>
  )
}

