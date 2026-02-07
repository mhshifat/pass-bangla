"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput, generateStrongPassword } from "@/components/ui/password-input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { QrCode, FolderPlus, AlertCircle } from "lucide-react"
import { trpc } from "@/trpc/client"
import { CreateFolderDialog } from "@/modules/folders/client"
import { TagAutocomplete, TemplateSelector } from "@/modules/passwords/client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { usePasswordDecryption } from "@/hooks/use-password-decryption"

const passwordSchema = z.object({
  name: z.string().min(1, "Name is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  url: z
    .string()
    .refine((val) => val === "" || z.string().url().safeParse(val).success, {
      message: "Must be a valid URL",
    })
    .optional()
    .or(z.literal("")),
  folderId: z.string().optional(),
  notes: z.string().optional(),
  enableTotp: z.boolean(),
  totpSecret: z.string().optional(),
  tagIds: z.array(z.string()).optional(),
})

type PasswordFormValues = z.infer<typeof passwordSchema>

interface Password {
  id: string
  name: string
  username: string
  password: string
  passwordEncrypted?: boolean // Flag indicating if password is encrypted
  passwordDecryptionError?: boolean
  url?: string | null
  folderId?: string | null
  notes?: string | null
  hasTotp: boolean
  totpSecret?: string | null
  totpEncrypted?: boolean // Flag indicating if TOTP secret is encrypted
  totpDecryptionError?: boolean
}

interface PasswordFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  password?: Password | null
  mode?: "create" | "edit"
  formAction?: (payload: FormData) => void
  isPending?: boolean
  state?: { error?: string; fieldErrors?: { [key: string]: string }; success?: boolean } | null
  onSubmit?: (data: Record<string, unknown>) => void // For backward compatibility
}

export function PasswordFormDialog({
  open,
  onOpenChange,
  password,
  mode = "create",
  formAction,
  isPending = false,
  state = null,
  onSubmit,
}: PasswordFormDialogProps) {
  const { t } = useTranslation()
  const [isCreateFolderDialogOpen, setIsCreateFolderDialogOpen] = React.useState(false)

  // Fetch folders
  const { data: foldersData, refetch: refetchFolders } = trpc.folders.list.useQuery(
    undefined,
    {
      enabled: open,
    }
  )

  const folders = foldersData?.folders || []

  const handleTemplateSelect = (template: {
    id: string
    name: string
    defaultFields: Record<string, string>
  }) => {
    const fields = template.defaultFields || {}
    form.setValue("name", fields.name || "")
    form.setValue("username", fields.username || "")
    form.setValue("url", fields.url || "")
    form.setValue("notes", fields.notes || "")
    // Generate a strong password for the template
    const generatedPassword = generateStrongPassword(20)
    form.setValue("password", generatedPassword)
  }

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      name: "",
      username: "",
      password: "",
      url: "",
      folderId: "",
      notes: "",
      enableTotp: false,
      totpSecret: "",
      tagIds: [],
    },
  })

  const enableTotp = form.watch("enableTotp")

  // Client-side decryption for encrypted passwords
  const encryptedPassword = password?.passwordEncrypted ? password.password : null
  const encryptedTotpSecret = password?.totpEncrypted && password.totpSecret ? password.totpSecret : null
  
  const {
    decryptedPassword,
    decryptedTotpSecret,
    isDecrypting: isDecryptingPassword,
    error: decryptionError,
  } = usePasswordDecryption(encryptedPassword, encryptedTotpSecret)

  // Get the final decrypted password (use decrypted if encrypted, otherwise use original)
  const finalPassword = password?.passwordEncrypted 
    ? decryptedPassword 
    : (password?.password || "")
  const finalTotpSecret = password?.totpEncrypted
    ? decryptedTotpSecret
    : (password?.totpSecret || "")

  // Reset form when dialog opens/closes or password changes
  useEffect(() => {
    if (open) {
      if (password && mode === "edit") {
        // Wait for decryption to complete if password is encrypted
        if (password.passwordEncrypted && (isDecryptingPassword || (!decryptionError && !finalPassword && password.password))) {
          return // Don't reset form while decrypting or if decryption hasn't produced a result yet
        }

        // Reset form with password data when available
        // If password decryption failed, leave password field empty so user can re-enter it
        form.reset({
          name: password.name,
          username: password.username,
          password: password.passwordDecryptionError || decryptionError ? "" : (finalPassword || password.password || ""),
          url: password.url || "",
          folderId: password.folderId || "",
          notes: password.notes || "",
          enableTotp: password.hasTotp && !password.totpDecryptionError && !decryptionError,
          totpSecret: password.totpDecryptionError || decryptionError ? "" : (finalTotpSecret || password.totpSecret || ""),
          tagIds: (password as { tags?: { id: string }[] }).tags?.map((t) => t.id) || [],
        })
      } else if (mode === "create") {
        form.reset({
          name: "",
          username: "",
          password: "",
          url: "",
          folderId: "",
          notes: "",
          enableTotp: false,
          totpSecret: "",
          tagIds: [],
        })
      }
    } else {
      // Reset form when dialog closes
      form.reset()
    }
  }, [open, password, mode, form, finalPassword, finalTotpSecret, isDecryptingPassword, decryptionError])

  // Sync server errors to form state
  useEffect(() => {
    if (state?.error) {
      form.setError("root", {
        type: "server",
        message: state.error,
      })
    }

    // Set field-specific errors
    if (state?.fieldErrors) {
      Object.entries(state.fieldErrors).forEach(([field, message]) => {
        form.setError(field as keyof PasswordFormValues, {
          type: "server",
          message,
        })
      })
    }

    // Close dialog on success
    if (state?.success) {
      onOpenChange(false)
      form.reset()
    }
  }, [state, form, onOpenChange])


  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    if (formAction) {
      // Use server action - FormData will be created from form fields
      const formData = new FormData(e.currentTarget)
      // Ensure totpSecret is only included if enableTotp is true
      const values = form.getValues()
      if (!values.enableTotp || !values.totpSecret) {
        formData.delete("totpSecret")
      }
      // Add tagIds
      if (values.tagIds && values.tagIds.length > 0) {
        // Remove any existing tagIds from formData first
        formData.delete("tagIds")
        values.tagIds.forEach((tagId) => {
          formData.append("tagIds", tagId)
        })
      }
      // Add passwordId for edit mode
      if (mode === "edit" && password?.id) {
        formData.append("passwordId", password.id)
      }
      React.startTransition(() => {
        formAction(formData)
      })
    } else if (onSubmit) {
      // Use callback for backward compatibility
      const values = form.getValues()
      const data = {
        name: values.name,
        username: values.username,
        password: values.password,
        url: values.url || null,
        folderId: values.folderId || null,
        notes: values.notes || null,
        totpSecret: values.enableTotp && values.totpSecret ? values.totpSecret : null,
      }
      onSubmit(data)
    }
  }

  const handleCreateFolderSuccess = (newFolderId: string) => {
    refetchFolders()
    form.setValue("folderId", newFolderId)
    setIsCreateFolderDialogOpen(false)
  }

  const handleDialogOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset()
    }
    onOpenChange(newOpen)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle>{mode === "create" ? t("passwords.addPassword") : t("passwords.editPassword")}</DialogTitle>
                <DialogDescription>
                  {mode === "create" ? t("passwords.createPasswordDescription") : t("passwords.updatePasswordDescription")}
                </DialogDescription>
              </div>
              {mode === "create" && (
                <TemplateSelector onSelectTemplate={handleTemplateSelect} />
              )}
            </div>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={handleSubmit} className="space-y-4">
              {form.formState.errors.root && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
                </Alert>
              )}
              {mode === "edit" && password?.passwordDecryptionError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    The password could not be decrypted. Please re-enter the password below to fix this issue.
                  </AlertDescription>
                </Alert>
              )}
              {mode === "edit" && password?.totpDecryptionError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    The TOTP secret could not be decrypted. Please re-enter the TOTP secret below or disable TOTP.
                  </AlertDescription>
                </Alert>
              )}
              {mode === "edit" && !password && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  {t("common.loading")}
                </div>
              )}
              <div className="overflow-y-auto max-h-[calc(90vh-180px)] pr-2 space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("passwords.passwordName")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("passwords.passwordNamePlaceholder")} {...field} name="name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("passwords.username")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("passwords.usernamePlaceholder")} {...field} name="username" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.password")}</FormLabel>
                      <FormControl>
                          <PasswordInput
                            {...field}
                            name="password"
                            showGenerateButton={true}
                            onGenerate={() => {
                              const generated = generateStrongPassword(20)
                              form.setValue("password", generated)
                              field.onChange({ target: { value: generated } })
                            }}
                          />
                      </FormControl>
                      <FormDescription>
                        {t("passwords.passwordDescription")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("passwords.url")} ({t("common.optional")})</FormLabel>
                      <FormControl>
                        <Input placeholder={t("passwords.urlPlaceholder")} {...field} name="url" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="folderId"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>{t("passwords.folder")}</FormLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsCreateFolderDialogOpen(true)}
                          className="h-7 text-xs"
                        >
                          <FolderPlus className="mr-1 h-3 w-3" />
                          {t("passwords.createFolder")}
                        </Button>
                      </div>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={t("passwords.selectFolder")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {folders.length === 0 ? (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground text-center">
                              {t("passwords.noFolders")}
                            </div>
                          ) : (
                            folders.map((folder) => (
                              <SelectItem key={folder.id} value={folder.id}>
                                {folder.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <input type="hidden" name="folderId" value={field.value || ""} />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tagIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("passwords.tags.tags")} ({t("common.optional")})</FormLabel>
                      <FormControl>
                        <TagAutocomplete
                          selectedTagIds={field.value || []}
                          onTagsChange={field.onChange}
                          passwordId={mode === "edit" ? password?.id : undefined}
                          placeholder={t("passwords.tags.selectTags")}
                        />
                      </FormControl>
                      <FormMessage />
                      {field.value && field.value.length > 0 && (
                        <div className="hidden">
                          {field.value.map((tagId) => (
                            <input key={tagId} type="hidden" name="tagIds" value={tagId} />
                          ))}
                        </div>
                      )}
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("passwords.notes")} ({t("common.optional")})</FormLabel>
                      <FormControl>
                        <Textarea placeholder={t("passwords.notesPlaceholder")} rows={3} {...field} name="notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="enableTotp"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{t("passwords.totpAuth")}</FormLabel>
                          <FormDescription>
                            {t("passwords.totpAuthDescription")}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <input type="hidden" name="enableTotp" value={field.value ? "true" : "false"} />
                      </FormItem>
                    )}
                  />

                  {enableTotp && (
                    <>
                      <FormField
                        control={form.control}
                        name="totpSecret"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("passwords.totpSecretKey")}</FormLabel>
                            <FormControl>
                              <div className="flex gap-2">
                                <Input
                                  placeholder={t("passwords.totpSecretPlaceholder")}
                                  className="font-mono"
                                  {...field}
                                  name={enableTotp ? "totpSecret" : undefined}
                                />
                                <Button type="button" variant="outline" size="icon" title={t("passwords.scanQrCode")}>
                                  <QrCode className="h-4 w-4" />
                                </Button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
                        <p className="text-xs font-medium">{t("passwords.totpInstructionsTitle")}</p>
                        <ol className="text-xs text-muted-foreground space-y-1.5 ml-4 list-decimal">
                          <li>{t("passwords.totpInstruction1")}</li>
                          <li>{t("passwords.totpInstruction2")}</li>
                          <li>{t("passwords.totpInstruction3")}</li>
                          <li>{t("passwords.totpInstruction4")}</li>
                          <li>{t("passwords.totpInstruction5")}</li>
                          <li>{t("passwords.totpInstruction6")}</li>
                        </ol>
                        <p className="text-xs text-muted-foreground mt-2">
                          💡 <strong>{t("passwords.tip")}:</strong> {t("passwords.totpTip")}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleDialogOpenChange(false)}
                  disabled={isPending}
                >
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending
                    ? mode === "create"
                      ? t("passwords.creating")
                      : t("passwords.saving")
                    : mode === "create"
                    ? t("passwords.savePassword")
                    : t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <CreateFolderDialog
        open={isCreateFolderDialogOpen}
        onOpenChange={setIsCreateFolderDialogOpen}
        onSuccess={handleCreateFolderSuccess}
      />
    </>
  )
}
