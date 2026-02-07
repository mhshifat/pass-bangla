"use client"

import * as React from "react"
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
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Plus, MoreHorizontal, UserMinus, UserCog } from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/trpc/client"
import { AddMemberDialog } from "./add-member-dialog"
import { showErrorFromException } from "@/lib/error-toast"

interface Team {
  id: string
  name: string
}

interface TeamMembersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  team: Team | null
}

export function TeamMembersDialog({ open, onOpenChange, team }: TeamMembersDialogProps) {
  const router = useRouter()
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false)
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = React.useState(false)
  const [isRoleDialogOpen, setIsRoleDialogOpen] = React.useState(false)
  const [memberToRemove, setMemberToRemove] = React.useState<{ id: string; name: string } | null>(
    null
  )
  const [memberToUpdateRole, setMemberToUpdateRole] = React.useState<{
    id: string
    name: string
    currentRole: string
  } | null>(null)

  // Fetch team members
  const { data: teamData, isLoading, refetch } = trpc.teams.getById.useQuery(
    { id: team?.id || "" },
    {
      enabled: open && !!team?.id,
    }
  )

  const removeMemberMutation = trpc.teams.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed successfully")
      setIsRemoveDialogOpen(false)
      setMemberToRemove(null)
      refetch()
      router.refresh()
    },
    onError: (error) => {
      showErrorFromException(error, "Failed to remove member")
    },
  })

  const updateRoleMutation = trpc.teams.updateMemberRole.useMutation({
    onSuccess: () => {
      toast.success("Member role updated successfully")
      setIsRoleDialogOpen(false)
      setMemberToUpdateRole(null)
      refetch()
      router.refresh()
    },
    onError: (error) => {
      showErrorFromException(error, "Failed to update member role")
    },
  })

  const members = teamData?.team.members || []

  const handleRemoveMember = (memberId: string, userName: string) => {
    setMemberToRemove({ id: memberId, name: userName })
    setIsRemoveDialogOpen(true)
  }

  const confirmRemoveMember = () => {
    if (!team || !memberToRemove) return

    removeMemberMutation.mutate({
      teamId: team.id,
      userId: memberToRemove.id,
    })
  }

  const handleChangeRole = (memberId: string, userName: string, currentRole: string) => {
    setMemberToUpdateRole({ id: memberId, name: userName, currentRole })
    setIsRoleDialogOpen(true)
  }

  const confirmChangeRole = (newRole: "MANAGER" | "MEMBER") => {
    if (!team || !memberToUpdateRole) return

    updateRoleMutation.mutate({
      teamId: team.id,
      userId: memberToUpdateRole.id,
      role: newRole,
    })
  }

  const handleAddMemberSuccess = () => {
    refetch()
    router.refresh()
  }

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{team?.name} - Members</DialogTitle>
            <DialogDescription>Loading members...</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{team?.name} - Members</DialogTitle>
            <DialogDescription>Manage team members and their roles</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddDialogOpen(true)}
                disabled={!team}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Member
              </Button>
            </div>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {members.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No members yet. Add your first member to get started.
                </div>
              ) : (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={member.user.image || undefined} alt={member.user.name} />
                        <AvatarFallback>
                          {member.user.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-sm">{member.user.name}</div>
                        <div className="text-xs text-muted-foreground">{member.user.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={member.role === "MANAGER" ? "default" : "secondary"}>
                        {member.role === "MANAGER" ? "Manager" : "Member"}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() =>
                              handleChangeRole(
                                member.user.id,
                                member.user.name,
                                member.role
                              )
                            }
                          >
                            <UserCog className="mr-2 h-4 w-4" />
                            Change Role
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleRemoveMember(member.user.id, member.user.name)}
                          >
                            <UserMinus className="mr-2 h-4 w-4" />
                            Remove from Team
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {team && (
        <AddMemberDialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          teamId={team.id}
          onSuccess={handleAddMemberSuccess}
        />
      )}

      <AlertDialog open={isRemoveDialogOpen} onOpenChange={setIsRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {memberToRemove?.name} from this team? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveMember}
              className="bg-red-600 hover:bg-red-700"
              disabled={removeMemberMutation.isPending}
            >
              {removeMemberMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Role</AlertDialogTitle>
            <AlertDialogDescription>
              Select a new role for {memberToUpdateRole?.name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-2">
            <Button
              variant={memberToUpdateRole?.currentRole === "MANAGER" ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => confirmChangeRole("MANAGER")}
              disabled={updateRoleMutation.isPending}
            >
              Manager
            </Button>
            <Button
              variant={memberToUpdateRole?.currentRole === "MEMBER" ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => confirmChangeRole("MEMBER")}
              disabled={updateRoleMutation.isPending}
            >
              Member
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateRoleMutation.isPending}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
