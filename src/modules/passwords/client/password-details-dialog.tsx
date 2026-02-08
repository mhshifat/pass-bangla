"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Eye, EyeOff, Copy, Clock, X, Users, History, Shield, AlertTriangle, CheckCircle2, RotateCw, Star, Tag as TagIcon } from "lucide-react"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { usePermissions } from "@/hooks/use-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { TagAutocomplete } from "@/modules/passwords/client"
import { useTransition } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { assignPolicyToPasswordAction } from "@/app/admin/passwords/rotation-actions"
import { toggleFavoriteAction } from "@/app/admin/passwords/favorite-actions"
import { removePasswordShareAction } from "@/app/admin/passwords/unshare-actions"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useClipboard } from "@/hooks/use-clipboard"
import { usePasswordDecryption } from "@/hooks/use-password-decryption"
import { showErrorFromException } from "@/lib/error-toast"

interface PasswordShare {
  shareId: string
  teamId: string | null
  teamName: string
  expiresAt: Date | null
}

interface Password {
  id: string
  name: string
  username: string
  url?: string | null
  folder: string | null
  strength: "strong" | "medium" | "weak"
  shared: boolean
  sharedWith: PasswordShare[] | string[] // Can be array of strings (legacy) or PasswordShare objects
  lastModified: string
  expiresIn: number | null
  hasTotp: boolean
  password?: string // Decrypted password (optional, fetched separately)
  isOwner?: boolean // Indicates if the current user owns this password
}

interface PasswordDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  password: Password | null
  onEdit?: (password: Password) => void
}

export function PasswordDetailsDialog({
  open,
  onOpenChange,
  password,
  onEdit,
}: PasswordDetailsDialogProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { hasPermission } = usePermissions()
  const { copy: copyToClipboard, isCopying } = useClipboard()
  const [showPassword, setShowPassword] = React.useState(false)
  const [totpCode, setTotpCode] = React.useState("123456")
  const [totpTimeLeft, setTotpTimeLeft] = React.useState(30)
  const [isRemoveShareDialogOpen, setIsRemoveShareDialogOpen] = React.useState(false)
  const [shareToRemove, setShareToRemove] = React.useState<{ shareId: string; teamName: string } | null>(null)
  const [isRemoving, setIsRemoving] = React.useState(false)
  const [isCheckingBreach, setIsCheckingBreach] = React.useState(false)
  const [breachStatus, setBreachStatus] = React.useState<{ isBreached: boolean; breachCount: number } | null>(null)
  const [isUpdatingPolicy, setIsUpdatingPolicy] = React.useState(false)
  const [isTogglingFavorite, setIsTogglingFavorite] = React.useState(false)
  const [isEditingTags, setIsEditingTags] = React.useState(false)
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([])

  // Fetch password details with decrypted password
  const { data: passwordData, isLoading, refetch: refetchPasswordData } = trpc.passwords.getById.useQuery(
    { id: password?.id || "" },
    {
      enabled: open && !!password?.id,
    }
  )

  const utils = trpc.useUtils()

  // Update selectedTagIds when passwordData changes
  React.useEffect(() => {
    if (passwordData?.tags) {
      setSelectedTagIds(passwordData.tags.map((t) => t.id))
    }
  }, [passwordData?.tags])

  // Update tags mutation
  const updateTagsMutation = trpc.passwords.update.useMutation({
    onSuccess: async () => {
      await refetchPasswordData()
      await utils.passwords.list.invalidate()
      toast.success(t("passwords.tags.tagUpdated"))
      setIsEditingTags(false)
    },
    onError: (error) => {
      showErrorFromException(error, t("passwords.tags.tagError"))
    },
  })

  // Client-side decryption: Decrypt password if it's encrypted
  const encryptedPassword = passwordData?.passwordEncrypted 
    ? passwordData.password 
    : null
  const encryptedTotpSecret = passwordData?.totpEncrypted && passwordData.totpSecret
    ? passwordData.totpSecret
    : null

  const {
    decryptedPassword,
    decryptedTotpSecret,
    isDecrypting: isDecryptingPassword,
    error: decryptionError,
  } = usePasswordDecryption(encryptedPassword, encryptedTotpSecret)

  // For backward compatibility: if password is not encrypted, use it directly
  const finalDecryptedPassword = passwordData?.passwordEncrypted 
    ? decryptedPassword 
    : (passwordData?.password || "")

  // Determine if user is owner - check both passwordData and displayPassword
  // passwordData comes from getById query which includes isOwner
  // displayPassword might come from list query which also includes isOwner
  const isOwner = passwordData?.isOwner ?? password?.isOwner ?? false

  // Check for existing breach status
  const { data: breachData } = trpc.passwords.getBreachHistory.useQuery(
    { passwordId: password?.id, includeResolved: false },
    { enabled: open && !!password?.id }
  )

  // Fetch rotation policies and rotation info
  const { data: policies } = trpc.passwordRotation.listPolicies.useQuery(
    undefined,
    { enabled: open && isOwner && hasPermission("password.edit") }
  )

  // Get rotation reminder info for this password
  const { data: reminders } = trpc.passwordRotation.getReminders.useQuery(
    { daysAhead: 365 },
    { enabled: open && !!password?.id }
  )

  const passwordReminder = React.useMemo(() => {
    if (!reminders || !password?.id) return null
    return reminders.find((r) => r.passwordId === password.id)
  }, [reminders, password?.id])

  const handlePolicyChange = async (policyId: string | null) => {
    if (!password?.id) return

    setIsUpdatingPolicy(true)
    try {
      const result = await assignPolicyToPasswordAction(password.id, policyId)
      if (result.success) {
        toast.success(t("passwords.rotation.policyAssigned"))
        await refetchPasswordData()
        await utils.passwordRotation.getReminders.invalidate()
        router.refresh()
      } else {
        showErrorFromException(result.error, t("passwords.rotation.policyAssignError"))
      }
    } catch (error) { showErrorFromException(error, t("passwords.rotation.policyAssignError")) } finally {
      setIsUpdatingPolicy(false)
    }
  }

  const handleToggleFavorite = async () => {
    if (!password?.id || !isOwner) return

    setIsTogglingFavorite(true)
    try {
      const result = await toggleFavoriteAction(password.id)
      if (result.success) {
        toast.success(
          result.isFavorite
            ? t("passwords.favorites.added")
            : t("passwords.favorites.removed")
        )
        await refetchPasswordData()
        await utils.passwords.list.invalidate()
        await utils.passwords.getFavorites.invalidate()
        router.refresh()
      } else {
        showErrorFromException(result.error, t("passwords.favorites.toggleError"))
      }
    } catch (error) { showErrorFromException(error, t("passwords.favorites.toggleError")) } finally {
      setIsTogglingFavorite(false)
    }
  }

  React.useEffect(() => {
    if (breachData?.breaches && breachData.breaches.length > 0) {
      const latestBreach = breachData.breaches[0]
      setBreachStatus({
        isBreached: latestBreach.isBreached,
        breachCount: latestBreach.breachCount,
      })
    } else {
      setBreachStatus(null)
    }
  }, [breachData])

  const checkBreachMutation = trpc.passwords.checkPasswordBreach.useMutation({
    onSuccess: (result) => {
      setBreachStatus({
        isBreached: result.isBreached,
        breachCount: result.breachCount,
      })
      if (result.isBreached) {
        toast.error(t("passwords.breach.detected", { count: result.breachCount }))
      } else {
        toast.success(t("passwords.breach.safe"))
      }
      setIsCheckingBreach(false)
      router.refresh()
    },
    onError: (error) => {
      showErrorFromException(error, t("passwords.breach.checkError"))
      setIsCheckingBreach(false)
    },
  })

  const handleCheckBreach = () => {
    if (!password?.id) return
    setIsCheckingBreach(true)
    checkBreachMutation.mutate({ passwordId: password.id })
  }

  // Reset showPassword when dialog closes or password changes
  React.useEffect(() => {
    if (!open || !password?.id) {
      setShowPassword(false)
    }
  }, [open, password?.id])

  // Simulate TOTP code generation and countdown
  React.useEffect(() => {
    if (!password?.hasTotp) return

    const interval = setInterval(() => {
      setTotpTimeLeft((prev) => {
        if (prev <= 1) {
          // Generate new TOTP code
          setTotpCode(Math.floor(100000 + Math.random() * 900000).toString())
          return 30
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [password?.hasTotp])

  const getStrengthBadge = (strength: string) => {
    switch (strength) {
      case "strong":
        return <Badge className="bg-green-100 text-green-800 border-green-200">Strong</Badge>
      case "medium":
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Medium</Badge>
      case "weak":
        return <Badge className="bg-red-100 text-red-800 border-red-200">Weak</Badge>
      default:
        return <Badge variant="outline">{strength}</Badge>
    }
  }

  const handleRemoveShare = async () => {
    if (!shareToRemove) return

    try {
      setIsRemoving(true)
      const result = await removePasswordShareAction(shareToRemove.shareId)
      if (result.success) {
        toast.success(`Password unshared from ${shareToRemove.teamName}`)
        setIsRemoveShareDialogOpen(false)
        setShareToRemove(null)
        
        // Refetch password data to update the shares list
        await refetchPasswordData()
        
        // Invalidate passwords list query to update the table
        await utils.passwords.list.invalidate()
        
        router.refresh()
      } else if (result.error) {
        showErrorFromException(result.error, "Failed to remove password share")
      }
    } catch (error) { showErrorFromException(error, "Failed to remove password share") } finally {
      setIsRemoving(false)
    }
  }

  const getExpiryBadge = (days: number | null) => {
    if (days === null) {
      return <Badge variant="outline">Never</Badge>
    }
    if (days < 0) {
      return <Badge className="bg-red-100 text-red-800 border-red-200">Expired</Badge>
    } else if (days < 7) {
      return (
        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Expiring Soon</Badge>
      )
    } else if (days < 30) {
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200">{days} days</Badge>
    }
    return <Badge variant="outline">{days} days</Badge>
  }

  if (!password) return null

  // Use fetched password data if available, otherwise use passed password
  const displayPassword = passwordData || password

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[95vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                {passwordData?.isFavorite && (
                  <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                )}
                Password Details
              </DialogTitle>
              <DialogDescription>View and manage password information</DialogDescription>
            </div>
            {isOwner && hasPermission("password.edit") && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleToggleFavorite}
                disabled={isTogglingFavorite}
                className="h-9 w-9"
                title={passwordData?.isFavorite ? t("passwords.favorites.remove") : t("passwords.favorites.add")}
              >
                <Star
                  className={`h-5 w-5 ${
                    passwordData?.isFavorite
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-muted-foreground"
                  }`}
                />
              </Button>
            )}
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            <div className="grid gap-4">
            <div className="grid grid-cols-3 items-center gap-4">
              <span className="text-sm font-medium">Name:</span>
              <span className="col-span-2 text-sm">{displayPassword.name}</span>
            </div>

            <div className="grid grid-cols-3 items-center gap-4">
              <span className="text-sm font-medium">Username:</span>
              <div className="col-span-2 flex items-center gap-2">
                <span className="flex-1 text-sm font-mono">{displayPassword.username}</span>
                {hasPermission("password.view") && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      copyToClipboard(displayPassword.username, {
                        resourceId: password?.id || "",
                        resourceType: "password",
                        actionType: "copy_username",
                        successMessage: t("clipboard.usernameCopied"),
                      })
                    }
                    disabled={isCopying}
                    title={t("clipboard.copyUsername")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 items-center gap-4">
              <span className="text-sm font-medium">Password:</span>
              <div className="col-span-2 flex items-center gap-2">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={
                    isLoading || isDecryptingPassword
                      ? "Loading..."
                      : showPassword
                      ? finalDecryptedPassword
                      : "••••••••••••"
                  }
                  readOnly
                  className="font-mono"
                />
                {hasPermission("password.view") && (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading || isDecryptingPassword}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        if (finalDecryptedPassword) {
                          copyToClipboard(finalDecryptedPassword, {
                            resourceId: password?.id || "",
                            resourceType: "password",
                            actionType: "copy_password",
                            successMessage: t("clipboard.passwordCopied"),
                          })
                        }
                      }}
                      disabled={isLoading || isDecryptingPassword || !finalDecryptedPassword || isCopying}
                      title={t("clipboard.copyPassword")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {displayPassword.url && (
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-sm font-medium">URL:</span>
                <div className="col-span-2 flex items-center gap-2">
                  <a
                    href={displayPassword.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-sm text-blue-600 hover:underline truncate"
                  >
                    {displayPassword.url}
                  </a>
                  {hasPermission("password.view") && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        copyToClipboard(displayPassword.url || "", {
                          resourceId: password?.id || "",
                          resourceType: "password",
                          actionType: "copy_url",
                          successMessage: t("clipboard.urlCopied"),
                        })
                      }
                      disabled={isCopying}
                      title={t("clipboard.copyUrl")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 items-center gap-4">
              <span className="text-sm font-medium">Folder:</span>
              {displayPassword.folder ? (
                <Badge variant="outline" className="w-fit">
                  {displayPassword.folder}
                </Badge>
              ) : (
                <span className="col-span-2 text-sm text-muted-foreground">-</span>
              )}
            </div>

            <div className="grid grid-cols-3 items-start gap-4">
              <span className="text-sm font-medium flex items-center gap-2">
                <TagIcon className="h-4 w-4" />
                {t("passwords.tags.tags")}:
              </span>
              <div className="col-span-2">
                {isEditingTags && isOwner && hasPermission("password.edit") ? (
                  <div className="space-y-2">
                    <TagAutocomplete
                      selectedTagIds={selectedTagIds}
                      onTagsChange={setSelectedTagIds}
                      passwordId={password?.id}
                      disabled={updateTagsMutation.isPending}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setIsEditingTags(false)
                          // Reset to original tags
                          if (passwordData?.tags) {
                            setSelectedTagIds(passwordData.tags.map((t) => t.id))
                          }
                        }}
                        disabled={updateTagsMutation.isPending}
                      >
                        {t("common.cancel")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={async () => {
                          if (!password?.id || !passwordData) return
                          
                          await updateTagsMutation.mutateAsync({
                            id: password.id,
                            name: passwordData.name,
                            username: passwordData.username,
                            password: finalDecryptedPassword, // Use decrypted password for update
                            url: passwordData.url || null,
                            folderId: passwordData.folderId || null,
                            notes: passwordData.notes || null,
                            totpSecret: decryptedTotpSecret || null, // Use decrypted TOTP secret
                            tagIds: selectedTagIds,
                          })
                        }}
                        disabled={updateTagsMutation.isPending}
                      >
                        {updateTagsMutation.isPending ? t("common.loading") : t("common.save")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    {passwordData?.tags && passwordData.tags.length > 0 ? (
                      <>
                        {passwordData.tags.map((tag) => (
                          <Badge
                            key={tag.id}
                            variant="secondary"
                            className="flex items-center gap-1.5"
                          >
                            {tag.color && (
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: tag.color }}
                              />
                            )}
                            {tag.icon && <span className="text-xs">{tag.icon}</span>}
                            <span>{tag.name}</span>
                          </Badge>
                        ))}
                        {isOwner && hasPermission("password.edit") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsEditingTags(true)}
                            className="h-7 text-xs"
                          >
                            {t("common.edit")}
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-sm text-muted-foreground">-</span>
                        {isOwner && hasPermission("password.edit") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsEditingTags(true)}
                            className="h-7 text-xs"
                          >
                            <TagIcon className="mr-1 h-3 w-3" />
                            {t("passwords.tags.addTags")}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 items-center gap-4">
              <span className="text-sm font-medium">Strength:</span>
              <div className="col-span-2">{getStrengthBadge(displayPassword.strength)}</div>
            </div>


            {displayPassword.shared && (
              <div className="grid grid-cols-3 items-start gap-4">
                <span className="text-sm font-medium">Shared with:</span>
                <div className="col-span-2 flex flex-wrap gap-2">
                  {Array.isArray(displayPassword.sharedWith) && displayPassword.sharedWith.length > 0 && (
                    <>
                      {typeof displayPassword.sharedWith[0] === "string" ? (
                        // Legacy format: array of strings
                        displayPassword.sharedWith.map((team, idx) => (
                          <Badge key={idx} variant="secondary">
                            {team}
                          </Badge>
                        ))
                      ) : (
                        // New format: array of PasswordShare objects
                        (displayPassword.sharedWith as PasswordShare[]).map((share) => (
                          <Badge
                            key={share.shareId}
                            variant="secondary"
                            className="flex items-center gap-1.5 pr-0"
                          >
                            <Users className="h-3 w-3" />
                            <span>{share.teamName}</span>
                            {isOwner && hasPermission("password.share") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 p-0.5 ml-1 -mr-1 hover:bg-destructive/20 hover:text-destructive rounded-full"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  e.preventDefault()
                                  setShareToRemove({ shareId: share.shareId, teamName: share.teamName })
                                  setIsRemoveShareDialogOpen(true)
                                }}
                                title="Remove share"
                              >
                                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                              </Button>
                            )}
                          </Badge>
                        ))
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 items-center gap-4">
              <span className="text-sm font-medium">Last Modified:</span>
              <span className="col-span-2 text-sm">{displayPassword.lastModified}</span>
            </div>

            <div className="grid grid-cols-3 items-center gap-4">
              <span className="text-sm font-medium">Expires:</span>
              <div className="col-span-2">{getExpiryBadge(displayPassword.expiresIn)}</div>
            </div>

            {breachStatus && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Shield className={`h-4 w-4 ${breachStatus.isBreached ? "text-red-600" : "text-green-600"}`} />
                    <span className="text-sm font-medium">{t("passwords.breach.status")}</span>
                  </div>
                  {breachStatus.isBreached ? (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        {t("passwords.breach.detected", { count: breachStatus.breachCount })}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert>
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>
                        {t("passwords.breach.safe")}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </>
            )}

            {isOwner && hasPermission("password.edit") && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <RotateCw className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">{t("passwords.rotation.title")}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground w-24">{t("passwords.rotation.policy")}:</span>
                      <Select
                        value={passwordData?.rotationPolicyId || "none"}
                        onValueChange={(value) => handlePolicyChange(value === "none" ? null : value)}
                        disabled={isUpdatingPolicy}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder={t("passwords.rotation.noPolicy")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("passwords.rotation.noPolicy")}</SelectItem>
                          {policies?.map((policy) => (
                            <SelectItem key={policy.id} value={policy.id}>
                              {policy.name} ({policy.rotationDays} {t("passwords.rotation.days")})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {passwordReminder && typeof passwordReminder.daysUntilRotation === "number" && (
                      <Alert className={passwordReminder.daysUntilRotation <= 0 ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20" : ""}>
                        <Clock className="h-4 w-4" />
                        <AlertDescription>
                          {passwordReminder.daysUntilRotation <= 0 ? (
                            <div className="space-y-1">
                              <div className="font-medium">{t("passwords.rotation.rotationDue")}</div>
                              <div className="text-sm">{t("passwords.rotation.rotationDueDescription")}</div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-2"
                                onClick={() => router.push(`/admin/passwords/rotation?rotate=${password?.id}`)}
                              >
                                <RotateCw className="h-3 w-3 mr-1" />
                                {t("passwords.rotation.rotateNow")}
                              </Button>
                            </div>
                          ) : (
                            <div>
                              {t("passwords.rotation.nextRotationIn", { days: passwordReminder.daysUntilRotation })}
                              {passwordData?.rotationPolicy?.autoRotate && (
                                <div className="text-xs mt-1 text-muted-foreground">
                                  {t("passwords.rotation.autoRotateEnabled")}
                                </div>
                              )}
                            </div>
                          )}
                        </AlertDescription>
                      </Alert>
                    )}
                    {passwordData?.rotationPolicy && !passwordReminder && (
                      <Alert>
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertDescription>
                          {t("passwords.rotation.policyActive", { name: passwordData.rotationPolicy.name })}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </div>
              </>
            )}

            {displayPassword.hasTotp && hasPermission("password.view") && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">TOTP Authentication</span>
                  </div>

                  <div className="p-4 rounded-lg border bg-muted/50">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-3xl font-mono font-bold tracking-wider">{totpCode}</div>
                        <p className="text-xs text-muted-foreground mt-1">One-Time Password</p>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => navigator.clipboard.writeText(totpCode)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Time remaining</span>
                        <span className="font-medium">{totpTimeLeft}s</span>
                      </div>
                      <Progress value={(totpTimeLeft / 30) * 100} className="h-1" />
                    </div>
                  </div>

                </div>
              </>
            )}
          </div>
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap gap-2">
            {hasPermission("password.view") && isOwner && (
              <>
                <Button
                  variant="outline"
                  onClick={() => router.push(`/admin/passwords/${password.id}/history`)}
                  className="shrink-0"
                >
                  <History className="h-4 w-4 mr-2" />
                  View History
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCheckBreach}
                  disabled={isCheckingBreach}
                  className="flex-shrink-0"
                >
                  <Shield className="h-4 w-4 mr-2" />
                  {isCheckingBreach ? t("passwords.breach.checking") : t("passwords.breach.check")}
                </Button>
              </>
            )}
            {breachStatus?.isBreached && (
              <Button
                variant="outline"
                onClick={() => router.push("/admin/passwords/breaches")}
                className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 shrink-0"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                {t("passwords.breach.viewBreaches")}
              </Button>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {hasPermission("password.edit") && isOwner && onEdit && (
              <Button onClick={() => onEdit(passwordData || password)}>Edit Password</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      <AlertDialog open={isRemoveShareDialogOpen} onOpenChange={setIsRemoveShareDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Share?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this password from &quot;{shareToRemove?.teamName}&quot;? 
              Team members will no longer have access to this password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveShare}
              disabled={isRemoving}
              className="bg-red-600 hover:bg-red-700"
            >
              {isRemoving ? "Removing..." : "Remove Share"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
