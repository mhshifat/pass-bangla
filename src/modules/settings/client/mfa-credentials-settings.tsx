"use client"

import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import z from "zod"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { usePermissions } from "@/hooks/use-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info } from "lucide-react"
import { showErrorFromException } from "@/lib/error-toast"

const createMfaCredentialsSchema = (t: (key: string) => string) => z.object({
  smsAccountSid: z.string().optional(),
  smsAuthToken: z.string().optional(),
  smsPhoneNumber: z.string().optional(),
  webauthnRpId: z.string().optional(),
  webauthnRpName: z.string().optional(),
  webauthnOrigin: z.string().url(t("settings.mfaCredentialsSettings.invalidUrl")).optional().or(z.literal("")),
})

export function MfaCredentialsSettings() {
  const { t } = useTranslation()
  const mfaCredentialsSchema = createMfaCredentialsSchema(t)
  type MfaCredentialsFormValues = z.infer<typeof mfaCredentialsSchema>
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission("settings.edit")
  const { data: credentials, isLoading, error } = trpc.settings.getMfaCredentials.useQuery()
  const utils = trpc.useUtils()
  const updateCredentials = trpc.settings.updateMfaCredentials.useMutation({
    onSuccess: () => {
      toast.success(t("settings.mfaCredentialsSettings.saved"))
      utils.settings.getMfaCredentials.invalidate()
    },
    onError: (error) => {
      showErrorFromException(error, t("settings.mfaCredentialsSettings.saveFailed"))
    },
  })

  const form = useForm<MfaCredentialsFormValues>({
    resolver: zodResolver(mfaCredentialsSchema),
    defaultValues: {
      smsAccountSid: "",
      smsAuthToken: "",
      smsPhoneNumber: "",
      webauthnRpId: "",
      webauthnRpName: "",
      webauthnOrigin: "",
    },
  })

  // Update form when credentials are loaded
  useEffect(() => {
    if (credentials) {
      form.reset({
        smsAccountSid: credentials.smsAccountSid,
        smsAuthToken: credentials.smsAuthToken,
        smsPhoneNumber: credentials.smsPhoneNumber,
        webauthnRpId: credentials.webauthnRpId,
        webauthnRpName: credentials.webauthnRpName,
        webauthnOrigin: credentials.webauthnOrigin,
      })
    }
  }, [credentials, form])

  const onSubmit = async (values: MfaCredentialsFormValues) => {
    updateCredentials.mutate(values)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.mfaCredentials")}</CardTitle>
          <CardDescription>{t("settings.mfaCredentialsDescription")}</CardDescription>
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
          <CardTitle>{t("settings.mfaCredentials")}</CardTitle>
          <CardDescription>{t("settings.mfaCredentialsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-destructive">
            <p>{t("settings.mfaCredentialsSettings.loadFailed", { error: error.message })}</p>
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

        {/* SMS Credentials */}
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.mfaCredentialsSettings.smsTitle")}</CardTitle>
            <CardDescription>
              {t("settings.mfaCredentialsSettings.smsDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="smsAccountSid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.mfaCredentialsSettings.smsAccountSid")}</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder={t("settings.mfaCredentialsSettings.smsAccountSidPlaceholder")}
                      {...field}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("settings.mfaCredentialsSettings.smsAccountSidDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="smsAuthToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.mfaCredentialsSettings.smsAuthToken")}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      placeholder={t("settings.mfaCredentialsSettings.smsAuthTokenPlaceholder")}
                      {...field}
                      disabled={!canEdit}
                      showToggleButton={true}
                      showGenerateButton={false}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("settings.mfaCredentialsSettings.smsAuthTokenDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="smsPhoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.mfaCredentialsSettings.smsPhoneNumber")}</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder={t("settings.mfaCredentialsSettings.smsPhoneNumberPlaceholder")}
                      {...field}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("settings.mfaCredentialsSettings.smsPhoneNumberDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* WebAuthn Credentials */}
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.mfaCredentialsSettings.webauthnTitle")}</CardTitle>
            <CardDescription>
              {t("settings.mfaCredentialsSettings.webauthnDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="webauthnRpId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.mfaCredentialsSettings.webauthnRpId")}</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder={t("settings.mfaCredentialsSettings.webauthnRpIdPlaceholder")}
                      {...field}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("settings.mfaCredentialsSettings.webauthnRpIdDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="webauthnRpName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.mfaCredentialsSettings.webauthnRpName")}</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder={t("settings.mfaCredentialsSettings.webauthnRpNamePlaceholder")}
                      {...field}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("settings.mfaCredentialsSettings.webauthnRpNameDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="webauthnOrigin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.mfaCredentialsSettings.webauthnOrigin")}</FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder={t("settings.mfaCredentialsSettings.webauthnOriginPlaceholder")}
                      {...field}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("settings.mfaCredentialsSettings.webauthnOriginDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" disabled={updateCredentials.isPending}>
              {updateCredentials.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("settings.mfaCredentialsSettings.saveButton")}
            </Button>
          </div>
        )}
      </form>
    </Form>
  )
}
