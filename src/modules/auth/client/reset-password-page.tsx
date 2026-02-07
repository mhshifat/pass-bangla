"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { AuthCard } from "./auth-card"
import { Button } from "@/components/ui/button"
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
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { Loader2, CheckCircle2, XCircle, Key } from "lucide-react"
import Link from "next/link"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { showErrorFromException } from "@/lib/error-toast"

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
})

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")
  const [resetStatus, setResetStatus] = React.useState<"pending" | "success" | "error">("pending")
  const [tokenValid, setTokenValid] = React.useState<boolean | null>(null)

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  })

  const resetPasswordMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      setResetStatus("success")
      toast.success(t("auth.resetPassword.success"))
      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push("/login")
      }, 3000)
    },
    onError: (error) => {
      setResetStatus("error")
      showErrorFromException(error, t("auth.resetPassword.error"))
    },
  })

  React.useEffect(() => {
    if (!token) {
      setTokenValid(false)
      setResetStatus("error")
    } else {
      setTokenValid(true)
    }
  }, [token])

  const onSubmit = (values: ResetPasswordFormValues) => {
    if (!token) return
    resetPasswordMutation.mutate({
      token,
      newPassword: values.newPassword,
    })
  }

  if (resetStatus === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
        <AuthCard className="w-full max-w-md">
          <div className="space-y-6 text-center">
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
                <Link href="/login">{t("auth.login")}</Link>
              </Button>
            </div>
          </div>
        </AuthCard>
      </div>
    )
  }

  if (resetStatus === "error" || tokenValid === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
        <AuthCard className="w-full max-w-md">
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
              <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t("auth.resetPassword.errorTitle")}</h1>
              <p className="mt-2 text-muted-foreground">
                {t("auth.resetPassword.errorDescription")}
              </p>
            </div>
            <div className="space-y-2 pt-4">
              <Button asChild variant="outline" className="w-full">
                <Link href="/forgot-password">{t("auth.forgotPassword.requestNewLink")}</Link>
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link href="/login">{t("auth.login")}</Link>
              </Button>
            </div>
          </div>
        </AuthCard>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <AuthCard className="w-full max-w-md">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">{t("auth.resetPassword.title")}</h1>
            <p className="mt-2 text-muted-foreground">
              {t("auth.resetPassword.description")}
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.resetPassword.newPassword")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <PasswordInput
                          {...field}
                          placeholder={t("auth.password")}
                          className="pl-10"
                          disabled={resetPasswordMutation.isPending}
                          onGeneratePassword={(password) => {
                            form.setValue("newPassword", password)
                            form.setValue("confirmPassword", password)
                          }}
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      {t("auth.passwordDescription")}
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
                    <FormLabel>{t("auth.resetPassword.confirmPassword")}</FormLabel>
                    <FormControl>
                      <PasswordInput
                        {...field}
                        placeholder={t("auth.resetPassword.confirmPasswordPlaceholder")}
                        disabled={resetPasswordMutation.isPending}
                      />
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
                  t("auth.resetPassword.resetPassword")
                )}
              </Button>
            </form>
          </Form>

          <div className="text-center text-sm">
            <Link href="/login" className="text-primary hover:underline">
              {t("auth.backToLogin")}
            </Link>
          </div>
        </div>
      </AuthCard>
    </div>
  )
}
