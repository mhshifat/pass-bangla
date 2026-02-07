"use client"

import { useState, useEffect } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import {
  PasswordsTable,
  PasswordDetailsDialog,
  PasswordFormDialog,
  PasswordsPagination,
  SharePasswordDialog,
  BulkOperationsToolbar,
  BulkMoveDialog,
  BulkTagDialog,
  BulkShareDialog,
  BulkStrengthDialog,
  BulkDeleteDialog,
} from "@/modules/passwords/client"
import { updatePasswordAction, deletePasswordAction } from "@/app/admin/passwords/actions"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { usePermissions } from "@/hooks/use-permissions"
import { showErrorFromException } from "@/lib/error-toast"
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

// Wrapper component to reset useActionState when key changes
function EditPasswordDialogWrapper({
  open,
  onOpenChange,
  password,
  passwordId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  password?: {
    id: string
    name: string
    username: string
    password: string
    url?: string | null
    folderId?: string | null
    notes?: string | null
    hasTotp: boolean
    totpSecret?: string | null
  }
  passwordId: string
}) {
  const router = useRouter()
  const [updateState, updateFormAction, updatePending] = useActionState(updatePasswordAction, null)

  // Handle update success/error
  useEffect(() => {
    if (updateState?.success) {
      toast.success("Password updated successfully")
      onOpenChange(false)
      router.refresh()
    } else if (updateState?.error) {
      toast.error(updateState.error)
    }
  }, [updateState, router, onOpenChange])

  return (
    <PasswordFormDialog
      open={open}
      onOpenChange={onOpenChange}
      password={password}
      mode="edit"
      formAction={updateFormAction}
      isPending={updatePending}
      state={updateState}
    />
  )
}

interface PasswordShare {
  shareId: string
  teamId: string | null
  teamName: string
  expiresAt: Date | null
}

interface Password {
  id: string
  name: string
  username: string
  url?: string | null
  folder: string | null
  strength: "strong" | "medium" | "weak"
  shared: boolean
  sharedWith: PasswordShare[] | string[] // Can be array of strings (legacy) or PasswordShare objects
  lastModified: string
  expiresIn: number | null
  hasTotp: boolean
  isOwner?: boolean
  isFavorite?: boolean
}

interface PasswordsListClientProps {
  passwords: Password[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export function PasswordsListClient({ passwords, pagination }: PasswordsListClientProps) {
  const router = useRouter()
  const { hasPermission } = usePermissions()
  const [selectedPassword, setSelectedPassword] = useState<Password | null>(null)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [passwordToEdit, setPasswordToEdit] = useState<Password | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [passwordToDelete, setPasswordToDelete] = useState<string | null>(null)
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)
  const [passwordToShare, setPasswordToShare] = useState<Password | null>(null)
  
  // Bulk operations state
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isBulkMoveOpen, setIsBulkMoveOpen] = useState(false)
  const [isBulkTagOpen, setIsBulkTagOpen] = useState(false)
  const [isBulkShareOpen, setIsBulkShareOpen] = useState(false)
  const [isBulkUnshareOpen, setIsBulkUnshareOpen] = useState(false)
  const [isBulkStrengthOpen, setIsBulkStrengthOpen] = useState(false)
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false)
  const [bulkTagMode, setBulkTagMode] = useState<"assign" | "remove">("assign")

  // Use a key to reset the dialog component when needed
  const [editKey, setEditKey] = useState(0)

  // Listen for command palette events to open password details
  useEffect(() => {
    const handleOpenPasswordDetails = (event: CustomEvent<{ passwordId: string }>) => {
      const password = passwords.find((p) => p.id === event.detail.passwordId)
      if (password) {
        setSelectedPassword(password)
        setIsViewDialogOpen(true)
      }
    }

    window.addEventListener("openPasswordDetails", handleOpenPasswordDetails as EventListener)
    return () => {
      window.removeEventListener("openPasswordDetails", handleOpenPasswordDetails as EventListener)
    }
  }, [passwords])

  // Fetch password details for editing
  const { data: passwordData, isLoading: isLoadingPasswordData } = trpc.passwords.getById.useQuery(
    { id: passwordToEdit?.id || "" },
    {
      enabled: isEditDialogOpen && !!passwordToEdit?.id,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
    }
  )

  const handleViewDetails = (password: Password) => {
    setSelectedPassword(password)
    setIsViewDialogOpen(true)
  }

  const handleEdit = (password: Password) => {
    // Close view dialog first
    if (isViewDialogOpen) {
      setIsViewDialogOpen(false)
    }
    // Set password to edit and increment key to reset dialog component
    setPasswordToEdit(password)
    setEditKey((prev) => prev + 1)
    // Open edit dialog
    setIsEditDialogOpen(true)
  }

  const handleEditDialogClose = (open: boolean) => {
    setIsEditDialogOpen(open)
    if (!open) {
      setPasswordToEdit(null)
      // Reset key when dialog closes to clear any stale state
      setEditKey((prev) => prev + 1)
    }
  }

  const handleDelete = (password: Password) => {
    setPasswordToDelete(password.id)
    setIsDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!passwordToDelete) return

    try {
      const result = await deletePasswordAction(passwordToDelete)
      if (result.success) {
        toast.success("Password deleted successfully")
        setIsDeleteDialogOpen(false)
        setPasswordToDelete(null)
        router.refresh()
      } else if (result.error) {
        toast.error(result.error)
      }
    } catch (error) { showErrorFromException(error, "Failed to delete password") }
  }

  const handleShare = (password: Password) => {
    setPasswordToShare(password)
    setIsShareDialogOpen(true)
  }

  const handleShareSuccess = () => {
    router.refresh()
  }

  const handleBulkSuccess = () => {
    setSelectedIds([])
    router.refresh()
  }

  return (
    <>
      <div className="pb-20">
        <PasswordsTable
          passwords={passwords}
          onViewDetails={handleViewDetails}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onShare={handleShare}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
        <PasswordsPagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={pagination.pageSize}
        />
      </div>
      <BulkOperationsToolbar
        selectedCount={selectedIds.length}
        onBulkDelete={() => setIsBulkDeleteOpen(true)}
        onBulkMove={() => setIsBulkMoveOpen(true)}
        onBulkTag={() => {
          setBulkTagMode("assign")
          setIsBulkTagOpen(true)
        }}
        onBulkRemoveTags={() => {
          setBulkTagMode("remove")
          setIsBulkTagOpen(true)
        }}
        onBulkShare={() => setIsBulkShareOpen(true)}
        onBulkUnshare={() => setIsBulkUnshareOpen(true)}
        onBulkStrength={() => setIsBulkStrengthOpen(true)}
        onClearSelection={() => setSelectedIds([])}
        hasDeletePermission={hasPermission("password.delete")}
        hasEditPermission={hasPermission("password.edit")}
        hasSharePermission={hasPermission("password.share")}
      />
      <PasswordDetailsDialog
        open={isViewDialogOpen}
        onOpenChange={setIsViewDialogOpen}
        password={selectedPassword}
        onEdit={handleEdit}
      />
      {isEditDialogOpen && passwordToEdit && (
        <EditPasswordDialogWrapper
          key={`${passwordToEdit.id}-${editKey}`}
          open={isEditDialogOpen}
          onOpenChange={handleEditDialogClose}
          password={passwordData ? {
            ...passwordData,
            passwordEncrypted: passwordData.passwordEncrypted ?? false,
            totpEncrypted: passwordData.totpEncrypted ?? false,
          } : undefined}
          passwordId={passwordToEdit.id}
        />
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the password
              and remove it from all shared teams.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {passwordToShare && (
        <SharePasswordDialog
          open={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
          passwordId={passwordToShare.id}
          passwordName={passwordToShare.name}
          onSuccess={handleShareSuccess}
        />
      )}

      {/* Bulk Operations Dialogs */}
      <BulkDeleteDialog
        open={isBulkDeleteOpen}
        onOpenChange={setIsBulkDeleteOpen}
        passwordIds={selectedIds}
        onSuccess={handleBulkSuccess}
      />
      <BulkMoveDialog
        open={isBulkMoveOpen}
        onOpenChange={setIsBulkMoveOpen}
        passwordIds={selectedIds}
        onSuccess={handleBulkSuccess}
      />
      <BulkTagDialog
        open={isBulkTagOpen}
        onOpenChange={setIsBulkTagOpen}
        passwordIds={selectedIds}
        mode={bulkTagMode}
        onSuccess={handleBulkSuccess}
      />
      <BulkShareDialog
        open={isBulkShareOpen}
        onOpenChange={setIsBulkShareOpen}
        passwordIds={selectedIds}
        mode="share"
        onSuccess={handleBulkSuccess}
      />
      <BulkShareDialog
        open={isBulkUnshareOpen}
        onOpenChange={setIsBulkUnshareOpen}
        passwordIds={selectedIds}
        mode="unshare"
        onSuccess={handleBulkSuccess}
      />
      <BulkStrengthDialog
        open={isBulkStrengthOpen}
        onOpenChange={setIsBulkStrengthOpen}
        passwordIds={selectedIds}
        onSuccess={handleBulkSuccess}
      />
    </>
  )
}

