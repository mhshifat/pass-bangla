"use client"

import * as React from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { showErrorFromException } from "@/lib/error-toast"
import { updateRolePermissionsAction } from "@/app/admin/roles/permissions-actions"
import { trpc } from "@/trpc/client"

interface Role {
  id: string
  name: string
  isSystem: boolean
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

interface PermissionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: Role | null
  permissions: PermissionCategory[]
}

export function PermissionsDialog({ open, onOpenChange, role, permissions }: PermissionsDialogProps) {
  const router = useRouter()
  const [selectedPermissions, setSelectedPermissions] = React.useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = React.useState(false)

  // Fetch current role permissions when dialog opens
  const { data: rolePermissionsData, isLoading: isLoadingPermissions } = trpc.roles.getPermissions.useQuery(
    { roleId: role?.id || "" },
    { enabled: !!role?.id && open }
  )

  // Update selected permissions when role permissions are loaded
  React.useEffect(() => {
    if (rolePermissionsData?.permissionKeys) {
      setSelectedPermissions(new Set(rolePermissionsData.permissionKeys))
    }
  }, [rolePermissionsData])

  const [saveState, saveFormAction, savePending] = useActionState(
    async (prevState: unknown, formData: FormData) => {
      if (!role?.id) return { error: "No role selected" }
      
      const permissionKeys = Array.from(selectedPermissions)
      return await updateRolePermissionsAction(role.id, permissionKeys)
    },
    null
  )

  React.useEffect(() => {
    if (saveState?.success) {
      toast.success("Permissions updated successfully")
      onOpenChange(false)
      router.refresh()
    } else if (saveState?.error) {
      showErrorFromException(saveState.error, "Failed to update permissions")
    }
  }, [saveState, router, onOpenChange])

  const handlePermissionToggle = (permissionKey: string) => {
    if (role?.isSystem) return
    
    setSelectedPermissions((prev) => {
      const next = new Set(prev)
      if (next.has(permissionKey)) {
        next.delete(permissionKey)
      } else {
        next.add(permissionKey)
      }
      return next
    })
  }

  const handleSave = () => {
    if (!role?.id) return
    
    const formData = new FormData()
    React.startTransition(() => {
      saveFormAction(formData)
    })
  }

  if (isLoadingPermissions) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Loading permissions...</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{role?.name} - Permissions</DialogTitle>
          <DialogDescription>
            {role?.isSystem
              ? "View permissions for this system role"
              : "Manage permissions for this custom role"}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-6">
          {permissions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No permissions available. Permissions are being initialized...</p>
            </div>
          ) : (
            permissions.map((category, index) => (
              <div key={category.category}>
                <h3 className="font-semibold text-sm mb-3">{category.category}</h3>
                <div className="space-y-3">
                  {category.items.map((permission) => (
                    <div
                      key={permission.key}
                      className="flex items-start justify-between p-3 rounded-lg border bg-card"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-sm">{permission.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {permission.description}
                        </div>
                      </div>
                      <Switch
                        disabled={role?.isSystem}
                        checked={selectedPermissions.has(permission.key)}
                        onCheckedChange={() => handlePermissionToggle(permission.key)}
                      />
                    </div>
                  ))}
                </div>
                {index < permissions.length - 1 && <Separator className="mt-6" />}
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {role?.isSystem ? "Close" : "Cancel"}
          </Button>
          {!role?.isSystem && (
            <Button onClick={handleSave} disabled={savePending}>
              {savePending ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
