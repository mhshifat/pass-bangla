"use client"

import * as React from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { RoleFormDialog } from "./role-form-dialog"
import { RolesTable } from "./roles-table"
import { PermissionsDialog } from "./permissions-dialog"
import { createRoleAction, updateRoleAction, deleteRoleAction } from "@/app/admin/roles/actions"
import { syncPermissionsAction } from "@/app/admin/roles/sync-permissions-action"
import { useTranslation } from "react-i18next"
import { usePermissions } from "@/hooks/use-permissions"
import { RefreshCw } from "lucide-react"
import { showErrorFromException } from "@/lib/error-toast"

interface Role {
  id: string
  name: string
  description: string | null
  users: number
  isSystem: boolean
  createdAt: string
}

interface Permission {
  key: string
  name: string
  description: string
}

interface PermissionCategory {
  category: string
  items: Permission[]
}

interface RolesActionsClientProps {
  roles: Role[]
  permissions: PermissionCategory[]
}

export function RolesActionsClient({ roles, permissions }: RolesActionsClientProps) {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  const router = useRouter()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false)
  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = React.useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false)
  const [selectedRole, setSelectedRole] = React.useState<Role | null>(null)
  const [roleToEdit, setRoleToEdit] = React.useState<Role | null>(null)
  const [roleToDelete, setRoleToDelete] = React.useState<string | null>(null)
  const [isSyncing, setIsSyncing] = React.useState(false)

  const [createState, createFormAction, createPending] = useActionState(createRoleAction, null)
  const [updateState, updateFormAction, updatePending] = useActionState(
    updateRoleAction.bind(null, roleToEdit?.id || ""),
    null
  )

  React.useEffect(() => {
    if (createState?.success) {
      toast.success(t("roles.roleCreatedSuccess"))
      setIsCreateDialogOpen(false)
      router.refresh()
    } else if (createState?.error) {
      toast.error(createState.error)
    }
  }, [createState, router, t])

  React.useEffect(() => {
    if (updateState?.success) {
      toast.success(t("roles.roleUpdatedSuccess"))
      setIsEditDialogOpen(false)
      setRoleToEdit(null)
      router.refresh()
    } else if (updateState?.error) {
      toast.error(updateState.error)
    }
  }, [updateState, router, t])

  const handleViewPermissions = (role: Role) => {
    setSelectedRole(role)
    setIsPermissionsDialogOpen(true)
  }

  const handleEdit = (role: Role) => {
    setRoleToEdit(role)
    setIsEditDialogOpen(true)
  }

  const handleDelete = (role: Role) => {
    setRoleToDelete(role.id)
    setIsDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (roleToDelete) {
      const result = await deleteRoleAction(roleToDelete)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t("roles.roleDeletedSuccess"))
        router.refresh()
      }
      setIsDeleteDialogOpen(false)
      setRoleToDelete(null)
    }
  }

  const handleSyncPermissions = async () => {
    setIsSyncing(true)
    try {
      const result = await syncPermissionsAction()
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Permissions and roles synced successfully")
        // Refresh the page to refetch permissions from server
        router.refresh()
      }
    } catch (error) { showErrorFromException(error, error instanceof Error ? error.message : "Failed to sync permissions") } finally {
      setIsSyncing(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {hasPermission("role.manage") && (
          <>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("roles.createRole")}
            </Button>
            <Button
              variant="outline"
              onClick={handleSyncPermissions}
              disabled={isSyncing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing..." : "Sync Permissions"}
            </Button>
          </>
        )}
      </div>

      <RolesTable 
        roles={roles} 
        onViewPermissions={handleViewPermissions}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCreateRole={() => setIsCreateDialogOpen(true)}
      />

      <RoleFormDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        mode="create"
        formAction={createFormAction}
        isPending={createPending}
        state={createState}
      />

      <RoleFormDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        role={roleToEdit}
        mode="edit"
        formAction={updateFormAction}
        isPending={updatePending}
        state={updateState}
      />

      <PermissionsDialog
        open={isPermissionsDialogOpen}
        onOpenChange={setIsPermissionsDialogOpen}
        role={selectedRole}
        permissions={permissions}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("roles.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("roles.deleteWarning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

