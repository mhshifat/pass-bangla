"use client"

import { useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
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
import { ThemeSelect } from "@/components/ui/theme-selector"
import { useTheme } from "next-themes"
import { LanguageSelector } from "@/components/ui/language-selector"
import { useTranslation } from "react-i18next"
import { showErrorFromException } from "@/lib/error-toast"

const createGeneralSettingsSchema = (t: (key: string) => string) => z.object({
  appName: z.string().min(1, t("settings.appNameRequired")),
  maintenanceMode: z.boolean(),
  theme: z.enum(["light", "dark", "system"]).optional(),
})

export function GeneralSettings() {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission("settings.edit")
  const { data: settings, isLoading, error } = trpc.settings.getGeneralSettings.useQuery()
  const utils = trpc.useUtils()
  const updateSettings = trpc.settings.updateGeneralSettings.useMutation({
    onSuccess: () => {
      toast.success(t("settings.generalSettingsSaved"))
      utils.settings.getGeneralSettings.invalidate()
    },
    onError: (error) => {
      showErrorFromException(error, t("settings.generalSettingsFailed"))
    },
  })

  const generalSettingsSchema = createGeneralSettingsSchema(t)
  type GeneralSettingsFormValues = z.infer<typeof generalSettingsSchema>

  const { theme: currentTheme, setTheme } = useTheme()
  const form = useForm<GeneralSettingsFormValues>({
    resolver: zodResolver(generalSettingsSchema),
    defaultValues: {
      appName: "PassBangla",
      maintenanceMode: false,
      theme: "system",
    },
  })

  // Update form when settings are loaded (only when settings change, not when theme changes)
  useEffect(() => {
    if (settings) {
      const themeValue = settings.theme || "system"
      form.reset({
        appName: settings.appName,
        maintenanceMode: settings.maintenanceMode,
        theme: themeValue as "light" | "dark" | "system",
      })
      // Sync theme with next-themes only on initial load
      if (settings.theme) {
        setTheme(settings.theme)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]) // Only depend on settings, not currentTheme or setTheme

  const onSubmit = async (values: GeneralSettingsFormValues) => {
    // Sync theme with next-themes immediately
    if (values.theme && values.theme !== currentTheme) {
      setTheme(values.theme)
    }
    updateSettings.mutate(values)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.applicationSettings")}</CardTitle>
          <CardDescription>{t("settings.generalSettingsDescription")}</CardDescription>
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
          <CardTitle>{t("settings.applicationSettings")}</CardTitle>
          <CardDescription>{t("settings.generalSettingsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-destructive">
            <p>{t("settings.loadSettingsFailed", { error: error.message })}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.title")}</CardTitle>
            <CardDescription>{t("settings.generalSettingsDescription")}</CardDescription>
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
              name="appName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.appName")}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="PassBangla" disabled={!canEdit} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.appNameDescription")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="theme"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.theme")}</FormLabel>
                  <FormControl>
                    <ThemeSelect
                      value={field.value || "system"}
                      onValueChange={(value) => {
                        field.onChange(value)
                        setTheme(value)
                      }}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.themeDescription")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormItem>
              <FormLabel>{t("settings.language")}</FormLabel>
              <FormControl>
                <LanguageSelector disabled={!canEdit} />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                {t("settings.languageDescription")}
              </p>
            </FormItem>

            <Separator />

            <FormField
              control={form.control}
              name="maintenanceMode"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel>{t("settings.maintenanceMode")}</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.maintenanceModeDescription")}
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
                  {t("settings.saveSettings")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </form>
    </Form>
  )
}
