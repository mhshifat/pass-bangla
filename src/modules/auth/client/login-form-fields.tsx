"use client"

import { useEffect, useTransition } from "react"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ErrorWithCorrelationId } from "@/components/shared/ErrorWithCorrelationId"
import { useCorrelationIdError } from "@/hooks/use-correlation-id-error"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Lock, Mail, AlertCircle, RefreshCw } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export function createLoginSchema(t: (key: string) => string, requiresCaptcha?: boolean) {
  return z.object({
    email: z.string().email(t("errors.invalidEmail")),
    password: z.string().min(1, t("errors.passwordRequired")),
    captchaAnswer: requiresCaptcha ? z.number().min(0, t("auth.captchaAnswerRequired")) : z.number().optional(),
  })
}

interface LoginFormFieldsProps {
  formAction: (payload: FormData) => void
  isPending: boolean
  state: { 
    error?: string
    correlationId?: string
    fieldErrors?: { [key: string]: string }
    requiresCaptcha?: boolean
    captchaToken?: string
    captchaQuestion?: string
  } | null
}

export function LoginFormFields({ formAction, isPending, state }: LoginFormFieldsProps) {
  const { t } = useTranslation()
  const [isTransitionPending, startTransition] = useTransition()
  const requiresCaptcha = state?.requiresCaptcha || false
  const captchaToken = state?.captchaToken || null
  const captchaQuestion = state?.captchaQuestion || null
  const pending = isPending || isTransitionPending
  
  const loginSchema = createLoginSchema(t, requiresCaptcha)
  type LoginFormValues = z.infer<typeof loginSchema>
  
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      captchaAnswer: undefined,
    },
  })

  const rootError = form.formState.errors.root?.message
  const correlation = useCorrelationIdError(rootError)

  // Sync server errors to form
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
        form.setError(field as keyof LoginFormValues, {
          type: "server",
          message,
        })
      })
    }
  }, [state, form])
  
  const handleRefreshCaptcha = () => {
    // Trigger a new login attempt to get a new CAPTCHA
    const formData = new FormData()
    formData.append("email", form.getValues("email"))
    formData.append("password", form.getValues("password"))
    startTransition(() => {
      formAction(formData)
    })
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    if (captchaToken) {
      formData.append("captchaToken", captchaToken)
    }
    const captchaAnswer = form.getValues("captchaAnswer")
    if (captchaAnswer !== undefined && captchaAnswer !== null) {
      formData.append("captchaAnswer", captchaAnswer.toString())
    }
    startTransition(() => {
      formAction(formData)
    })
  }

  return (
    <Form {...form}>
      <form id="login-form" onSubmit={handleSubmit}>
        {form.formState.errors.root && (
          <ErrorWithCorrelationId 
            message={correlation.message}
            correlationId={state?.correlationId || correlation.correlationId}
          />
        )}

        <div className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("auth.email")}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      type="email"
                      placeholder={t("auth.emailPlaceholder")}
                      className="pl-10"
                      disabled={pending}
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>{t("auth.password")}</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="text-sm text-primary hover:underline"
                  >
                    {t("auth.forgotPasswordLink")}
                  </Link>
                </div>
                <FormControl>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      type="password"
                      placeholder="••••••••"
                      className="pl-10"
                      disabled={pending}
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* CAPTCHA Field */}
          {requiresCaptcha && captchaQuestion && (
            <FormField
              control={form.control}
              name="captchaAnswer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.captchaLabel")}</FormLabel>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-md border bg-muted px-4 py-2 text-center font-mono text-lg">
                        {captchaQuestion} = ?
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleRefreshCaptcha}
                        disabled={pending}
                        title={t("auth.refreshCaptcha")}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder={t("auth.captchaPlaceholder")}
                        disabled={pending}
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {t("auth.captchaDescription")}
                    </p>
                  </div>
                  <FormMessage />
                  {captchaToken && (
                    <input type="hidden" name="captchaToken" value={captchaToken} />
                  )}
                </FormItem>
              )}
            />
          )}
        </div>

        {/* Form submit is handled by the parent component */}
      </form>
    </Form>
  )
}
