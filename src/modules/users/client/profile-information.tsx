"use client"

import * as React from "react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
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
import { AlertCircle, Camera, CheckCircle2, Loader2, MailIcon } from "lucide-react"
import { ChangePasswordForm } from "./change-password-form"
import { showErrorFromException } from "@/lib/error-toast"

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  bio: z.string().max(500, "Bio must be less than 500 characters").optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
})

type ProfileFormValues = z.infer<typeof profileSchema>

interface ProfileInformationProps {
  user: {
    id: string
    name: string
    email: string
    emailVerified?: Date | null
    image?: string | null
    phoneNumber?: string | null
    bio?: string | null
    role: string
    mfaEnabled: boolean
    mfaMethod?: string | null
    createdAt: Date
    lastLoginAt?: Date | null
    company?: {
      id: string
      name: string
    } | null
  }
  onUpdate?: () => void
}

export function ProfileInformation({ user, onUpdate }: ProfileInformationProps) {
  const { t } = useTranslation()
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name,
      bio: user.bio || "",
      phoneNumber: user.phoneNumber || "",
    },
  })

  const updateProfileMutation = trpc.users.updateProfile.useMutation({
    onSuccess: () => {
      toast.success(t("profile.updated"))
      onUpdate?.()
    },
    onError: (error) => {
      showErrorFromException(error, t("profile.updateError"))
    },
  })

  const updateAvatarMutation = trpc.users.updateAvatar.useMutation({
    onSuccess: () => {
      toast.success(t("profile.avatarUpdated"))
      onUpdate?.()
      setIsUploading(false)
    },
    onError: (error) => {
      showErrorFromException(error, t("profile.avatarUpdateError"))
      setIsUploading(false)
    },
  })

  const resendVerificationMutation = trpc.auth.resendVerificationEmail.useMutation({
    onSuccess: () => {
      toast.success(t("auth.emailVerification.emailSent"))
      onUpdate?.()
    },
    onError: (error) => {
      showErrorFromException(error, t("auth.emailVerification.resendError"))
    },
  })

  const handleSubmit = (values: ProfileFormValues) => {
    updateProfileMutation.mutate({
      name: values.name,
      bio: values.bio || null,
      phoneNumber: values.phoneNumber || null,
    })
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error(t("profile.invalidImageType"))
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("profile.imageTooLarge"))
      return
    }

    setIsUploading(true)

    try {
      // Convert to base64 for now (in production, upload to cloud storage)
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64String = reader.result as string
        updateAvatarMutation.mutate({ imageUrl: base64String })
      }
      reader.onerror = () => {
        toast.error(t("profile.avatarUploadError"))
        setIsUploading(false)
      }
      reader.readAsDataURL(file)
    } catch (error) {
      toast.error(t("profile.avatarUploadError"))
      setIsUploading(false)
    }
  }

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("profile.profileInformation")}</CardTitle>
          <CardDescription>{t("profile.accountDetails")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar Section */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={user.image || undefined} alt={user.name} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <Button
                size="icon"
                variant="outline"
                className="absolute bottom-0 right-0 h-8 w-8 rounded-full"
                onClick={handleAvatarClick}
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-semibold">{user.name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <p className="text-muted-foreground">{user.email}</p>
                {user.emailVerified ? (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {t("auth.emailVerification.verified")}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {t("auth.emailVerification.unverified")}
                  </Badge>
                )}
                {!user?.emailVerified && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => resendVerificationMutation.mutate()}
                    disabled={resendVerificationMutation.isPending}
                    className="gap-2"
                  >
                    {resendVerificationMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <MailIcon className="h-3 w-3" />
                    )}
                    {t("auth.emailVerification.resend")}
                  </Button>
                )}
              </div>
              <div className="mt-2">
                <Badge variant="secondary">{user.role}</Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Profile Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.name")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("profile.bio")}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value || ""}
                        placeholder={t("profile.bioPlaceholder")}
                        rows={4}
                        maxLength={500}
                      />
                    </FormControl>
                    <FormDescription>
                      {t("profile.bioDescription")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("profile.phoneNumber")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ""}
                        placeholder={t("profile.phoneNumberPlaceholder")}
                        type="tel"
                      />
                    </FormControl>
                    <FormDescription>
                      {t("profile.phoneNumberDescription")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    {t("common.email")}
                  </label>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{user.email}</p>
                    {user.emailVerified ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {t("auth.emailVerification.verified")}
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {t("auth.emailVerification.unverified")}
                        </Badge>
                      </div>
                    )}
                  </div>
                  {!user.emailVerified && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("auth.emailVerification.verificationRequired")}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    {t("common.role")}
                  </label>
                  <p className="text-sm font-medium">
                    <Badge variant="secondary">{user.role}</Badge>
                  </p>
                </div>
                {user.company && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {t("profile.company")}
                    </label>
                    <p className="text-sm font-medium">{user.company.name}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    {t("profile.mfaStatus")}
                  </label>
                  <p className="text-sm font-medium">
                    <Badge variant={user.mfaEnabled ? "default" : "secondary"}>
                      {user.mfaEnabled ? t("mfa.enabled") : t("mfa.disabled")}
                    </Badge>
                    {user.mfaEnabled && user.mfaMethod && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({user.mfaMethod})
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    {t("profile.memberSince")}
                  </label>
                  <p className="text-sm font-medium">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {user.lastLoginAt && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {t("profile.lastLogin")}
                    </label>
                    <p className="text-sm font-medium">
                      {new Date(user.lastLoginAt).toLocaleDateString()}
                    </p>
                  </div>
                )}
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

      <Separator />

      <ChangePasswordForm />
    </div>
  )
}
