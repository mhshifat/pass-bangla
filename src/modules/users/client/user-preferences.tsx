"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useTranslation } from "react-i18next"
import { useTheme } from "next-themes"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { Globe, Moon, Sun } from "lucide-react"
import { showErrorFromException } from "@/lib/error-toast"

const preferencesSchema = z.object({
  language: z.string().optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
})

type PreferencesFormValues = z.infer<typeof preferencesSchema>

type UserPreferencesData = {
  language?: string
  theme?: "light" | "dark" | "system"
}

interface UserPreferencesProps {
  user: {
    id: string
    preferences?: UserPreferencesData
  }
  onUpdate?: () => void
}

export function UserPreferences({ user, onUpdate }: UserPreferencesProps) {
  const { t, i18n } = useTranslation()
  const { theme: currentTheme, setTheme } = useTheme()

  const defaultPreferences = {
    language: i18n.language,
    theme: currentTheme || "system",
    ...(user.preferences ?? {}),
  }

  const form = useForm<PreferencesFormValues>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: defaultPreferences as PreferencesFormValues,
  })

  // Sync theme when preferences are loaded
  React.useEffect(() => {
    if (user.preferences?.theme) {
      const savedTheme = user.preferences.theme
      if (savedTheme && savedTheme !== currentTheme) {
        setTheme(savedTheme)
        form.setValue("theme", savedTheme as "light" | "dark" | "system")
      }
    }
  }, [user.preferences, currentTheme, setTheme, form])

  const updateProfileMutation = trpc.users.updateProfile.useMutation({
    onSuccess: () => {
      toast.success(t("profile.preferencesUpdated"))
      onUpdate?.()
    },
    onError: (error) => {
      showErrorFromException(error, t("profile.preferencesUpdateError"))
    },
  })

  const handleSubmit = (values: PreferencesFormValues) => {
    // Apply theme immediately when saved
    if (values.theme && values.theme !== currentTheme) {
      setTheme(values.theme)
    }
    
    updateProfileMutation.mutate({
      preferences: values,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.preferences")}</CardTitle>
        <CardDescription>{t("profile.preferencesDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Globe className="h-5 w-5" />
                {t("profile.appearance")}
              </h3>

              <FormField
                control={form.control}
                name="theme"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base flex items-center gap-2">
                        {form.watch("theme") === "dark" ? (
                          <Moon className="h-4 w-4" />
                        ) : form.watch("theme") === "light" ? (
                          <Sun className="h-4 w-4" />
                        ) : (
                          <Globe className="h-4 w-4" />
                        )}
                        {t("profile.theme")}
                      </FormLabel>
                      <FormDescription>
                        {t("profile.themeDescription")}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={field.value === "light" ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            field.onChange("light")
                            setTheme("light")
                          }}
                        >
                          <Sun className="h-4 w-4 mr-2" />
                          {t("profile.light")}
                        </Button>
                        <Button
                          type="button"
                          variant={field.value === "dark" ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            field.onChange("dark")
                            setTheme("dark")
                          }}
                        >
                          <Moon className="h-4 w-4 mr-2" />
                          {t("profile.dark")}
                        </Button>
                        <Button
                          type="button"
                          variant={field.value === "system" ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            field.onChange("system")
                            setTheme("system")
                          }}
                        >
                          <Globe className="h-4 w-4 mr-2" />
                          {t("profile.system")}
                        </Button>
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <Button
              type="submit"
              disabled={updateProfileMutation.isPending}
            >
              {updateProfileMutation.isPending
                ? t("common.loading")
                : t("common.save")}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
