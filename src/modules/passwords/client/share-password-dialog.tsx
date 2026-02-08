"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { useActionState } from "react"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Search, AlertCircle, Users, Link2 } from "lucide-react"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { showErrorFromException } from "@/lib/error-toast"
import { FormErrorDisplay } from "@/components/shared/form-error-display"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { sharePasswordWithTeamAction } from "@/app/admin/passwords/share-actions"
import { TemporaryShareDialog } from "./temporary-share-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type SharePasswordFormValues = {
  teamId: string
  expiresAt?: string
}

interface SharePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  passwordId: string
  passwordName: string
  onSuccess: () => void
}

const sharePasswordSchema = z.object({
  teamId: z.string().min(1, "Team is required"),
  expiresAt: z.string().optional(),
})

export function SharePasswordDialog({
  open,
  onOpenChange,
  passwordId,
  passwordName,
  onSuccess,
}: SharePasswordDialogProps) {
  const [teamSearch, setTeamSearch] = useState("")
  const [isTemporaryShareOpen, setIsTemporaryShareOpen] = useState(false)

  const form = useForm<SharePasswordFormValues>({
    resolver: zodResolver(sharePasswordSchema),
    defaultValues: {
      teamId: "",
      expiresAt: "",
    },
  })

  const [shareState, shareFormAction, sharePending] = useActionState(
    sharePasswordWithTeamAction.bind(null, passwordId),
    null
  )

  // Fetch teams
  const { data: teamsData, isLoading: isLoadingTeams } = trpc.teams.list.useQuery(
    {
      page: 1,
      pageSize: 100,
      search: teamSearch,
    },
    {
      enabled: open,
    }
  )

  // Handle share success/error
  useEffect(() => {
    if (shareState?.success) {
      toast.success("Password shared with team successfully")
      const handleSuccess = () => {
        form.reset()
        setTeamSearch("")
        onOpenChange(false)
        onSuccess()
      }
      setTimeout(handleSuccess, 0)
    } else if (shareState?.error) {
      showErrorFromException(shareState.error, "Failed to share password")
    }
  }, [shareState, form, onOpenChange, onSuccess])

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset()
      setTeamSearch("")
    }
    onOpenChange(newOpen)
  }

  const handleSubmit = (values: SharePasswordFormValues) => {
    const formData = new FormData()
    formData.append("teamId", values.teamId)
    if (values.expiresAt) {
      formData.append("expiresAt", values.expiresAt)
    }
    React.startTransition(() => {
      shareFormAction(formData)
    })
  }

  const teams = teamsData?.teams || []
  const filteredTeams = teamSearch
    ? teams.filter(
        (t) =>
          t.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
          (t.description && t.description.toLowerCase().includes(teamSearch.toLowerCase()))
      )
    : teams

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Share Password</DialogTitle>
            <DialogDescription>
              Share &quot;{passwordName}&quot; with a team or create a temporary sharing link.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="team" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="team" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team Share
              </TabsTrigger>
              <TabsTrigger value="temporary" className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Temporary Link
              </TabsTrigger>
            </TabsList>

            <TabsContent value="team" className="mt-4">
              <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormErrorDisplay error={shareState?.error} />

            <FormField
              control={form.control}
              name="teamId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Select Team</FormLabel>
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search teams..."
                        className="pl-8"
                        value={teamSearch}
                        onChange={(e) => setTeamSearch(e.target.value)}
                      />
                    </div>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a team" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingTeams ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            Loading teams...
                          </div>
                        ) : filteredTeams.length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            No teams found
                          </div>
                        ) : (
                          filteredTeams.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                <span>{team.name}</span>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="expiresAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expiration Date (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      min={new Date().toISOString().split("T")[0]}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={sharePending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={sharePending}>
                {sharePending ? "Sharing..." : "Share Password"}
              </Button>
              </DialogFooter>
            </form>
          </Form>
            </TabsContent>

            <TabsContent value="temporary" className="mt-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Create a secure, temporary sharing link that can be accessed without login.
                  You can set expiration dates, access limits, and one-time use.
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    handleOpenChange(false)
                    setIsTemporaryShareOpen(true)
                  }}
                  className="w-full"
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  Create Temporary Share Link
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <TemporaryShareDialog
        open={isTemporaryShareOpen}
        onOpenChange={setIsTemporaryShareOpen}
        passwordId={passwordId}
        passwordName={passwordName}
        onSuccess={onSuccess}
      />
    </>
  )
}

