"use client"

import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import z from "zod"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { usePermissions } from "@/hooks/use-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info } from "lucide-react"
import { MfaSettingsSkeleton } from "./mfa-settings-skeleton"
import Link from "next/link"
import { showErrorFromException } from "@/lib/error-toast"

const mfaSettingsSchema = z.object({
  enforceAllUsers: z.boolean(),
  enforceAdmins: z.boolean(),
  methodTotp: z.boolean(),
  methodSms: z.boolean(),
  methodEmail: z.boolean(),
  methodHardware: z.boolean(),
  gracePeriodDays: z.number().min(0).max(365),
  recoveryCodesEnabled: z.boolean(),
  recoveryCodesCount: z.number().min(1).max(50),
  adminResetEnabled: z.boolean(),
})

type MfaSettingsFormValues = z.infer<typeof mfaSettingsSchema>

export function MfaSettings() {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission("settings.edit")
  const { data: settings, isLoading, error } = trpc.settings.getMfaSettings.useQuery()
  const { data: credentialsStatus } = trpc.settings.checkMfaCredentialsStatus.useQuery()
  const utils = trpc.useUtils()
  const updateSettings = trpc.settings.updateMfaSettings.useMutation({
    onSuccess: () => {
      toast.success(t("settings.mfaSettingsSaved"))
      utils.settings.getMfaSettings.invalidate()
      utils.settings.checkMfaCredentialsStatus.invalidate()
    },
    onError: (error) => {
      showErrorFromException(error, t("settings.mfaSettingsFailed"))
    },
  })

  const form = useForm<MfaSettingsFormValues>({
    resolver: zodResolver(mfaSettingsSchema),
    defaultValues: {
      enforceAllUsers: false,
      enforceAdmins: false,
      methodTotp: true,
      methodSms: false,
      methodEmail: false,
      methodHardware: false,
      gracePeriodDays: 7,
      recoveryCodesEnabled: true,
      recoveryCodesCount: 10,
      adminResetEnabled: true,
    },
  })

  // Update form when settings are loaded
  useEffect(() => {
    if (settings) {
      form.reset({
        enforceAllUsers: settings.enforceAllUsers,
        enforceAdmins: settings.enforceAdmins,
        methodTotp: settings.methodTotp,
        methodSms: settings.methodSms,
        methodEmail: settings.methodEmail,
        methodHardware: settings.methodHardware,
        gracePeriodDays: settings.gracePeriodDays,
        recoveryCodesEnabled: settings.recoveryCodesEnabled,
        recoveryCodesCount: settings.recoveryCodesCount,
        adminResetEnabled: settings.adminResetEnabled,
      })
    }
  }, [settings, form])

  const onSubmit = async (values: MfaSettingsFormValues) => {
    updateSettings.mutate(values)
  }

  if (isLoading) {
    return <MfaSettingsSkeleton />
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.mfa.title")}</CardTitle>
          <CardDescription>{t("settings.mfa.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-destructive">
            <p>{t("settings.mfa.loadFailed", { error: error.message })}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.mfa.title")}</CardTitle>
            <CardDescription>{t("settings.mfa.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!canEdit && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {t("settings.readOnlyAccess")}
                </AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="enforceAllUsers"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel>{t("settings.mfa.enforceAllUsers")}</FormLabel>
                      <p className="text-xs text-muted-foreground">{t("settings.mfa.enforceAllUsersDescription")}</p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!canEdit}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enforceAdmins"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel>{t("settings.mfa.enforceAdmins")}</FormLabel>
                      <p className="text-xs text-muted-foreground">{t("settings.mfa.enforceAdminsDescription")}</p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!canEdit}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <div>
              <FormLabel className="text-base">{t("settings.mfa.availableMethods")}</FormLabel>
              <p className="text-xs text-muted-foreground mb-4">
                {t("settings.mfa.availableMethodsDescription")}
              </p>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="methodTotp"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <div className="space-y-0.5">
                            <FormLabel>{t("settings.mfa.authenticatorApp")}</FormLabel>
                            <p className="text-xs text-muted-foreground">
                              {t("settings.mfa.authenticatorAppDescription")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{t("settings.mfa.recommended")}</Badge>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!canEdit}
                            />
                          </FormControl>
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="methodSms"
                  render={({ field }) => {
                    const isDisabled = !canEdit || !credentialsStatus?.smsConfigured
                    return (
                      <FormItem>
                        <div className="flex items-center justify-between p-3 rounded-lg border">
                          <div className="flex items-center gap-3">
                            <div className="space-y-0.5">
                              <FormLabel>{t("settings.mfa.smsAuthentication")}</FormLabel>
                              <p className="text-xs text-muted-foreground">
                                {t("settings.mfa.smsAuthenticationDescription")}
                              </p>
                              {!credentialsStatus?.smsConfigured && (
                                <p className="text-xs text-destructive mt-1">
                                  {t("settings.mfa.smsNotConfigured")}{" "}
                                  <Link href="/admin/settings/mfa-credentials" className="underline hover:text-destructive/80">
                                    {t("settings.mfaCredentials")}
                                  </Link>
                                </p>
                              )}
                            </div>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={(checked) => {
                                if (!credentialsStatus?.smsConfigured && checked) {
                                  toast.error(t("settings.mfa.smsMustBeConfigured"))
                                  return
                                }
                                field.onChange(checked)
                              }}
                              disabled={isDisabled}
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )
                  }}
                />

                <FormField
                  control={form.control}
                  name="methodEmail"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <div className="space-y-0.5">
                            <FormLabel>{t("settings.mfa.emailAuthentication")}</FormLabel>
                            <p className="text-xs text-muted-foreground">
                              {t("settings.mfa.emailAuthenticationDescription")}
                            </p>
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!canEdit}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="methodHardware"
                  render={({ field }) => {
                    const isDisabled = !canEdit || !credentialsStatus?.webauthnConfigured
                    return (
                      <FormItem>
                        <div className="flex items-center justify-between p-3 rounded-lg border">
                          <div className="flex items-center gap-3">
                            <div className="space-y-0.5">
                              <FormLabel>{t("settings.mfa.hardwareSecurityKeys")}</FormLabel>
                              <p className="text-xs text-muted-foreground">
                                {t("settings.mfa.hardwareSecurityKeysDescription")}
                              </p>
                              {!credentialsStatus?.webauthnConfigured && (
                                <p className="text-xs text-destructive mt-1">
                                  {t("settings.mfa.webauthnNotConfigured")}{" "}
                                  <Link href="/admin/settings/mfa-credentials" className="underline hover:text-destructive/80">
                                    {t("settings.mfaCredentials")}
                                  </Link>
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{t("settings.mfa.mostSecure")}</Badge>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={(checked) => {
                                  if (!credentialsStatus?.webauthnConfigured && checked) {
                                    toast.error(t("settings.mfa.webauthnMustBeConfigured"))
                                    return
                                  }
                                  field.onChange(checked)
                                }}
                                disabled={isDisabled}
                              />
                            </FormControl>
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )
                  }}
                />
              </div>
            </div>

            <Separator />

            <FormField
              control={form.control}
              name="gracePeriodDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.mfa.gracePeriodDays")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.mfa.gracePeriodDaysDescription")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {canEdit && (
              <div className="pt-4">
                <Button type="submit" disabled={updateSettings.isPending}>
                  {updateSettings.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("settings.mfa.saveMfaSettings")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.mfa.recoveryOptions")}</CardTitle>
            <CardDescription>
              {t("settings.mfa.recoveryOptionsDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {t("settings.mfa.recoveryCodesInfo")}{" "}
                <Link href="/admin/account/recovery-codes" className="underline hover:text-foreground">
                  {t("settings.mfa.recoveryCodesLink")}
                </Link>
              </AlertDescription>
            </Alert>
            <FormField
              control={form.control}
              name="recoveryCodesEnabled"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel>{t("settings.mfa.recoveryCodes")}</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.mfa.recoveryCodesDescription")}
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!canEdit}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="recoveryCodesCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.mfa.recoveryCodesCount")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="adminResetEnabled"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel>{t("settings.mfa.adminMfaReset")}</FormLabel>
                      <p className="text-xs text-muted-foreground">{t("settings.mfa.adminMfaResetDescription")}</p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!canEdit}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {canEdit && (
              <div className="pt-4">
                <Button type="submit" disabled={updateSettings.isPending}>
                  {updateSettings.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("settings.mfa.saveRecoverySettings")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </form>
    </Form>
  )
}
