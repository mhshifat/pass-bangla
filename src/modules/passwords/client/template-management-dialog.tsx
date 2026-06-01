"use client"

import * as React from "react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useTranslation } from "react-i18next"
import { FileText, Sparkles, Building2, Globe, Lock, Mail, Code, CreditCard, Gamepad2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { showErrorFromException } from "@/lib/error-toast"

const templateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  service: z.string().optional(),
  icon: z.string().optional(),
  category: z.string().optional(),
  isPublic: z.boolean(),
  defaultFields: z.object({
    name: z.string().optional(),
    username: z.string().optional(),
    url: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
})

type TemplateFormValues = z.infer<typeof templateSchema>

interface TemplateManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: {
    id: string
    name: string
    description?: string | null
    service?: string | null
    icon?: string | null
    category?: string | null
    isPublic: boolean
    defaultFields?: {
      name?: string
      username?: string
      url?: string
      notes?: string
    } | null
  } | null
  onSuccess?: () => void
}

const CATEGORIES = [
  { value: "Cloud", label: "Cloud", icon: Building2 },
  { value: "Social", label: "Social Media", icon: Globe },
  { value: "Banking", label: "Banking", icon: CreditCard },
  { value: "Email", label: "Email", icon: Mail },
  { value: "Development", label: "Development", icon: Code },
  { value: "Gaming", label: "Gaming", icon: Gamepad2 },
  { value: "Other", label: "Other", icon: FileText },
]

const COMMON_ICONS = [
  "🔐", "🌐", "☁️", "💼", "🏦", "📧", "💻", "🎮", "🛒", "🎵", "📱", "🔑",
  "⚡", "🔥", "⭐", "🚀", "💎", "🎯", "🔒", "🌍", "📊", "🎨", "🏠", "⚙️",
]

export function TemplateManagementDialog({
  open,
  onOpenChange,
  template,
  onSuccess,
}: TemplateManagementDialogProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const utils = trpc.useUtils()

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: template?.name || "",
      description: template?.description || "",
      service: template?.service || "",
      icon: template?.icon || "",
      category: template?.category || "",
      isPublic: template?.isPublic || false,
      defaultFields: template?.defaultFields || {
        name: "",
        username: "",
        url: "",
        notes: "",
      },
    },
  })

  // Reset form when template changes
  React.useEffect(() => {
    if (template) {
      form.reset({
        name: template.name,
        description: template.description || "",
        service: template.service || "",
        icon: template.icon || "",
        category: template.category || "",
        isPublic: template.isPublic,
        defaultFields: template.defaultFields || {
          name: "",
          username: "",
          url: "",
          notes: "",
        },
      })
    } else {
      form.reset({
        name: "",
        description: "",
        service: "",
        icon: "",
        category: "",
        isPublic: false,
        defaultFields: {
          name: "",
          username: "",
          url: "",
          notes: "",
        },
      })
    }
  }, [template, form, open])

  const createTemplateMutation = trpc.passwords.createTemplate.useMutation({
    onSuccess: async () => {
      toast.success(t("passwords.templates.created"))
      await utils.passwords.listTemplates.invalidate()
      onSuccess?.()
      onOpenChange(false)
      form.reset()
    },
    onError: (error) => {
      showErrorFromException(error, t("passwords.templates.createError"))
    },
  })

  const updateTemplateMutation = trpc.passwords.updateTemplate.useMutation({
    onSuccess: async () => {
      toast.success(t("passwords.templates.updated"))
      await utils.passwords.listTemplates.invalidate()
      onSuccess?.()
      onOpenChange(false)
    },
    onError: (error) => {
      showErrorFromException(error, t("passwords.templates.updateError"))
    },
  })

  const handleSubmit = (values: TemplateFormValues) => {
    // Transform defaultFields to match server schema (z.record(z.string(), z.unknown()))
    // Only include fields that have actual values (not empty strings)
    const defaultFields: Record<string, unknown> = {}
    if (values.defaultFields) {
      if (values.defaultFields.name?.trim()) {
        defaultFields.name = values.defaultFields.name.trim()
      }
      if (values.defaultFields.username?.trim()) {
        defaultFields.username = values.defaultFields.username.trim()
      }
      if (values.defaultFields.url?.trim()) {
        defaultFields.url = values.defaultFields.url.trim()
      }
      if (values.defaultFields.notes?.trim()) {
        defaultFields.notes = values.defaultFields.notes.trim()
      }
    }

    const transformedValues: {
      name: string
      description?: string
      service?: string
      icon?: string
      category?: string
      isPublic: boolean
      defaultFields?: Record<string, unknown>
    } = {
      name: values.name.trim(),
      isPublic: values.isPublic,
    }

    // Only add optional fields if they have values
    if (values.description?.trim()) {
      transformedValues.description = values.description.trim()
    }
    if (values.service?.trim()) {
      transformedValues.service = values.service.trim()
    }
    if (values.icon?.trim()) {
      transformedValues.icon = values.icon.trim()
    }
    if (values.category?.trim()) {
      transformedValues.category = values.category.trim()
    }
    if (Object.keys(defaultFields).length > 0) {
      transformedValues.defaultFields = defaultFields
    }

    if (template) {
      updateTemplateMutation.mutate({
        id: template.id,
        ...transformedValues,
        description: transformedValues.description || null,
        service: transformedValues.service || null,
        icon: transformedValues.icon || null,
        category: transformedValues.category || null,
      })
    } else {
      createTemplateMutation.mutate(transformedValues)
    }
  }

  const selectedCategory = form.watch("category")
  const CategoryIcon = CATEGORIES.find((c) => c.value === selectedCategory)?.icon || FileText

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {template
              ? t("passwords.templates.editTemplate")
              : t("passwords.templates.createTemplate")}
          </DialogTitle>
          <DialogDescription>
            {template
              ? t("passwords.templates.editTemplateDescription")
              : t("passwords.templates.createTemplateDescription")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.name")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("passwords.templates.namePlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.description")}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t("passwords.templates.descriptionPlaceholder")}
                        {...field}
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="service"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("passwords.templates.service")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("passwords.templates.servicePlaceholder")}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {t("passwords.templates.serviceDescription")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("passwords.templates.category")}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("passwords.templates.selectCategory")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORIES.map((category) => {
                            const Icon = category.icon
                            return (
                              <SelectItem key={category.value} value={category.value}>
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4" />
                                  {category.label}
                                </div>
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("passwords.templates.icon")}</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Input
                          placeholder={t("passwords.templates.iconPlaceholder")}
                          {...field}
                          maxLength={2}
                        />
                        <div className="flex flex-wrap gap-2">
                          {COMMON_ICONS.map((icon) => (
                            <button
                              key={icon}
                              type="button"
                              onClick={() => form.setValue("icon", icon)}
                              className={cn(
                                "w-8 h-8 rounded border flex items-center justify-center text-lg hover:bg-muted transition-colors",
                                field.value === icon && "border-primary bg-primary/10"
                              )}
                            >
                              {icon}
                            </button>
                          ))}
                        </div>
                      </div>
                    </FormControl>
                    <FormDescription>
                      {t("passwords.templates.iconDescription")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isPublic"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        {t("passwords.templates.makePublic")}
                      </FormLabel>
                      <FormDescription>
                        {t("passwords.templates.makePublicDescription")}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Default Fields */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <FormLabel className="text-base">
                  {t("passwords.templates.defaultFields")}
                </FormLabel>
              </div>
              <FormDescription>
                {t("passwords.templates.defaultFieldsDescription")}
              </FormDescription>

              <FormField
                control={form.control}
                name="defaultFields.name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("passwords.passwordName")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("passwords.templates.defaultNamePlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultFields.username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("passwords.username")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("passwords.templates.defaultUsernamePlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultFields.url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("passwords.url")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("passwords.templates.defaultUrlPlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultFields.notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("passwords.notes")}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t("passwords.templates.defaultNotesPlaceholder")}
                        {...field}
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
              >
                {createTemplateMutation.isPending || updateTemplateMutation.isPending
                  ? t("common.loading")
                  : template
                    ? t("common.update")
                    : t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
