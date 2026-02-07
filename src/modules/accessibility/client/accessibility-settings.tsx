"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { useAccessibility } from "@/components/providers/accessibility-provider"
import { Accessibility, Type, Contrast, Move } from "lucide-react"
import { showErrorFromException } from "@/lib/error-toast"

const accessibilitySchema = z.object({
  highContrast: z.boolean(),
  fontSize: z.enum(["small", "medium", "large", "xlarge"]),
  reducedMotion: z.boolean(),
})

type AccessibilityFormValues = z.infer<typeof accessibilitySchema>

interface AccessibilitySettingsProps {
  user: {
    id: string
    preferences?: unknown
  }
  onUpdate?: () => void
}

export function AccessibilitySettings({ user, onUpdate }: AccessibilitySettingsProps) {
  const { t } = useTranslation()
  const { preferences: a11yPrefs, updatePreferences: updateA11yPrefs } = useAccessibility()

  const userPrefs = user.preferences as Record<string, unknown> | null | undefined
  const defaultPreferences = {
    highContrast: a11yPrefs.highContrast,
    fontSize: a11yPrefs.fontSize,
    reducedMotion: a11yPrefs.reducedMotion,
    ...(userPrefs?.accessibility as Partial<AccessibilityFormValues> | undefined),
  }

  const form = useForm<AccessibilityFormValues>({
    resolver: zodResolver(accessibilitySchema),
    defaultValues: defaultPreferences,
  })

  // Sync with accessibility provider when preferences change
  const highContrast = form.watch("highContrast")
  const fontSize = form.watch("fontSize")
  const reducedMotion = form.watch("reducedMotion")

  React.useEffect(() => {
    updateA11yPrefs({
      highContrast,
      fontSize,
      reducedMotion,
    })
  }, [highContrast, fontSize, reducedMotion, updateA11yPrefs])

  const updateProfileMutation = trpc.users.updateProfile.useMutation({
    onSuccess: () => {
      toast.success(t("accessibility.settingsUpdated"))
      onUpdate?.()
    },
    onError: (error) => {
      showErrorFromException(error, t("accessibility.settingsUpdateError"))
    },
  })

  const handleSubmit = (values: AccessibilityFormValues) => {
    // Update accessibility provider immediately
    updateA11yPrefs({
      highContrast: values.highContrast,
      fontSize: values.fontSize,
      reducedMotion: values.reducedMotion,
    })

    // Save to user preferences
    const currentPreferences = (user.preferences as Record<string, unknown> | null | undefined) || {}
    updateProfileMutation.mutate({
      preferences: {
        ...(typeof currentPreferences === "object" && currentPreferences !== null ? currentPreferences : {}),
        accessibility: values,
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Accessibility className="h-5 w-5" />
          {t("accessibility.title")}
        </CardTitle>
        <CardDescription>{t("accessibility.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* High Contrast Mode */}
            <FormField
              control={form.control}
              name="highContrast"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base flex items-center gap-2">
                      <Contrast className="h-4 w-4" />
                      {t("accessibility.highContrast")}
                    </FormLabel>
                    <FormDescription>
                      {t("accessibility.highContrastDescription")}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label={t("accessibility.highContrast")}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Font Size */}
            <FormField
              control={form.control}
              name="fontSize"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5 flex-1">
                    <FormLabel className="text-base flex items-center gap-2">
                      <Type className="h-4 w-4" />
                      {t("accessibility.fontSize")}
                    </FormLabel>
                    <FormDescription>
                      {t("accessibility.fontSizeDescription")}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">{t("accessibility.fontSizeSmall")}</SelectItem>
                        <SelectItem value="medium">{t("accessibility.fontSizeMedium")}</SelectItem>
                        <SelectItem value="large">{t("accessibility.fontSizeLarge")}</SelectItem>
                        <SelectItem value="xlarge">{t("accessibility.fontSizeXLarge")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Reduced Motion */}
            <FormField
              control={form.control}
              name="reducedMotion"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base flex items-center gap-2">
                      <Move className="h-4 w-4" />
                      {t("accessibility.reducedMotion")}
                    </FormLabel>
                    <FormDescription>
                      {t("accessibility.reducedMotionDescription")}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label={t("accessibility.reducedMotion")}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending
                  ? t("common.loading")
                  : t("common.save")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

