"use client"

import * as React from "react"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { AlertCircle } from "lucide-react"
import { FormErrorDisplay } from "@/components/shared/form-error-display"
import { useTranslation } from "react-i18next"

type TeamFormValues = {
  name: string
  description?: string
}

interface Team {
  id: string
  name: string
  description: string | null
}

interface TeamFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  team?: Team | null
  mode: "create" | "edit"
  formAction: (payload: FormData) => void
  isPending: boolean
  state: { error?: string; fieldErrors?: { [key: string]: string }; success?: boolean } | null
}

const teamSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
})

export function TeamFormDialog({
  open,
  onOpenChange,
  team,
  mode,
  formAction,
  isPending,
  state,
}: TeamFormDialogProps) {
  const { t } = useTranslation()
  const form = useForm<TeamFormValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  })

  // Reset form when team changes (for edit mode) or when dialog opens/closes
  useEffect(() => {
    if (open) {
      if (team) {
        form.reset({
          name: team.name,
          description: team.description || "",
        })
      } else {
        form.reset({
          name: "",
          description: "",
        })
      }
    }
  }, [team, open, form])

  // Sync server errors to form state
  useEffect(() => {
    if (state?.error) {
      form.setError("root", {
        type: "server",
        message: state.error,
      })
    }

    // Set field-specific errors
    if (state?.fieldErrors) {
      Object.entries(state.fieldErrors).forEach(([field, message]) => {
        form.setError(field as keyof TeamFormValues, {
          type: "server",
          message,
        })
      })
    }

    // Close dialog on success
    if (state?.success) {
      onOpenChange(false)
      form.reset()
    }
  }, [state, form, onOpenChange])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    React.startTransition(() => {
      formAction(formData)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("teams.createTeam") : t("teams.editTeam")}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? t("teams.createTeamDescription") : t("teams.updateTeamDescription")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormErrorDisplay error={form.formState.errors.root?.message} />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("teams.teamName")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("teams.teamNamePlaceholder")} {...field} name="name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("teams.description")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("teams.descriptionPlaceholder")}
                      rows={3}
                      {...field}
                      name="description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? mode === "create"
                    ? t("teams.creating")
                    : t("teams.saving")
                  : mode === "create"
                  ? t("teams.createTeam")
                  : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
