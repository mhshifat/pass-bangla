
"use client"

import * as React from "react"
import { useState, useEffect, useActionState } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { showErrorFromException } from "@/lib/error-toast"
import { FormErrorDisplay } from "@/components/shared/form-error-display"
import { updateEmailConfigAction, testEmailConfigAction } from "@/app/admin/settings/email-actions"
import { useRouter } from "next/navigation"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2, Info } from "lucide-react"
import { Input } from "@/components/ui/input"
import { PasswordInput, generateStrongPassword } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"
import { useForm } from "react-hook-form"
import z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { usePermissions } from "@/hooks/use-permissions"

export interface EmailConfig {
  smtp_host: string
  smtp_port: string
  smtp_secure: boolean
  smtp_user: string
  smtp_password: string
  smtp_from_email: string
  smtp_from_name: string
}

interface EmailSettingsProps {
  config: EmailConfig
}

const createEmailSettingsSchema = (t: (key: string) => string) => z.object({
  smtp_host: z.string().min(1, t("settings.email.smtpHostRequired")),
  smtp_port: z.string().min(1, t("settings.email.smtpPortRequired")),
  smtp_secure: z.enum(["none", "tls", "ssl"]),
  smtp_user: z.string().optional(),
  smtp_password: z.string().optional(),
  smtp_from_email: z.string().email(t("settings.email.invalidEmail")),
  smtp_from_name: z.string().optional(),
})

export function EmailSettings({ config }: EmailSettingsProps) {
  const { t } = useTranslation()
  const emailSettingsSchema = createEmailSettingsSchema(t)
  type EmailSettingsFormValues = z.infer<typeof emailSettingsSchema>
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission("settings.edit")
  const router = useRouter()
  const [testEmail, setTestEmail] = useState("")
  const [isTesting, setIsTesting] = useState(false)
  const [state, formAction, isPending] = useActionState(updateEmailConfigAction, null)

  const form = useForm<EmailSettingsFormValues>({
    defaultValues: {
      smtp_host: config.smtp_host,
      smtp_port: config.smtp_port,
      smtp_secure: config.smtp_secure ? "ssl" : "tls",
      smtp_user: config.smtp_user,
      smtp_password: config.smtp_password,
      smtp_from_email: config.smtp_from_email,
      smtp_from_name: config.smtp_from_name,
    },
    resolver: zodResolver(emailSettingsSchema)
  })

  useEffect(() => {
    if (state?.success) {
      toast.success(t("settings.emailSettingsSaved"))
      router.refresh()
    } else if (state?.error) {
      showErrorFromException(state.error, t("settings.emailSettingsError"))
    }
  }, [state, router, t])

  const handleTestEmail = async () => {
    if (!testEmail) {
      toast.error(t("settings.testEmailRequired"))
      return
    }
    setIsTesting(true)
    try {
      const result = await testEmailConfigAction(testEmail)
      if (result.success) {
        toast.success(t("settings.testEmailSent", { email: testEmail }))
      } else {
        showErrorFromException(result.error, t("settings.testEmailFailed"))
      }
    } catch (error) {
      showErrorFromException(error, t("settings.testEmailFailed"))
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.email.smtpConfiguration")}</CardTitle>
          <CardDescription>{t("settings.email.smtpConfigurationDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => {
                // Convert smtp_secure to boolean and build FormData
                const submitData = {
                  ...data,
                  smtp_secure: data.smtp_secure === "ssl",
                }
                const formData = new FormData()
                Object.entries(submitData).forEach(([key, value]) => {
                  formData.append(key, String(value))
                })
                React.startTransition(() => {
                  formAction(formData)
                })
              })}
              className="space-y-6"
            >
              {!canEdit && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    {t("settings.readOnlyAccess")}
                  </AlertDescription>
                </Alert>
              )}

              {state?.error && (
                <FormErrorDisplay error={state.error} />
              )}

              <FormField
                control={form.control}
                name="smtp_host"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.email.smtpHost")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("settings.email.smtpHostPlaceholder")} {...field} disabled={!canEdit} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="smtp_port"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.email.smtpPort")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("settings.email.smtpPortPlaceholder")} {...field} disabled={!canEdit} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="smtp_secure"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.email.encryption")}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!canEdit}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">{t("settings.email.encryptionNone")}</SelectItem>
                          <SelectItem value="tls">{t("settings.email.encryptionTls")}</SelectItem>
                          <SelectItem value="ssl">{t("settings.email.encryptionSsl")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              <FormField
                control={form.control}
                name="smtp_user"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.email.smtpUsername")} ({t("common.optional")})</FormLabel>
                    <FormControl>
                      <Input placeholder={t("settings.email.smtpUsernamePlaceholder")} {...field} disabled={!canEdit} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {t("settings.email.smtpAuthOptional")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="smtp_password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.email.smtpPassword")} ({t("common.optional")})</FormLabel>
                    <FormControl>
                      <PasswordInput
                        placeholder="••••••••"
                        {...field}
                        onGenerate={() => {
                          const generated = generateStrongPassword(16)
                          form.setValue("smtp_password", generated)
                          field.onChange({ target: { value: generated } })
                        }}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {t("settings.email.smtpAuthOptional")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="smtp_from_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.email.fromEmailAddress")}</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder={t("settings.email.fromEmailPlaceholder")} {...field} disabled={!canEdit} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {t("settings.email.fromEmailDescription")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="smtp_from_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.email.fromName")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("settings.email.fromNamePlaceholder")} {...field} disabled={!canEdit} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              {canEdit && (
                <div className="flex gap-2">
                  <Button type="submit" disabled={isPending}>
                    {isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("common.loading")}
                      </>
                    ) : (
                      t("settings.email.saveEmailSettings")
                    )}
                  </Button>
                </div>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.email.testEmailConfiguration")}</CardTitle>
          <CardDescription>{t("settings.email.testEmailDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="test-email">{t("settings.email.testEmailAddress")}</Label>
            <Input
              id="test-email"
              type="email"
              placeholder={t("settings.email.testEmailPlaceholder")}
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <Button variant="outline" onClick={handleTestEmail} disabled={isTesting || !canEdit}>
            {isTesting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("users.sending")}
              </>
            ) : (
              t("settings.email.sendTestEmail")
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.email.emailNotifications")}</CardTitle>
          <CardDescription>{t("settings.email.emailNotificationsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("settings.email.newUserRegistration")}</Label>
              <p className="text-xs text-muted-foreground">{t("settings.email.newUserRegistrationDescription")}</p>
            </div>
            <Switch defaultChecked disabled={!canEdit} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("settings.email.passwordShared")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("settings.email.passwordSharedDescription")}
              </p>
            </div>
            <Switch defaultChecked disabled={!canEdit} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("settings.email.passwordExpiring")}</Label>
              <p className="text-xs text-muted-foreground">{t("settings.email.passwordExpiringDescription")}</p>
            </div>
            <Switch defaultChecked disabled={!canEdit} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("settings.email.securityAlerts")}</Label>
              <p className="text-xs text-muted-foreground">{t("settings.email.securityAlertsDescription")}</p>
            </div>
            <Switch defaultChecked disabled={!canEdit} />
          </div>

          {canEdit && (
            <div className="pt-4">
              <Button>{t("settings.email.saveNotificationSettings")}</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
