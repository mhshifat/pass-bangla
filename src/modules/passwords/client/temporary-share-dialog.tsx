"use client"

import * as React from "react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Copy, Check, Link2, Calendar, Users, AlertCircle, Settings2 } from "lucide-react"
import Link from "next/link"
import { trpc } from "@/trpc/client"
import { showErrorFromException } from "@/lib/error-toast"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"

const temporaryShareSchema = z.object({
  expiresAt: z.string().optional(),
  maxAccesses: z.number().min(1).max(100).optional(),
  isOneTime: z.boolean(),
  includeTotp: z.boolean(),
})

type TemporaryShareFormValues = z.infer<typeof temporaryShareSchema>

interface TemporaryShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  passwordId: string
  passwordName: string
  onSuccess: () => void
}

export function TemporaryShareDialog({
  open,
  onOpenChange,
  passwordId,
  passwordName,
  onSuccess,
}: TemporaryShareDialogProps) {
  const { t } = useTranslation()
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const form = useForm<TemporaryShareFormValues>({
    resolver: zodResolver(temporaryShareSchema),
    defaultValues: {
      expiresAt: undefined,
      maxAccesses: undefined,
      isOneTime: false,
      includeTotp: false,
    },
  })

  const createShareMutation = trpc.passwords.createTemporaryShare.useMutation({
    onSuccess: (data) => {
      setShareUrl(data.shareUrl)
      toast.success(t("passwords.temporaryShare.created"))
    },
    onError: (error) => {
      showErrorFromException(error, t("passwords.temporaryShare.createFailed"))
    },
  })

  const handleCopyUrl = async () => {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success(t("passwords.temporaryShare.urlCopied"))
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSubmit = (values: TemporaryShareFormValues) => {
    createShareMutation.mutate({
      passwordId,
      expiresAt: values.expiresAt ? new Date(values.expiresAt) : undefined,
      maxAccesses: values.maxAccesses,
      isOneTime: values.isOneTime,
      includeTotp: values.includeTotp,
    })
  }

  const handleClose = () => {
    form.reset()
    setShareUrl(null)
    setCopied(false)
    onOpenChange(false)
  }

  const handleCreateAnother = () => {
    form.reset()
    setShareUrl(null)
    setCopied(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("passwords.temporaryShare.title")}</DialogTitle>
          <DialogDescription>
            {t("passwords.temporaryShare.description", { name: passwordName })}
          </DialogDescription>
        </DialogHeader>

        {shareUrl ? (
          <div className="space-y-4">
            <Alert>
              <Link2 className="h-4 w-4" />
              <AlertDescription>
                {t("passwords.temporaryShare.shareUrlCreated")}
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t("passwords.temporaryShare.shareUrl")}</label>
              <div className="flex items-center gap-2">
                <Input
                  value={shareUrl || ""}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopyUrl}
                  title={t("passwords.temporaryShare.copyUrl")}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCreateAnother}
                className="flex-1"
              >
                {t("passwords.temporaryShare.createAnother")}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  handleClose()
                  onSuccess()
                }}
                className="flex-1"
              >
                {t("common.close")}
              </Button>
            </div>

            <Link
              href="/admin/passwords/shares"
              onClick={() => {
                handleClose()
                onSuccess()
              }}
              className="flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings2 className="h-3 w-3" />
              Manage all share links
            </Link>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="isOneTime"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked)
                          if (checked) {
                            form.setValue("maxAccesses", undefined)
                          }
                        }}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>{t("passwords.temporaryShare.oneTime")}</FormLabel>
                      <FormDescription>
                        {t("passwords.temporaryShare.oneTimeDescription")}
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {t("passwords.temporaryShare.expirationDate")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        value={field.value || ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        min={new Date().toISOString().slice(0, 16)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t("passwords.temporaryShare.expirationDescription")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!form.watch("isOneTime") && (
                <FormField
                  control={form.control}
                  name="maxAccesses"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {t("passwords.temporaryShare.maxAccesses")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value ? parseInt(e.target.value, 10) : undefined
                            )
                          }
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormDescription>
                        {t("passwords.temporaryShare.maxAccessesDescription")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="includeTotp"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>{t("passwords.temporaryShare.includeTotp")}</FormLabel>
                      <FormDescription>
                        {t("passwords.temporaryShare.includeTotpDescription")}
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t("passwords.temporaryShare.securityWarning")}
                </AlertDescription>
              </Alert>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={createShareMutation.isPending}
                >
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={createShareMutation.isPending}>
                  {createShareMutation.isPending
                    ? t("passwords.temporaryShare.creating")
                    : t("passwords.temporaryShare.create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}

