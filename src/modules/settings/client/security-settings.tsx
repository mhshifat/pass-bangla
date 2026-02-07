"use client"

import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import z from "zod"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { SecuritySettingsSkeleton } from "./security-settings-skeleton"
import { usePermissions } from "@/hooks/use-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info } from "lucide-react"
import { showErrorFromException } from "@/lib/error-toast"

const securitySettingsSchema = z.object({
  // Password Policies
  passwordMinLength: z.number().min(4).max(128),
  passwordRequireUppercase: z.boolean(),
  passwordRequireLowercase: z.boolean(),
  passwordRequireNumbers: z.boolean(),
  passwordRequireSpecial: z.boolean(),
  passwordExpiryDays: z.number().min(0).max(3650),
  // Session Management
  sessionTimeoutMinutes: z.number().min(1).max(1440),
  sessionMaxConcurrent: z.number().min(1).max(100),
  sessionRequireReauth: z.boolean(),
  // Login Security
  loginMaxAttempts: z.number().min(1).max(20),
  loginLockoutDurationMinutes: z.number().min(1).max(1440),
  // Device Management
  requireMfaForUntrustedDevices: z.boolean(),
})

type SecuritySettingsFormValues = z.infer<typeof securitySettingsSchema>

export function SecuritySettings() {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission("settings.edit")
  const { data: settings, isLoading, error } = trpc.settings.getSecuritySettings.useQuery()
  const utils = trpc.useUtils()
  const updateSettings = trpc.settings.updateSecuritySettings.useMutation({
    onSuccess: () => {
      toast.success(t("settings.security.securitySettingsSaved"))
      utils.settings.getSecuritySettings.invalidate()
    },
    onError: (error) => {
      showErrorFromException(error, t("settings.security.securitySettingsFailed"))
    },
  })

  const form = useForm<SecuritySettingsFormValues>({
    resolver: zodResolver(securitySettingsSchema),
    defaultValues: {
      passwordMinLength: 12,
      passwordRequireUppercase: true,
      passwordRequireLowercase: true,
      passwordRequireNumbers: true,
      passwordRequireSpecial: true,
      passwordExpiryDays: 90,
      sessionTimeoutMinutes: 30,
      sessionMaxConcurrent: 3,
      sessionRequireReauth: true,
      loginMaxAttempts: 5,
      loginLockoutDurationMinutes: 15,
      requireMfaForUntrustedDevices: false,
    },
  })

  // Update form when settings are loaded
  useEffect(() => {
    if (settings) {
      form.reset({
        passwordMinLength: settings.passwordMinLength,
        passwordRequireUppercase: settings.passwordRequireUppercase,
        passwordRequireLowercase: settings.passwordRequireLowercase,
        passwordRequireNumbers: settings.passwordRequireNumbers,
        passwordRequireSpecial: settings.passwordRequireSpecial,
        passwordExpiryDays: settings.passwordExpiryDays,
        sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
        sessionMaxConcurrent: settings.sessionMaxConcurrent,
        sessionRequireReauth: settings.sessionRequireReauth,
        loginMaxAttempts: settings.loginMaxAttempts,
        loginLockoutDurationMinutes: settings.loginLockoutDurationMinutes,
        requireMfaForUntrustedDevices: settings.requireMfaForUntrustedDevices,
      })
    }
  }, [settings, form])

  const onSubmit = async (values: SecuritySettingsFormValues) => {
    updateSettings.mutate(values)
  }

  if (isLoading) {
    return <SecuritySettingsSkeleton />
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.security.title")}</CardTitle>
          <CardDescription>{t("settings.security.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-destructive">
            <p>{t("settings.security.loadFailed", { error: error.message })}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {!canEdit && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {t("settings.readOnlyAccess")}
            </AlertDescription>
          </Alert>
        )}

        {/* Password Policies */}
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.security.passwordPolicies")}</CardTitle>
            <CardDescription>
              {t("settings.security.passwordPoliciesDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="passwordMinLength"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.security.passwordMinLength")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.security.passwordMinLengthDescription")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="passwordRequireUppercase"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel>{t("settings.security.requireUppercase")}</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.security.requireUppercaseDescription")}
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
              name="passwordRequireLowercase"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel>{t("settings.security.requireLowercase")}</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.security.requireLowercaseDescription")}
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
              name="passwordRequireNumbers"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel>{t("settings.security.requireNumbers")}</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.security.requireNumbersDescription")}
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
              name="passwordRequireSpecial"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel>{t("settings.security.requireSpecial")}</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.security.requireSpecialDescription")}
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

            <Separator />

            <FormField
              control={form.control}
              name="passwordExpiryDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.security.passwordExpiry")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.security.passwordExpiryDescription")}
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
                  {t("settings.security.savePasswordPolicies")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Session Management */}
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.security.sessionManagement")}</CardTitle>
            <CardDescription>{t("settings.security.sessionManagementDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="sessionTimeoutMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.security.sessionTimeout")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.security.sessionTimeoutDescription")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sessionMaxConcurrent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.security.maxConcurrentSessions")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.security.maxConcurrentSessionsDescription")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="sessionRequireReauth"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel>{t("settings.security.requireReauth")}</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.security.requireReauthDescription")}
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

            {canEdit && (
              <div className="pt-4">
                <Button type="submit" disabled={updateSettings.isPending}>
                  {updateSettings.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("settings.security.saveSessionSettings")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Login Security */}
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.security.loginSecurity")}</CardTitle>
            <CardDescription>{t("settings.security.loginSecurityDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="loginMaxAttempts"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.security.maxFailedLoginAttempts")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.security.maxFailedLoginAttemptsDescription")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="loginLockoutDurationMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.security.accountLockoutDuration")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.security.accountLockoutDurationDescription")}
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
                  {t("settings.security.saveLoginSecurity")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Device Management */}
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.security.deviceManagement")}</CardTitle>
            <CardDescription>{t("settings.security.deviceManagementDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="requireMfaForUntrustedDevices"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      {t("settings.security.requireMfaForUntrustedDevices")}
                    </FormLabel>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.security.requireMfaForUntrustedDevicesDescription")}
                    </p>
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

            {canEdit && (
              <div className="pt-4">
                <Button type="submit" disabled={updateSettings.isPending}>
                  {updateSettings.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("settings.security.saveDeviceManagement")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </form>
    </Form>
  )
}
