"use client"

import * as React from "react"
import { useActionState, useOptimistic, startTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { toast } from "sonner"
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
import { TeamFormDialog } from "./team-form-dialog"
import { TeamsTable } from "./teams-table"
import { TeamMembersDialog } from "./team-members-dialog"
import { TeamPasswordsDialog } from "./team-passwords-dialog"
import { TeamsPagination } from "./teams-pagination"
import { createTeamAction, updateTeamAction, deleteTeamAction } from "@/app/admin/teams/actions"
import { useTranslation } from "react-i18next"
import { usePermissions } from "@/hooks/use-permissions"

interface Team {
  id: string
  name: string
  description: string | null
  members: number
  passwords: number
  createdAt: string
  manager: string
}

interface TeamsActionsClientProps {
  teams: Team[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export function TeamsActionsClient({ teams, pagination }: TeamsActionsClientProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { hasPermission } = usePermissions()

  // Optimistic list: a deleted team disappears instantly and reconciles with the
  // server prop once `router.refresh()` re-runs the server component.
  const [optimisticTeams, removeOptimisticTeam] = useOptimistic(
    teams,
    (state: Team[], idToRemove: string) => state.filter((tm) => tm.id !== idToRemove)
  )

  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false)
  const [isViewDialogOpen, setIsViewDialogOpen] = React.useState(false)
  const [isPasswordsDialogOpen, setIsPasswordsDialogOpen] = React.useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false)
  const [selectedTeam, setSelectedTeam] = React.useState<Team | null>(null)
  const [teamToEdit, setTeamToEdit] = React.useState<Team | null>(null)
  const [teamToDelete, setTeamToDelete] = React.useState<string | null>(null)

  const [createState, createFormAction, createPending] = useActionState(createTeamAction, null)
  const [updateState, updateFormAction, updatePending] = useActionState(
    updateTeamAction.bind(null, teamToEdit?.id || ""),
    null
  )

  React.useEffect(() => {
    if (createState?.success) {
      toast.success(t("teams.teamCreatedSuccess"))
      setIsCreateDialogOpen(false)
      router.refresh()
    } else if (createState?.error) {
      showErrorFromException(createState.error, t("teams.createError"))
    }
  }, [createState, router, t])

  React.useEffect(() => {
    if (updateState?.success) {
      toast.success(t("teams.teamUpdatedSuccess"))
      setIsEditDialogOpen(false)
      setTeamToEdit(null)
      router.refresh()
    } else if (updateState?.error) {
      showErrorFromException(updateState.error, t("teams.updateError"))
    }
  }, [updateState, router, t])

  const handleViewMembers = (team: Team) => {
    setSelectedTeam(team)
    setIsViewDialogOpen(true)
  }

  const handleManagePasswords = (team: Team) => {
    setSelectedTeam(team)
    setIsPasswordsDialogOpen(true)
  }

  const handleEdit = (team: Team) => {
    setTeamToEdit(team)
    setIsEditDialogOpen(true)
  }

  const handleDelete = (teamId: string) => {
    setTeamToDelete(teamId)
    setIsDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (!teamToDelete) return
    const id = teamToDelete

    // Close immediately; the row disappears optimistically while the server
    // processes the deletion in the background.
    setIsDeleteDialogOpen(false)
    setTeamToDelete(null)

    startTransition(async () => {
      removeOptimisticTeam(id)
      try {
        const result = await deleteTeamAction(id)
        if (result.success) {
          toast.success(t("teams.teamDeletedSuccess"))
        } else if (result.error) {
          showErrorFromException(result.error, t("teams.teamDeleteFailed"))
        }
      } catch (error) {
        showErrorFromException(error, t("teams.teamDeleteFailed"))
      } finally {
        // Reconcile: keeps the row gone on success, restores it on failure.
        router.refresh()
      }
    })
  }

  return (
    <>
      {hasPermission("team.create") && (
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("teams.createTeam")}
        </Button>
      )}

      <TeamsTable
        teams={optimisticTeams}
        onViewMembers={handleViewMembers}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCreateTeam={() => setIsCreateDialogOpen(true)}
        onManagePasswords={handleManagePasswords}
      />

      {teams.length > 0 && (
        <TeamsPagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={pagination.pageSize}
        />
      )}

      <TeamFormDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        mode="create"
        formAction={createFormAction}
        isPending={createPending}
        state={createState}
      />

      <TeamFormDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        team={teamToEdit ? { id: teamToEdit.id, name: teamToEdit.name, description: teamToEdit.description || null } : null}
        mode="edit"
        formAction={updateFormAction}
        isPending={updatePending}
        state={updateState}
      />

      <TeamMembersDialog
        open={isViewDialogOpen}
        onOpenChange={setIsViewDialogOpen}
        team={selectedTeam ? { id: selectedTeam.id, name: selectedTeam.name } : null}
      />

      <TeamPasswordsDialog
        open={isPasswordsDialogOpen}
        onOpenChange={setIsPasswordsDialogOpen}
        team={selectedTeam ? { id: selectedTeam.id, name: selectedTeam.name } : null}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("teams.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("teams.deleteWarning")}
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

