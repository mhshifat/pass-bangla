"use client"

import * as React from "react"
import { useActionState, useOptimistic, startTransition } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
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
import { toast } from "sonner"
import { UserFormDialog } from "./user-form-dialog"
import { UsersTable } from "./users-table"
import { ResetPasswordDialog } from "./reset-password-dialog"
import { SendEmailDialog } from "./send-email-dialog"
import { OnboardingShareDialog } from "./onboarding-share-dialog"
import { createUserAction, updateUserAction, deleteUserAction, resetPasswordAction } from "@/app/admin/users/actions"
import { sendEmailAction } from "@/app/admin/users/email-actions"
import { useRouter, useSearchParams } from "next/navigation"
import { usePermissions } from "@/hooks/use-permissions"
import { trpc } from "@/trpc/client"
import { useTranslation } from "react-i18next"
import { showErrorFromException } from "@/lib/error-toast"

interface User {
  id: string
  name: string
  email: string
  role: string
  createdById?: string | null
  mfaEnabled?: boolean
  isActive: boolean
  lastLoginAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

interface UserActionsClientProps {
  users: User[]
  currentUserId?: string
  isSuperAdmin?: boolean
  currentUser: User
}

export function UserActionsClient({ users, currentUserId, isSuperAdmin = false, currentUser }: UserActionsClientProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { hasPermission } = usePermissions()

  // Deep-link support: opening /admin/users?new=1 (e.g. the "Create user"
  // command from the dashboard / command palette) jumps straight into creation.
  React.useEffect(() => {
    if (searchParams.get("new") === "1" && hasPermission("user.create")) {
      setIsCreateDialogOpen(true)
      router.replace("/admin/users")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  const utils = trpc.useUtils()

  // Optimistic list: a deleted user disappears instantly and reconciles with the
  // server prop once `router.refresh()` re-runs the server component.
  const [optimisticUsers, removeOptimisticUser] = useOptimistic(
    users,
    (state: User[], idToRemove: string) => state.filter((u) => u.id !== idToRemove)
  )
  const resetMfa = trpc.auth.resetUserMfa.useMutation({
    onSuccess: () => {
      toast.success(t("users.mfaResetSuccess"))
      router.refresh()
    },
    onError: (error) => {
      showErrorFromException(error, t("users.mfaResetFailed"))
    },
  })
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false)
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = React.useState(false)
  const [isSendEmailDialogOpen, setIsSendEmailDialogOpen] = React.useState(false)
  const [selectedUser, setSelectedUser] = React.useState<User | null>(null)
  const [userToDelete, setUserToDelete] = React.useState<string | null>(null)
  const [userToResetPassword, setUserToResetPassword] = React.useState<{ id: string; name: string } | null>(null)
  const [userToEmail, setUserToEmail] = React.useState<{ id: string; name: string; email: string } | null>(null)

  // Onboarding share (welcome the newly created user / re-invite an existing one)
  const [isOnboardingOpen, setIsOnboardingOpen] = React.useState(false)
  const [onboardingUser, setOnboardingUser] = React.useState<{ name: string; email: string; password?: string; variant?: "new" | "reminder" } | null>(null)
  // Captures the credentials submitted in the create form so we can prefill the
  // onboarding share once creation succeeds.
  const pendingCreateRef = React.useRef<{ name: string; email: string; password?: string } | null>(null)

  const [createState, createFormAction, createPending] = useActionState(createUserAction, null)
  const [updateState, updateFormAction, updatePending] = useActionState(
    updateUserAction.bind(null, selectedUser?.id || ""),
    null
  )

  const handleEdit = (user: { id: string; name: string; email: string; role: string; status: string; mfa: boolean }) => {
    const foundUser = users.find((u) => u.id === user.id)
    if (foundUser) {
      setSelectedUser(foundUser)
      setIsEditDialogOpen(true)
    }
  }

  const handleDelete = (userId: string) => {
    setUserToDelete(userId)
    setIsDeleteDialogOpen(true)
  }

  const handleResetPassword = (userId: string) => {
    const user = users.find((u) => u.id === userId)
    if (user) {
      setUserToResetPassword({ id: user.id, name: user.name })
      setIsResetPasswordDialogOpen(true)
    }
  }

  const handleEmail = (userId: string) => {
    const user = users.find((u) => u.id === userId)
    if (user) {
      setUserToEmail({ id: user.id, name: user.name, email: user.email })
      setIsSendEmailDialogOpen(true)
    }
  }

  const handleResetMfa = (userId: string) => {
    resetMfa.mutate({ userId })
  }

  const confirmEmail = async (subject: string, message: string) => {
    if (userToEmail) {
      const formData = new FormData()
      formData.append("userId", userToEmail.id)
      formData.append("subject", subject)
      formData.append("message", message)

      const result = await sendEmailAction(null, formData)
      if (result.error) {
        throw new Error(result.error)
      }
      toast.success(t("users.emailSentSuccess", { email: userToEmail.email }))
      router.refresh()
      setUserToEmail(null)
    }
  }

  const confirmResetPassword = async (newPassword: string) => {
    if (userToResetPassword) {
      const result = await resetPasswordAction(userToResetPassword.id, newPassword)
      if (result.error) {
        throw new Error(result.error)
      }
      toast.success(t("users.passwordResetSuccess"))
      router.refresh()
      setUserToResetPassword(null)
    }
  }

  const confirmDelete = () => {
    if (!userToDelete) return
    const id = userToDelete

    // Close immediately; the row disappears optimistically while the server
    // processes the deletion in the background.
    setIsDeleteDialogOpen(false)
    setUserToDelete(null)

    startTransition(async () => {
      removeOptimisticUser(id)
      try {
        const result = await deleteUserAction(id)
        if (result.error) {
          showErrorFromException(result.error, t("users.deleteError"))
        } else {
          toast.success(t("users.userDeletedSuccess"))
        }
      } catch (error) {
        showErrorFromException(error, t("users.deleteError"))
      } finally {
        // Reconcile: keeps the row gone on success, restores it on failure.
        router.refresh()
      }
    })
  }

  React.useEffect(() => {
    if (createState?.success) {
      setIsCreateDialogOpen(false)
      toast.success(t("users.userCreatedSuccess"))
      router.refresh()
      // Offer to share onboarding details with the new user.
      if (pendingCreateRef.current) {
        setOnboardingUser({ ...pendingCreateRef.current, variant: "new" })
        setIsOnboardingOpen(true)
        pendingCreateRef.current = null
      }
    } else if ((createState as { conflict?: boolean } | null)?.conflict && pendingCreateRef.current) {
      // The email already belongs to an existing account in this company.
      // Offer to send that user their sign-in details instead.
      const email = pendingCreateRef.current.email
      const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase())
      pendingCreateRef.current = null
      if (existing) {
        toast.error(t("users.userExists", "A user with this email already exists."), {
          action: {
            label: t("users.sendSignInDetails", "Send sign-in details"),
            onClick: () => {
              setIsCreateDialogOpen(false)
              setOnboardingUser({
                name: existing.name,
                email: existing.email,
                variant: existing.lastLoginAt ? "reminder" : "new",
              })
              setIsOnboardingOpen(true)
            },
          },
        })
      }
    }
  }, [createState, router, t, users])

  const handleSendOnboarding = (userId: string) => {
    const user = users.find((u) => u.id === userId)
    if (user) {
      // Existing user: the password isn't known. If they've signed in before,
      // send a short reminder; otherwise treat it as a pending invite (set-up).
      setOnboardingUser({
        name: user.name,
        email: user.email,
        variant: user.lastLoginAt ? "reminder" : "new",
      })
      setIsOnboardingOpen(true)
    }
  }

  React.useEffect(() => {
    if (updateState?.success) {
      setIsEditDialogOpen(false)
      toast.success(t("users.userUpdatedSuccess"))
      router.refresh()
    }
  }, [updateState, router, t])

  // Map users to the format expected by UsersTable
  // Handle cases where sensitive fields might not be included
  const mappedUsers = optimisticUsers.map((user, index) => {
    const isCreator = user.id === currentUser.createdById;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.isActive ? "active" : "inactive",
      // Only include sensitive fields if they exist AND (user is SUPER_ADMIN OR user is not the creator)
      // SUPER_ADMIN can see everything, other roles cannot see sensitive info about their creator
      mfa: (!isCreator || isSuperAdmin) && "mfaEnabled" in user ? user.mfaEnabled : undefined,
      lastLogin: (!isCreator || isSuperAdmin) && "lastLoginAt" in user && user.lastLoginAt
        ? new Date(user.lastLoginAt).toLocaleString()
        : undefined,
      avatar: `/avatars/0${(index % 5) + 1}.png`,
      isCreator: isCreator && !isSuperAdmin, // Only mark as creator if not SUPER_ADMIN
    };
  })

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        {hasPermission("user.create") && (
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("users.addUser")}
          </Button>
        )}
      </div>

      <UsersTable 
        users={mappedUsers} 
        onEdit={(user) => {
          // SUPER_ADMIN can edit anyone, others cannot edit their creator
          if (user.isCreator) return;
          if (hasPermission("user.edit")) handleEdit({
            ...user,
            mfa: user.mfa || false,
          });
        }}
        onDelete={(userId) => {
          // SUPER_ADMIN can delete anyone, others cannot delete their creator
          const user = users.find(u => u.id === userId);
          if (!isSuperAdmin && user?.createdById === currentUserId) return;
          if (hasPermission("user.delete")) handleDelete(userId);
        }}
        onResetPassword={(userId) => {
          // SUPER_ADMIN can reset anyone's password, others cannot reset their creator's password
          const user = users.find(u => u.id === userId);
          if (!isSuperAdmin && user?.createdById === currentUserId) return;
          if (hasPermission("user.edit")) handleResetPassword(userId);
        }}
        onEmail={(userId) => {
          // SUPER_ADMIN can email anyone, others cannot email their creator
          const user = users.find(u => u.id === userId);
          if (!isSuperAdmin && user?.createdById === currentUserId) return;
          if (hasPermission("user.edit")) handleEmail(userId);
        }}
        onResetMfa={(userId) => {
          // SUPER_ADMIN can reset anyone's MFA, others cannot reset their creator's MFA
          const user = users.find(u => u.id === userId);
          if (!isSuperAdmin && user?.createdById === currentUserId) return;
          if (hasPermission("user.edit")) handleResetMfa(userId);
        }}
        onSendOnboarding={(userId) => {
          const user = users.find(u => u.id === userId);
          if (!isSuperAdmin && user?.createdById === currentUserId) return;
          if (hasPermission("user.edit")) handleSendOnboarding(userId);
        }}
        onAddUser={hasPermission("user.create") ? () => setIsCreateDialogOpen(true) : undefined}
      />

      <UserFormDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        mode="create"
        formAction={(formData) => {
          pendingCreateRef.current = {
            name: (formData.get("name") as string) || "",
            email: (formData.get("email") as string) || "",
            password: (formData.get("password") as string) || undefined,
          }
          createFormAction(formData)
        }}
        isPending={createPending}
        state={createState}
      />

      <UserFormDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        user={
          selectedUser
            ? {
                id: selectedUser.id,
                name: selectedUser.name,
                email: selectedUser.email,
                role: selectedUser.role,
                status: selectedUser.isActive ? "active" : "inactive",
                mfa: selectedUser.mfaEnabled || false,
              }
            : null
        }
        mode="edit"
        formAction={updateFormAction}
        isPending={updatePending}
        state={updateState}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("users.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("users.deleteWarning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResetPasswordDialog
        open={isResetPasswordDialogOpen}
        onOpenChange={setIsResetPasswordDialogOpen}
        onConfirm={confirmResetPassword}
        userName={userToResetPassword?.name}
      />

      <SendEmailDialog
        open={isSendEmailDialogOpen}
        onOpenChange={setIsSendEmailDialogOpen}
        onConfirm={confirmEmail}
        userEmail={userToEmail?.email}
        userName={userToEmail?.name}
      />

      <OnboardingShareDialog
        open={isOnboardingOpen}
        onOpenChange={setIsOnboardingOpen}
        user={onboardingUser}
      />
    </>
  )
}
