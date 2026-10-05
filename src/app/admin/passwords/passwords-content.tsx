"use client"

import { useState, useEffect } from "react"
import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Upload, Download } from "lucide-react"
import dynamic from "next/dynamic"
import { useEverOpened } from "@/modules/passwords/client/use-ever-opened"
import { toast } from "sonner"
import { showErrorFromException } from "@/lib/error-toast"
import { createPasswordAction } from "./actions"
import { usePermissions } from "@/hooks/use-permissions"
import { useTranslation } from "react-i18next"

const PasswordFormDialog = dynamic(
  () => import("@/modules/passwords/client/password-form-dialog").then((m) => m.PasswordFormDialog),
  { ssr: false }
)
const ImportPasswordDialog = dynamic(
  () => import("@/modules/passwords/client/import-password-dialog").then((m) => m.ImportPasswordDialog),
  { ssr: false }
)
const ExportPasswordDialog = dynamic(
  () => import("@/modules/passwords/client/export-password-dialog").then((m) => m.ExportPasswordDialog),
  { ssr: false }
)

export function PasswordsContent() {
  const { t } = useTranslation()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const createMounted = useEverOpened(isCreateDialogOpen)
  const importMounted = useEverOpened(isImportDialogOpen)
  const exportMounted = useEverOpened(isExportDialogOpen)
  const { hasPermission } = usePermissions()
  const [state, formAction, isPending] = useActionState(createPasswordAction, null)

  useEffect(() => {
    if (state?.success) {
      toast.success(t("passwords.addPassword") + " " + t("common.success").toLowerCase())
      // Defer state update to prevent cascading renders; the action already revalidated the page
      const timer = setTimeout(() => {
        setIsCreateDialogOpen(false)
      }, 0)
      return () => clearTimeout(timer)
    } else if (state?.error) {
      showErrorFromException(state.error, t("passwords.createError"))
    }
  }, [state, t])

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
      {createMounted && (
        <PasswordFormDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          formAction={formAction}
          isPending={isPending}
          state={state}
        />
      )}
      {importMounted && (
        <ImportPasswordDialog
          open={isImportDialogOpen}
          onOpenChange={setIsImportDialogOpen}
        />
      )}
      {exportMounted && (
        <ExportPasswordDialog
          open={isExportDialogOpen}
          onOpenChange={setIsExportDialogOpen}
        />
      )}
    </>
  )
}
