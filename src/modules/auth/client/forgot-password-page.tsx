"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { AuthCard } from "./auth-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Mail, Loader2, ArrowLeft, HelpCircle } from "lucide-react"
import Link from "next/link"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, Info } from "lucide-react"
import { useRouter } from "next/navigation"
import { showErrorFromException } from "@/lib/error-toast"

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
})

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [emailSent, setEmailSent] = React.useState(false)

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  })

  const forgotPasswordMutation = trpc.auth.forgotPassword.useMutation({
    onSuccess: () => {
      setEmailSent(true)
      toast.success(t("auth.forgotPassword.emailSent"))
    },
    onError: (error) => {
      showErrorFromException(error, t("auth.forgotPassword.error"))
    },
  })

  const onSubmit = (values: ForgotPasswordFormValues) => {
    forgotPasswordMutation.mutate({ email: values.email })
  }

  if (emailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-background via-background to-muted p-4">
        <AuthCard className="w-full">
          <div className="space-y-6 text-center px-5">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t("auth.forgotPassword.emailSentTitle")}</h1>
              <p className="mt-2 text-muted-foreground">
                {t("auth.forgotPassword.emailSentDescription")}
              </p>
            </div>
            <Alert>
              <AlertDescription>
                {t("auth.forgotPassword.checkSpam")}
              </AlertDescription>
            </Alert>
            <div className="pt-4">
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t("auth.backToLogin")}
                </Link>
              </Button>
            </div>
          </div>
        </AuthCard>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-background via-background to-muted p-4">
      <AuthCard className="w-full">
        <div className="space-y-6 px-5">
          <div>
            <h1 className="text-2xl font-bold">{t("auth.forgotPassword.title")}</h1>
            <p className="mt-2 text-muted-foreground">
              {t("auth.forgotPassword.description")}
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.email")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          {...field}
                          type="email"
                          placeholder={t("auth.emailPlaceholder")}
                          className="pl-10"
                          disabled={forgotPasswordMutation.isPending}
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      {t("auth.forgotPassword.emailDescription")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={forgotPasswordMutation.isPending}
              >
                {forgotPasswordMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("common.loading")}
                  </>
                ) : (
                  t("auth.forgotPassword.sendResetLink")
                )}
              </Button>
            </form>
          </Form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                {t("common.or")}
              </span>
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {t("auth.forgotPassword.securityQuestionsInfo")}
            </AlertDescription>
          </Alert>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push("/recover-via-questions")}
          >
            <HelpCircle className="mr-2 h-4 w-4" />
            {t("auth.forgotPassword.useSecurityQuestions")}
          </Button>

          <div className="text-center text-sm">
            <Link href="/login" className="text-primary hover:underline">
              <ArrowLeft className="mr-1 inline h-3 w-3" />
              {t("auth.backToLogin")}
            </Link>
          </div>
        </div>
      </AuthCard>
    </div>
  )
}
