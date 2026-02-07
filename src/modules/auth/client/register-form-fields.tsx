"use client"

import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { PasswordInput, generateStrongPassword } from "@/components/ui/password-input"
import { Lock, Mail, User, AlertCircle } from "lucide-react"

export function createRegisterSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().min(2, t("errors.nameMinLength")),
    email: z.string().email(t("errors.invalidEmail")),
    password: z.string().min(8, t("errors.passwordTooShort")),
    confirmPassword: z.string(),
    companyName: z.string().min(2, t("errors.companyNameMinLength")).regex(/^[a-zA-Z0-9-]+$/, t("errors.companyNameInvalid")),
  }).refine((data) => data.password === data.confirmPassword, {
    message: t("errors.passwordsDoNotMatch"),
    path: ["confirmPassword"],
  })
}

interface RegisterFormFieldsProps {
  formAction: (payload: FormData) => void
  isPending: boolean
  state: { error?: string; fieldErrors?: { [key: string]: string } } | null
}

export function RegisterFormFields({ formAction, isPending, state }: RegisterFormFieldsProps) {
  const { t } = useTranslation()
  const registerSchema = createRegisterSchema(t)
  type RegisterFormValues = z.infer<typeof registerSchema>
  
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      companyName: "",
    },
  })

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
        form.setError(field as keyof RegisterFormValues, {
          type: "server",
          message,
        })
      })
    }
  }, [state, form])

  return (
    <Form {...form}>
      <form action={formAction} id="register-form">
        {form.formState.errors.root && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {form.formState.errors.root.message}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("users.fullName")}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder={t("auth.namePlaceholder")}
                      className="pl-10"
                      disabled={isPending}
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
                      disabled={isPending}
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
                <FormLabel>{t("auth.password")}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400 z-10" />
                    <PasswordInput
                      placeholder="••••••••"
                      className="pl-10"
                      disabled={isPending}
                      showToggleButton={true}
                      showGenerateButton={true}
                      {...field}
                      onGenerate={() => {
                        const generated = generateStrongPassword(16)
                        form.setValue("password", generated)
                        field.onChange({ target: { value: generated } })
                      }}
                    />
                  </div>
                </FormControl>
                <FormDescription>{t("auth.passwordDescription")}</FormDescription>
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
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <PasswordInput
                      placeholder="••••••••"
                      className="pl-10"
                      disabled={isPending}
                      showToggleButton={true}
                      showGenerateButton={false}
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
            name="companyName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("auth.companyName")}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder={t("auth.companyNamePlaceholder")}
                      className="pl-10"
                      disabled={isPending}
                      {...field}
                      onChange={(e) => {
                        // Convert to lowercase and replace spaces/special chars with hyphens
                        const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")
                        field.onChange({ target: { value } })
                      }}
                    />
                  </div>
                </FormControl>
                <FormDescription>{t("auth.companyNameDescription")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Form submit is handled by the parent component */}
      </form>
    </Form>
  )
}
