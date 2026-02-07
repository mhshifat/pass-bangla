"use client"

import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import z from "zod"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { usePermissions } from "@/hooks/use-permissions"
import { showErrorFromException } from "@/lib/error-toast"

const threatDetectionSettingsSchema = z.object({
  enabled: z.boolean(),
  rateLimiting: z.object({
    enabled: z.boolean(),
    login: z.object({
      maxRequests: z.number().min(1).max(100),
      windowMinutes: z.number().min(1).max(1440),
    }),
    passwordReset: z.object({
      maxRequests: z.number().min(1).max(100),
      windowMinutes: z.number().min(1).max(1440),
    }),
    api: z.object({
      maxRequests: z.number().min(1).max(1000),
      windowMinutes: z.number().min(1).max(1440),
    }),
  }),
  bruteForceProtection: z.object({
    enabled: z.boolean(),
    maxAttempts: z.number().min(1).max(20),
    lockoutDurationMinutes: z.number().min(1).max(1440),
    windowMinutes: z.number().min(1).max(1440),
  }),
  anomalyDetection: z.object({
    enabled: z.boolean(),
    checkUnusualLocation: z.boolean(),
    checkUnusualTime: z.boolean(),
    checkUnusualDevice: z.boolean(),
  }),
  captcha: z.object({
    enabled: z.boolean(),
    triggerAfterFailedAttempts: z.number().min(1).max(10),
  }),
})

type ThreatDetectionSettingsFormValues = z.infer<typeof threatDetectionSettingsSchema>

export function ThreatDetectionSettings() {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission("settings.edit")

  const { data: settings, isLoading, error } = trpc.settings.getThreatDetectionSettings.useQuery()
  const utils = trpc.useUtils()
  const updateSettings = trpc.settings.updateThreatDetectionSettings.useMutation({
    onSuccess: () => {
      toast.success(t("settings.security.threatDetectionSettingsSaved"))
      utils.settings.getThreatDetectionSettings.invalidate()
    },
    onError: (error) => {
      showErrorFromException(error, t("settings.security.threatDetectionSettingsFailed"))
    },
  })

  const form = useForm<ThreatDetectionSettingsFormValues>({
    resolver: zodResolver(threatDetectionSettingsSchema),
    defaultValues: {
      enabled: true,
      rateLimiting: {
        enabled: true,
        login: { maxRequests: 5, windowMinutes: 15 },
        passwordReset: { maxRequests: 3, windowMinutes: 60 },
        api: { maxRequests: 100, windowMinutes: 1 },
      },
      bruteForceProtection: {
        enabled: true,
        maxAttempts: 5,
        lockoutDurationMinutes: 15,
        windowMinutes: 15,
      },
      anomalyDetection: {
        enabled: true,
        checkUnusualLocation: true,
        checkUnusualTime: true,
        checkUnusualDevice: true,
      },
      captcha: {
        enabled: true,
        triggerAfterFailedAttempts: 3,
      },
    },
  })

  useEffect(() => {
    if (settings) {
      form.reset(settings)
    }
  }, [settings, form])

  const onSubmit = (values: ThreatDetectionSettingsFormValues) => {
    updateSettings.mutate(values)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.security.threatDetection.title")}</CardTitle>
          <CardDescription>{t("settings.security.threatDetection.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.security.threatDetection.title")}</CardTitle>
          <CardDescription>{t("settings.security.threatDetection.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-destructive">
            <p>{error.message}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.security.threatDetection.title")}</CardTitle>
        <CardDescription>{t("settings.security.threatDetection.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Enable Threat Detection */}
            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      {t("settings.security.threatDetection.enabled")}
                    </FormLabel>
                    <FormDescription>
                      {t("settings.security.threatDetection.enabledDescription")}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!canEdit} />
                  </FormControl>
                </FormItem>
              )}
            />

            {form.watch("enabled") && (
              <>
                <Separator />

                {/* Rate Limiting */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{t("settings.security.threatDetection.rateLimiting.title")}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.security.threatDetection.rateLimiting.enabledDescription")}
                      </p>
                    </div>
                    <FormField
                      control={form.control}
                      name="rateLimiting.enabled"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!canEdit} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  {form.watch("rateLimiting.enabled") && (
                    <div className="space-y-4 pl-4 border-l-2">
                      {/* Login Rate Limiting */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">
                            {t("settings.security.threatDetection.rateLimiting.login.title")}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <FormField
                            control={form.control}
                            name="rateLimiting.login.maxRequests"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t("settings.security.threatDetection.rateLimiting.login.maxRequests")}</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    {...field}
                                    onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                                    disabled={!canEdit}
                                  />
                                </FormControl>
                                <FormDescription>
                                  {t("settings.security.threatDetection.rateLimiting.login.maxRequestsDescription")}
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="rateLimiting.login.windowMinutes"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t("settings.security.threatDetection.rateLimiting.login.windowMinutes")}</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    {...field}
                                    onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                                    disabled={!canEdit}
                                  />
                                </FormControl>
                                <FormDescription>
                                  {t("settings.security.threatDetection.rateLimiting.login.windowMinutesDescription")}
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </CardContent>
                      </Card>

                      {/* Password Reset Rate Limiting */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">
                            {t("settings.security.threatDetection.rateLimiting.passwordReset.title")}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <FormField
                            control={form.control}
                            name="rateLimiting.passwordReset.maxRequests"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t("settings.security.threatDetection.rateLimiting.passwordReset.maxRequests")}</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    {...field}
                                    onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                                    disabled={!canEdit}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="rateLimiting.passwordReset.windowMinutes"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t("settings.security.threatDetection.rateLimiting.passwordReset.windowMinutes")}</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    {...field}
                                    onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                                    disabled={!canEdit}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </CardContent>
                      </Card>

                      {/* API Rate Limiting */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">
                            {t("settings.security.threatDetection.rateLimiting.api.title")}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <FormField
                            control={form.control}
                            name="rateLimiting.api.maxRequests"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t("settings.security.threatDetection.rateLimiting.api.maxRequests")}</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    {...field}
                                    onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                                    disabled={!canEdit}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="rateLimiting.api.windowMinutes"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t("settings.security.threatDetection.rateLimiting.api.windowMinutes")}</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    {...field}
                                    onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                                    disabled={!canEdit}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Brute Force Protection */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {t("settings.security.threatDetection.bruteForceProtection.title")}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.security.threatDetection.bruteForceProtection.enabledDescription")}
                      </p>
                    </div>
                    <FormField
                      control={form.control}
                      name="bruteForceProtection.enabled"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!canEdit} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  {form.watch("bruteForceProtection.enabled") && (
                    <div className="space-y-4 pl-4 border-l-2">
                      <FormField
                        control={form.control}
                        name="bruteForceProtection.maxAttempts"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t("settings.security.threatDetection.bruteForceProtection.maxAttempts")}
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                                disabled={!canEdit}
                              />
                            </FormControl>
                            <FormDescription>
                              {t("settings.security.threatDetection.bruteForceProtection.maxAttemptsDescription")}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="bruteForceProtection.lockoutDurationMinutes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t("settings.security.threatDetection.bruteForceProtection.lockoutDurationMinutes")}
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                                disabled={!canEdit}
                              />
                            </FormControl>
                            <FormDescription>
                              {t("settings.security.threatDetection.bruteForceProtection.lockoutDurationDescription")}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="bruteForceProtection.windowMinutes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t("settings.security.threatDetection.bruteForceProtection.windowMinutes")}
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                                disabled={!canEdit}
                              />
                            </FormControl>
                            <FormDescription>
                              {t("settings.security.threatDetection.bruteForceProtection.windowMinutesDescription")}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>

                <Separator />

                {/* Anomaly Detection */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {t("settings.security.threatDetection.anomalyDetection.title")}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.security.threatDetection.anomalyDetection.enabledDescription")}
                      </p>
                    </div>
                    <FormField
                      control={form.control}
                      name="anomalyDetection.enabled"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!canEdit} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  {form.watch("anomalyDetection.enabled") && (
                    <div className="space-y-4 pl-4 border-l-2">
                      <FormField
                        control={form.control}
                        name="anomalyDetection.checkUnusualLocation"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">
                                {t("settings.security.threatDetection.anomalyDetection.checkUnusualLocation")}
                              </FormLabel>
                              <FormDescription>
                                {t("settings.security.threatDetection.anomalyDetection.checkUnusualLocationDescription")}
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!canEdit} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="anomalyDetection.checkUnusualTime"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">
                                {t("settings.security.threatDetection.anomalyDetection.checkUnusualTime")}
                              </FormLabel>
                              <FormDescription>
                                {t("settings.security.threatDetection.anomalyDetection.checkUnusualTimeDescription")}
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!canEdit} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="anomalyDetection.checkUnusualDevice"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">
                                {t("settings.security.threatDetection.anomalyDetection.checkUnusualDevice")}
                              </FormLabel>
                              <FormDescription>
                                {t("settings.security.threatDetection.anomalyDetection.checkUnusualDeviceDescription")}
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!canEdit} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>

                <Separator />

                {/* CAPTCHA */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {t("settings.security.threatDetection.captcha.title")}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.security.threatDetection.captcha.enabledDescription")}
                      </p>
                    </div>
                    <FormField
                      control={form.control}
                      name="captcha.enabled"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!canEdit} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  {form.watch("captcha.enabled") && (
                    <div className="pl-4 border-l-2">
                      <FormField
                        control={form.control}
                        name="captcha.triggerAfterFailedAttempts"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t("settings.security.threatDetection.captcha.triggerAfterFailedAttempts")}
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                                disabled={!canEdit}
                              />
                            </FormControl>
                            <FormDescription>
                              {t("settings.security.threatDetection.captcha.triggerAfterFailedAttemptsDescription")}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>

                {canEdit && (
                  <div className="pt-4">
                    <Button type="submit" disabled={updateSettings.isPending}>
                      {updateSettings.isPending && (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t("common.loading")}
                        </>
                      )}
                      {!updateSettings.isPending && t("common.save")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
