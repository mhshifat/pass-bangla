"use client"

import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import z from "zod"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { usePermissions } from "@/hooks/use-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info } from "lucide-react"
import { showErrorFromException } from "@/lib/error-toast"

const passwordPolicySchema = z.object({
  minLength: z.number().min(4).max(128),
  requireUppercase: z.boolean(),
  requireLowercase: z.boolean(),
  requireNumbers: z.boolean(),
  requireSpecial: z.boolean(),
  expirationDays: z.number().min(0).max(3650).nullable(),
  preventReuseCount: z.number().min(0).max(50),
  requireChangeOnFirstLogin: z.boolean(),
  requireChangeAfterDays: z.number().min(1).max(3650).nullable(),
  isActive: z.boolean(),
})

type PasswordPolicyFormValues = z.infer<typeof passwordPolicySchema>

export function PasswordPolicySettings() {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission("settings.edit")
  const { data: policy, isLoading, error } = trpc.settings.getPasswordPolicy.useQuery()
  const utils = trpc.useUtils()
  const updatePolicy = trpc.settings.updatePasswordPolicy.useMutation({
    onSuccess: () => {
      toast.success(t("settings.security.passwordPolicy.saved"))
      utils.settings.getPasswordPolicy.invalidate()
    },
    onError: (error) => {
      showErrorFromException(error, t("settings.security.passwordPolicy.saveFailed"))
    },
  })

  const form = useForm<PasswordPolicyFormValues>({
    resolver: zodResolver(passwordPolicySchema),
    defaultValues: {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecial: true,
      expirationDays: null,
      preventReuseCount: 0,
      requireChangeOnFirstLogin: false,
      requireChangeAfterDays: null,
      isActive: true,
    },
  })

  // Update form when policy is loaded
  useEffect(() => {
    if (policy) {
      form.reset({
        minLength: policy.minLength,
        requireUppercase: policy.requireUppercase,
        requireLowercase: policy.requireLowercase,
        requireNumbers: policy.requireNumbers,
        requireSpecial: policy.requireSpecial,
        expirationDays: policy.expirationDays,
        preventReuseCount: policy.preventReuseCount,
        requireChangeOnFirstLogin: policy.requireChangeOnFirstLogin,
        requireChangeAfterDays: policy.requireChangeAfterDays,
        isActive: policy.isActive,
      })
    }
  }, [policy, form])

  const onSubmit = async (values: PasswordPolicyFormValues) => {
    updatePolicy.mutate(values)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.security.passwordPolicy.title")}</CardTitle>
          <CardDescription>{t("settings.security.passwordPolicy.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-4 bg-muted animate-pulse rounded" />
            <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
            <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.security.passwordPolicy.title")}</CardTitle>
          <CardDescription>{t("settings.security.passwordPolicy.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error.message || t("common.error")}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.security.passwordPolicy.title")}</CardTitle>
        <CardDescription>{t("settings.security.passwordPolicy.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Enable/Disable Policy */}
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      {t("settings.security.passwordPolicy.enabled")}
                    </FormLabel>
                    <FormDescription>
                      {t("settings.security.passwordPolicy.enabledDescription")}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={!canEdit}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {form.watch("isActive") && (
              <>
                <Separator />

                {/* Complexity Rules */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">
                      {t("settings.security.passwordPolicy.complexityRules")}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t("settings.security.passwordPolicy.complexityRulesDescription")}
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="minLength"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t("settings.security.passwordPolicy.minLength")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={4}
                            max={128}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                            disabled={!canEdit}
                          />
                        </FormControl>
                        <FormDescription>
                          {t("settings.security.passwordPolicy.minLengthDescription")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="requireUppercase"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              {t("settings.security.passwordPolicy.requireUppercase")}
                            </FormLabel>
                            <FormDescription>
                              {t("settings.security.passwordPolicy.requireUppercaseDescription")}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!canEdit}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="requireLowercase"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              {t("settings.security.passwordPolicy.requireLowercase")}
                            </FormLabel>
                            <FormDescription>
                              {t("settings.security.passwordPolicy.requireLowercaseDescription")}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!canEdit}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="requireNumbers"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              {t("settings.security.passwordPolicy.requireNumbers")}
                            </FormLabel>
                            <FormDescription>
                              {t("settings.security.passwordPolicy.requireNumbersDescription")}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!canEdit}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="requireSpecial"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              {t("settings.security.passwordPolicy.requireSpecial")}
                            </FormLabel>
                            <FormDescription>
                              {t("settings.security.passwordPolicy.requireSpecialDescription")}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!canEdit}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Separator />

                {/* Expiration */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">
                      {t("settings.security.passwordPolicy.expiration")}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t("settings.security.passwordPolicy.expirationDescription")}
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="expirationDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t("settings.security.passwordPolicy.expirationDays")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={3650}
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(e.target.value ? parseInt(e.target.value, 10) : null)
                            }
                            placeholder={t("settings.security.passwordPolicy.noExpiration")}
                            disabled={!canEdit}
                          />
                        </FormControl>
                        <FormDescription>
                          {t("settings.security.passwordPolicy.expirationDaysDescription")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                {/* Password History */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">
                      {t("settings.security.passwordPolicy.passwordHistory")}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t("settings.security.passwordPolicy.passwordHistoryDescription")}
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="preventReuseCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t("settings.security.passwordPolicy.preventReuseCount")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={50}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                            disabled={!canEdit}
                          />
                        </FormControl>
                        <FormDescription>
                          {t("settings.security.passwordPolicy.preventReuseCountDescription")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                {/* Change Requirements */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">
                      {t("settings.security.passwordPolicy.changeRequirements")}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t("settings.security.passwordPolicy.changeRequirementsDescription")}
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="requireChangeOnFirstLogin"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            {t("settings.security.passwordPolicy.requireChangeOnFirstLogin")}
                          </FormLabel>
                          <FormDescription>
                            {t("settings.security.passwordPolicy.requireChangeOnFirstLoginDescription")}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!canEdit}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="requireChangeAfterDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t("settings.security.passwordPolicy.requireChangeAfterDays")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={3650}
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(e.target.value ? parseInt(e.target.value, 10) : null)
                            }
                            placeholder={t("settings.security.passwordPolicy.noChangeRequirement")}
                            disabled={!canEdit}
                          />
                        </FormControl>
                        <FormDescription>
                          {t("settings.security.passwordPolicy.requireChangeAfterDaysDescription")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            {canEdit && (
              <div className="pt-4">
                <Button type="submit" disabled={updatePolicy.isPending}>
                  {updatePolicy.isPending && (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("common.loading")}
                    </>
                  )}
                  {!updatePolicy.isPending && t("common.save")}
                </Button>
              </div>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

