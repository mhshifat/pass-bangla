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
import { PasswordInput, generateStrongPassword } from "@/components/ui/password-input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { AlertCircle } from "lucide-react"
import { trpc } from "@/trpc/client"
import { useTranslation } from "react-i18next"

interface User {
  id: string
  name: string
  email: string
  role: string
  status: string
  mfa: boolean
}

type UserFormValues = {
  name: string
  email: string
  password?: string
  role: string
  mfaEnabled: boolean
  isActive: boolean
}

interface UserFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: User | null
  mode: "create" | "edit"
  formAction: (payload: FormData) => void
  isPending: boolean
  state: { error?: string; fieldErrors?: { [key: string]: string }; success?: boolean } | null
}

const userSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  role: z.string().min(1, "Role is required"),
  mfaEnabled: z.boolean(),
  isActive: z.boolean(),
})

export function UserFormDialog({
  open,
  onOpenChange,
  user,
  mode,
  formAction,
  isPending,
  state,
}: UserFormDialogProps) {
  const { t } = useTranslation()
  // Fetch assignable roles
  const { data: rolesData } = trpc.roles.getAssignableRoles.useQuery(undefined, {
    enabled: open,
  })

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "USER",
      mfaEnabled: false,
      isActive: true,
    },
  })

  // Reset form when user changes (for edit mode) or when dialog opens/closes
  useEffect(() => {
    if (open) {
      if (user) {
        form.reset({
          name: user.name,
          email: user.email,
          role: user.role,
          mfaEnabled: user.mfa,
          isActive: user.status === "active",
        })
      } else {
        form.reset({
          name: "",
          email: "",
          password: "",
          role: "USER",
          mfaEnabled: false,
          isActive: true,
        })
      }
    }
  }, [user, open, form])

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
        form.setError(field as keyof UserFormValues, {
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
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("users.addUser") : t("users.editUser")}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? t("users.createUser") : t("users.updateUser")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {form.formState.errors.root && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
              </Alert>
            )}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("users.fullName")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("users.fullName")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.email")}</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder={t("common.email")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {mode === "create" && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.password")}</FormLabel>
                    <FormControl>
                      <PasswordInput
                        placeholder="••••••••"
                        {...field}
                        showToggleButton={true}
                        showGenerateButton={true}
                        onGenerate={() => {
                          const generated = generateStrongPassword(16)
                          form.setValue("password", generated)
                          field.onChange({ target: { value: generated } })
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      {t("users.passwordDescription")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.role")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} name="role">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("users.selectRole")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {rolesData?.roles.map((role) => (
                        <SelectItem key={role.name} value={role.name}>
                          {role.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="role" value={field.value} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mfaEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between space-y-0 rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>{t("users.requireMfa")}</FormLabel>
                    <FormDescription>
                      {t("users.requireMfaDescription")}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <input type="hidden" name="mfaEnabled" value={field.value ? "true" : "false"} />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between space-y-0 rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>{t("common.active")}</FormLabel>
                    <FormDescription>
                      {t("users.isActiveDescription")}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <input type="hidden" name="isActive" value={field.value ? "true" : "false"} />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={isPending}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? t("common.loading") : mode === "create" ? t("users.createUserButton") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
