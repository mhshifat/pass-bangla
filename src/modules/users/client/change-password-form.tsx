"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import z from "zod"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { PasswordInput, generateStrongPassword } from "@/components/ui/password-input"
import { Loader2 } from "lucide-react"
import { showErrorFromException } from "@/lib/error-toast"

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Password confirmation is required"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
})

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>

export function ChangePasswordForm() {
  const { t } = useTranslation()

  const utils = trpc.useUtils()
  
  // All users must provide current password to change their own password
  const changeOwnPassword = trpc.users.changeOwnPassword.useMutation({
    onSuccess: () => {
      toast.success(t("profile.passwordChanged"))
      form.reset()
      utils.auth.getCurrentUser.invalidate()
    },
    onError: (error) => {
      showErrorFromException(error, t("profile.passwordChangeFailed"))
    },
  })

  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  })

  const onSubmit = async (values: ChangePasswordFormValues) => {
    changeOwnPassword.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    })
  }

  const isLoading = changeOwnPassword.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.changePassword")}</CardTitle>
        <CardDescription>
          {t("profile.changePasswordDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("profile.currentPassword")}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      {...field}
                      placeholder={t("profile.currentPasswordPlaceholder")}
                      disabled={isLoading}
                      showToggleButton={true}
                      showGenerateButton={false}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("profile.newPassword")}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      {...field}
                      placeholder={t("profile.newPasswordPlaceholder")}
                      disabled={isLoading}
                      showToggleButton={true}
                      showGenerateButton={true}
                      onGenerate={() => {
                        const generated = generateStrongPassword(16)
                        form.setValue("newPassword", generated)
                        field.onChange({ target: { value: generated } })
                      }}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t("profile.newPasswordDescription")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("profile.confirmPassword")}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      {...field}
                      placeholder={t("profile.confirmPasswordPlaceholder")}
                      disabled={isLoading}
                      showToggleButton={true}
                      showGenerateButton={false}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("profile.changePassword")}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
