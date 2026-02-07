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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { Plus, MoreHorizontal, Trash2, FolderKey, Clock } from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/trpc/client"
import { AddPasswordShareDialog } from "./add-password-share-dialog"
import { showErrorFromException } from "@/lib/error-toast"

interface Team {
  id: string
  name: string
}

interface TeamPasswordsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  team: Team | null
}

export function TeamPasswordsDialog({ open, onOpenChange, team }: TeamPasswordsDialogProps) {
  const router = useRouter()
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false)
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = React.useState(false)
  const [shareToRemove, setShareToRemove] = React.useState<{ id: string; name: string } | null>(
    null
  )

  // Fetch team passwords
  const { data: passwordsData, isLoading, refetch } = trpc.teams.getTeamPasswords.useQuery(
    { teamId: team?.id || "" },
    {
      enabled: open && !!team?.id,
    }
  )

  const removeShareMutation = trpc.teams.removeTeamPasswordShare.useMutation({
    onSuccess: () => {
      toast.success("Password share removed successfully")
      setIsRemoveDialogOpen(false)
      setShareToRemove(null)
      refetch()
      router.refresh()
    },
    onError: (error) => {
      showErrorFromException(error, "Failed to remove password share")
    },
  })

  const passwords = passwordsData?.passwords || []

  const handleRemoveShare = (shareId: string, passwordName: string) => {
    setShareToRemove({ id: shareId, name: passwordName })
    setIsRemoveDialogOpen(true)
  }

  const confirmRemoveShare = () => {
    if (!shareToRemove) return

    removeShareMutation.mutate({
      shareId: shareToRemove.id,
    })
  }

  const handleAddPasswordSuccess = () => {
    refetch()
    router.refresh()
  }

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>{team?.name} - Shared Passwords</DialogTitle>
            <DialogDescription>Loading passwords...</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>{team?.name} - Shared Passwords</DialogTitle>
            <DialogDescription>
              Manage passwords shared with this team. All team members will have access to shared passwords.
            </DialogDescription>
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
                Share Password
              </Button>
            </div>
            <div className="border rounded-lg">
              {passwords.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No passwords shared with this team yet. Share your first password to get started.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Password Name</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {passwords.map((password) => (
                      <TableRow key={password.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FolderKey className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium">{password.name}</div>
                              {password.url && (
                                <div className="text-xs text-muted-foreground">{password.url}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{password.username}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{password.owner.name}</div>
                        </TableCell>
                        <TableCell>
                          {password.expiresAt ? (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {new Date(password.expiresAt).toLocaleDateString()}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Never</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
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
                                className="text-red-600"
                                onClick={() => handleRemoveShare(password.id, password.name)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove Share
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
        <AddPasswordShareDialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          teamId={team.id}
          onSuccess={handleAddPasswordSuccess}
        />
      )}

      <AlertDialog open={isRemoveDialogOpen} onOpenChange={setIsRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Password Share?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove &quot;{shareToRemove?.name}&quot; from this team? Team members
              will no longer have access to this password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveShare}
              className="bg-red-600 hover:bg-red-700"
              disabled={removeShareMutation.isPending}
            >
              {removeShareMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

