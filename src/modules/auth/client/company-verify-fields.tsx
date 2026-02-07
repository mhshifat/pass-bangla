"use client"

import { useEffect, useTransition } from "react"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { ErrorWithCorrelationId } from "@/components/shared/ErrorWithCorrelationId"
import { useCorrelationIdError } from "@/hooks/use-correlation-id-error"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Building2 } from "lucide-react"

function createCompanyVerifySchema(t: (key: string) => string) {
  return z.object({
    company: z.string().min(1, t("errors.required")),
  })
}

interface CompanyVerifyFieldsProps {
  formAction: (payload: FormData) => void
  isPending: boolean
  state: { 
    error?: string
    correlationId?: string
    fieldErrors?: { [key: string]: string }
  } | null
}

export function CompanyVerifyFields({ formAction, isPending, state }: CompanyVerifyFieldsProps) {
  const { t } = useTranslation()
  const [isTransitionPending, startTransition] = useTransition()
  const pending = isPending || isTransitionPending
  
  const companySchema = createCompanyVerifySchema(t)
  type CompanyFormValues = z.infer<typeof companySchema>
  
  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      company: "",
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
        form.setError(field as keyof CompanyFormValues, {
          type: "server",
          message,
        })
      })
    }
  }, [state, form])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(() => {
      formAction(formData)
    })
  }

  return (
    <Form {...form}>
      <form id="company-verify-form" onSubmit={handleSubmit}>
        {form.formState.errors.root && (
          <ErrorWithCorrelationId 
            message={correlation.message}
            correlationId={state?.correlationId || correlation.correlationId}
          />
        )}

        <div className="space-y-4">
          <FormField
            control={form.control}
            name="company"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("auth.companyName")}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder={t("auth.companyNamePlaceholder")}
                      className="pl-10"
                      disabled={pending}
                      autoFocus
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("auth.companyNameDescription")}
                </p>
              </FormItem>
            )}
          />
        </div>
      </form>
    </Form>
  )
}
