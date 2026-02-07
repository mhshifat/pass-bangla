"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { UserPlus, Search } from "lucide-react"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { useCurrentUser } from "@/hooks/use-current-user"
import { showErrorFromException } from "@/lib/error-toast"

type AddMemberFormValues = {
  userId: string
  role: "MANAGER" | "MEMBER"
}

interface AddMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  teamId: string
  onSuccess: () => void
}

const addMemberSchema = z.object({
  userId: z.string().min(1, "User is required"),
  role: z.enum(["MANAGER", "MEMBER"]),
})

export function AddMemberDialog({ open, onOpenChange, teamId, onSuccess }: AddMemberDialogProps) {
    const { createdById } = useCurrentUser();
  const [userSearch, setUserSearch] = useState("")

  const form = useForm<AddMemberFormValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      userId: "",
      role: "MEMBER",
    },
  })

  // Fetch available users
  const { data: usersData, isLoading: isLoadingUsers } = trpc.teams.getAvailableUsers.useQuery(
    {
      teamId,
      search: userSearch,
    },
    {
      enabled: open && teamId.length > 0,
    }
  )

  const addMemberMutation = trpc.teams.addMember.useMutation({
    onSuccess: () => {
      toast.success("Member added successfully")
      form.reset()
      setUserSearch("")
      onOpenChange(false)
      onSuccess()
    },
    onError: (error) => {
      showErrorFromException(error, "Failed to add member")
    },
  })

  // Reset form and search when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state when closing
      form.reset()
      setUserSearch("")
    }
    onOpenChange(newOpen)
  }

  const handleSubmit = (values: AddMemberFormValues) => {
    addMemberMutation.mutate({
      teamId,
      userId: values.userId,
      role: values.role,
    })
  }

  const users = usersData?.users || []
  // Backend already filters out logged-in user, so we just filter by search if needed
  const filteredUsers = (userSearch
    ? users.filter(
        (user) =>
          user.name.toLowerCase().includes(userSearch.toLowerCase()) ||
          user.email.toLowerCase().includes(userSearch.toLowerCase())
      )
    : users).filter((user) => user.id !== createdById);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription>Add a user to this team and assign their role</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <FormLabel>Search Users</FormLabel>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  className="pl-8"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>User</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a user">
                          {field.value
                            ? users.find((u) => u.id === field.value)?.name || "Select a user"
                            : "Select a user"}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-[300px]">
                      {isLoadingUsers ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          Loading users...
                        </div>
                      ) : filteredUsers.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          {userSearch ? "No users found" : "No available users"}
                        </div>
                      ) : (
                        filteredUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name} ({user.email})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="MEMBER">Member</SelectItem>
                      <SelectItem value="MANAGER">Manager</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={addMemberMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addMemberMutation.isPending}>
                {addMemberMutation.isPending ? (
                  "Adding..."
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add Member
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

