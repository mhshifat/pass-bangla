"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { AuthCard } from "./auth-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { Lock, Loader2, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useRouter, useSearchParams } from "next/navigation"
import { showErrorFromException } from "@/lib/error-toast"

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>

export function ResetPasswordViaQuestionsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const userId = searchParams.get("userId")
  const [resetSuccess, setResetSuccess] = React.useState(false)

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  })

  const resetPasswordMutation = trpc.auth.resetPasswordViaSecurityQuestions.useMutation({
    onSuccess: () => {
      setResetSuccess(true)
      toast.success(t("auth.resetPassword.success"))
    },
    onError: (error) => {
      showErrorFromException(error, t("auth.resetPassword.error"))
    },
  })

  const onSubmit = (values: ResetPasswordFormValues) => {
    if (!userId) {
      toast.error(t("auth.resetPassword.invalidRequest"))
      return
    }
    resetPasswordMutation.mutate({
      userId,
      newPassword: values.newPassword,
    })
  }

  // Redirect if no userId
  React.useEffect(() => {
    if (!userId) {
      toast.error(t("auth.resetPassword.invalidRequest"))
      router.push("/forgot-password")
    }
  }, [userId, router, t])

  if (resetSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-background via-background to-muted p-4">
        <AuthCard className="w-full">
          <div className="space-y-6 text-center px-5">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t("auth.resetPassword.successTitle")}</h1>
              <p className="mt-2 text-muted-foreground">
                {t("auth.resetPassword.successDescription")}
              </p>
            </div>
            <div className="pt-4">
              <Button asChild className="w-full">
                <Link href="/login">{t("auth.loginNow")}</Link>
              </Button>
            </div>
          </div>
        </AuthCard>
      </div>
    )
  }

  if (!userId) {
    return null // Will redirect
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-background via-background to-muted p-4">
      <AuthCard className="w-full">
        <div className="space-y-6 px-5">
          <div>
            <h1 className="text-2xl font-bold">{t("auth.resetPassword.title")}</h1>
            <p className="mt-2 text-muted-foreground">
              {t("auth.resetPassword.description")}
            </p>
          </div>

          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              {t("auth.securityQuestions.questionsVerified")}
            </AlertDescription>
          </Alert>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.newPassword")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <PasswordInput
                          {...field}
                          placeholder={t("auth.newPasswordPlaceholder")}
                          className="pl-10"
                          disabled={resetPasswordMutation.isPending}
                          showToggleButton={true}
                          showGenerateButton={false}
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      {t("auth.passwordRequirements")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.confirmPassword")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <PasswordInput
                          {...field}
                          placeholder={t("auth.confirmPasswordPlaceholder")}
                          className="pl-10"
                          disabled={resetPasswordMutation.isPending}
                          showToggleButton={true}
                          showGenerateButton={false}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={resetPasswordMutation.isPending}
              >
                {resetPasswordMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("common.loading")}
                  </>
                ) : (
                  t("auth.resetPassword.resetButton")
                )}
              </Button>
            </form>
          </Form>

          <div className="text-center text-sm">
            <Link href="/login" className="text-muted-foreground hover:underline">
              {t("auth.backToLogin")}
            </Link>
          </div>
        </div>
      </AuthCard>
    </div>
  )
}

