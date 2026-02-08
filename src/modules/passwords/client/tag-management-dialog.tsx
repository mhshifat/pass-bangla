"use client"

import * as React from "react"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useTranslation } from "react-i18next"
import { Palette, Smile } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { showErrorFromException } from "@/lib/error-toast"
import { cn } from "@/lib/utils"
import { createTagAction, updateTagAction } from "@/app/admin/passwords/tag-actions"
import { useTransition } from "react"
import { Badge } from "@/components/ui/badge"

// Common tag colors
const TAG_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#64748b", "#475569", "#334155",
]

// Common tag icons (emoji)
const TAG_ICONS = [
  "🔐", "💼", "🏠", "🎮", "🛒", "📧", "🌐", "💳", "📱", "💻",
  "🎵", "📺", "✈️", "🏦", "🏥", "🎓", "⚽", "🍔", "☕", "📚",
]

// Zod schema for tag form
const tagSchema = z.object({
  name: z.string().min(1, "Tag name is required"),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
})

type TagFormValues = z.infer<typeof tagSchema>

interface TagManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tag?: {
    id: string
    name: string
    color?: string | null
    icon?: string | null
  } | null
  onSuccess?: () => void
}

export function TagManagementDialog({
  open,
  onOpenChange,
  tag,
  onSuccess,
}: TagManagementDialogProps) {
  const { t } = useTranslation()
  const utils = trpc.useUtils()
  const [isPending, startTransition] = useTransition()
  const [colorPickerOpen, setColorPickerOpen] = React.useState(false)
  const [iconPickerOpen, setIconPickerOpen] = React.useState(false)

  const isEditing = !!tag

  const form = useForm<TagFormValues>({
    resolver: zodResolver(tagSchema),
    defaultValues: {
      name: "",
      color: null,
      icon: null,
    },
  })

  const name = form.watch("name")
  const color = form.watch("color")
  const icon = form.watch("icon")

  // Reset form when dialog opens/closes or tag changes
  useEffect(() => {
    if (open) {
      if (tag) {
        form.reset({
          name: tag.name,
          color: tag.color || null,
          icon: tag.icon || null,
        })
      } else {
        form.reset({
          name: "",
          color: null,
          icon: null,
        })
      }
    } else {
      form.reset()
    }
  }, [open, tag, form])

  const onSubmit = (values: TagFormValues) => {
    startTransition(async () => {
      try {
        let result
        if (isEditing && tag) {
          result = await updateTagAction(tag.id, {
            name: values.name.trim(),
            color: values.color,
            icon: values.icon,
          })
        } else {
          result = await createTagAction({
            name: values.name.trim(),
            color: values.color,
            icon: values.icon,
          })
        }

        if (result.success) {
          toast.success(
            isEditing
              ? t("passwords.tags.tagUpdated")
              : t("passwords.tags.tagCreated")
          )
          await utils.passwords.getExportFilters.invalidate()
          await utils.passwords.tagAnalytics.invalidate()
          await utils.passwords.tagAutocomplete.invalidate()
          await utils.passwords.tagSuggestions.invalidate()
          onSuccess?.()
          onOpenChange(false)
        } else {
          showErrorFromException(result.error, t("passwords.tags.tagError"))
        }
      } catch (error) {
        showErrorFromException(error, t("passwords.tags.tagError"))
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("passwords.tags.editTag") : t("passwords.tags.createTag")}
          </DialogTitle>
          <DialogDescription>
            {t("passwords.tags.tagDialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.name")} *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("passwords.tags.tagNamePlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("passwords.tags.color")}</FormLabel>
                      <FormControl>
                        <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full justify-start"
                            >
                              <Palette className="mr-2 h-4 w-4" />
                              {field.value ? (
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-4 h-4 rounded-full border"
                                    style={{ backgroundColor: field.value }}
                                  />
                                  <span className="text-xs">{field.value}</span>
                                </div>
                              ) : (
                                <span>{t("passwords.tags.selectColor")}</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64">
                            <div className="grid grid-cols-5 gap-2">
                              {TAG_COLORS.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => {
                                    field.onChange(c)
                                    setColorPickerOpen(false)
                                  }}
                                  className={cn(
                                    "w-8 h-8 rounded-full border-2 hover:scale-110 transition-transform",
                                    field.value === c ? "border-foreground" : "border-transparent"
                                  )}
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="w-full mt-2"
                              onClick={() => {
                                field.onChange(null)
                                setColorPickerOpen(false)
                              }}
                            >
                              {t("passwords.tags.clearColor")}
                            </Button>
                          </PopoverContent>
                        </Popover>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="icon"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("passwords.tags.icon")}</FormLabel>
                      <FormControl>
                        <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full justify-start"
                            >
                              <Smile className="mr-2 h-4 w-4" />
                              {field.value ? (
                                <span>{field.value}</span>
                              ) : (
                                <span>{t("passwords.tags.selectIcon")}</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64">
                            <div className="grid grid-cols-5 gap-2">
                              {TAG_ICONS.map((i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => {
                                    field.onChange(i)
                                    setIconPickerOpen(false)
                                  }}
                                  className={cn(
                                    "w-10 h-10 rounded-md border-2 hover:scale-110 transition-transform flex items-center justify-center text-lg",
                                    field.value === i ? "border-foreground" : "border-transparent"
                                  )}
                                >
                                  {i}
                                </button>
                              ))}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="w-full mt-2"
                              onClick={() => {
                                field.onChange(null)
                                setIconPickerOpen(false)
                              }}
                            >
                              {t("passwords.tags.clearIcon")}
                            </Button>
                          </PopoverContent>
                        </Popover>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {name && (
                <div className="p-4 border rounded-md bg-muted/50">
                  <div className="text-sm font-medium mb-2">
                    {t("passwords.tags.preview")}:
                  </div>
                  <Badge
                    variant="secondary"
                    className="flex items-center gap-2 w-fit"
                  >
                    {color && (
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    )}
                    {icon && <span>{icon}</span>}
                    <span>{name}</span>
                  </Badge>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? t("common.loading") : isEditing ? t("common.save") : t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
