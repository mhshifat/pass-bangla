"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  Copy,
  Share2,
  FolderKey,
  Clock,
  CheckSquare,
  Square,
  RotateCw,
  AlertCircle,
  Star,
  X,
  Bookmark,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { useRouter, useSearchParams } from "next/navigation"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { usePermissions } from "@/hooks/use-permissions"
import { useClipboard } from "@/hooks/use-clipboard"
import { useCurrentUser } from "@/hooks/use-current-user"
import { decryptPasswordClient } from "@/lib/client-crypto"
import { toggleFavoriteAction } from "@/app/admin/passwords/favorite-actions"
import { TagFilter } from "@/modules/passwords/client/tag-filter"
import { AdvancedSearchDialog } from "./advanced-search-dialog"
import { SearchHistory } from "./search-history"
import { SavedSearches } from "./saved-searches"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
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
  isOwner?: boolean
  isFavorite?: boolean
  tags?: Array<{
    id: string
    name: string
    color?: string | null
    icon?: string | null
  }>
}

interface PasswordsTableProps {
  passwords: Password[]
  onViewDetails: (password: Password) => void
  onEdit?: (password: Password) => void
  onDelete?: (password: Password) => void
  onShare?: (password: Password) => void
  selectedIds?: string[]
  onSelectionChange?: (selectedIds: string[]) => void
}

// Component to handle password copy functionality
function PasswordCell({ passwordId }: { passwordId: string }) {
  const { t } = useTranslation()
  const { copy: copyToClipboard, isCopying } = useClipboard()
  const { user } = useCurrentUser()
  const { refetch } = trpc.passwords.getPassword.useQuery(
    { id: passwordId },
    {
      enabled: false, // Only fetch when button is clicked
    }
  )

  const handleCopyPassword = async () => {
    try {
      const result = await refetch()
      if (result.data?.password) {
        let passwordToCopy = result.data.password
        
        // Decrypt password if it's encrypted
        if (result.data.passwordEncrypted) {
          if (!user?.id) {
            toast.error(t("clipboard.userNotAuthenticated") || "User not authenticated")
            return
          }
          
          const { decryptPasswordClient } = await import("@/lib/client-crypto")
          try {
            passwordToCopy = await decryptPasswordClient(result.data.password, user.id)
          } catch (decryptError: unknown) {
            console.error("Password decryption failed:", decryptError)
            // Check if it's an old encryption format (might not have been migrated yet)
            const errorMessage = decryptError instanceof Error ? decryptError.message : ""
            if (errorMessage.includes("Invalid encrypted password format") || 
                errorMessage.includes("encryption key may have changed")) {
              toast.error(
                t("clipboard.decryptionFailed") || 
                "Failed to decrypt password. This password may need to be migrated. Please try updating it in the web app."
              )
            } else {
              toast.error(t("clipboard.decryptionFailed") || "Failed to decrypt password")
            }
            return
          }
        }
        
        await copyToClipboard(passwordToCopy, {
          resourceId: passwordId,
          resourceType: "password",
          actionType: "copy_password",
          successMessage: t("clipboard.passwordCopied"),
        })
      }
    } catch (error) { showErrorFromException(error, t("clipboard.copyFailed")) }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-mono text-muted-foreground tracking-wider">••••••••</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopyPassword}
        disabled={isCopying}
        title={t("clipboard.copyPassword")}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// Component to handle TOTP copy functionality
function TotpCell({ passwordId }: { passwordId: string }) {
  const { t } = useTranslation()
  const { copy: copyToClipboard, isCopying } = useClipboard()
  const { user } = useCurrentUser()
  const { refetch } = trpc.passwords.generateTotp.useQuery(
    { id: passwordId },
    {
      enabled: false, // Only fetch when button is clicked
    }
  )

  const handleCopyTotp = async () => {
    try {
      const result = await refetch()
      if (result.data?.totpCode) {
        // Decrypt TOTP code if it's encrypted
        let totpCode = result.data.totpCode
        if (result.data.totpEncrypted && user?.id) {
          try {
            totpCode = await decryptPasswordClient(result.data.totpCode, user.id)
          } catch (decryptError) {
            console.error("Failed to decrypt TOTP code:", decryptError)
            toast.error(t("clipboard.decryptFailed") || "Failed to decrypt TOTP code")
            return
          }
        }
        
        await copyToClipboard(totpCode, {
          resourceId: passwordId,
          resourceType: "password",
          actionType: "copy_totp",
          successMessage: t("clipboard.totpCopied"),
        })
      }
    } catch (error) { showErrorFromException(error, t("clipboard.copyFailed")) }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <Clock className="h-4 w-4 text-green-600" />
        <span className="text-xs font-medium text-green-600">{t("mfa.enabled")}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopyTotp}
        disabled={isCopying}
        title={t("passwords.copyTotpCode")}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  )
}

export function PasswordsTable({ 
  passwords, 
  onViewDetails, 
  onEdit, 
  onDelete, 
  onShare,
  selectedIds = [],
  onSelectionChange,
}: PasswordsTableProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const utils = trpc.useUtils()
  const { hasPermission } = usePermissions()
  const { user } = useCurrentUser()
  const isMobile = useIsMobile()
  const [searchQuery, setSearchQuery] = React.useState(searchParams.get("search") || "")
  const { copy: copyToClipboard, isCopying: isCopyingClipboard } = useClipboard()
  const [copyingPasswordId, setCopyingPasswordId] = React.useState<string | null>(null)
  const [copyingTotpId, setCopyingTotpId] = React.useState<string | null>(null)
  const [togglingFavoriteId, setTogglingFavoriteId] = React.useState<string | null>(null)
  const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = React.useState(false)
  const [isSearchHistoryOpen, setIsSearchHistoryOpen] = React.useState(false)
  const [isSavedSearchesOpen, setIsSavedSearchesOpen] = React.useState(false)

  // Fetch rotation reminders to show indicators
  const { data: reminders } = trpc.passwordRotation.getReminders.useQuery(
    { daysAhead: 365 },
    { enabled: hasPermission("password.view") }
  )

  const getPasswordReminder = (passwordId: string) => {
    if (!reminders) return null
    return reminders.find((r) => r.passwordId === passwordId)
  }

  const handleSelectAll = (checked: boolean) => {
    if (onSelectionChange) {
      onSelectionChange(checked ? passwords.map((p) => p.id) : [])
    }
  }

  const handleSelectOne = (passwordId: string, checked: boolean) => {
    if (onSelectionChange) {
      if (checked) {
        onSelectionChange([...selectedIds, passwordId])
      } else {
        onSelectionChange(selectedIds.filter((id) => id !== passwordId))
      }
    }
  }

  const allSelected = passwords.length > 0 && selectedIds.length === passwords.length
  const someSelected = selectedIds.length > 0 && selectedIds.length < passwords.length

  React.useEffect(() => {
    setSearchQuery(searchParams.get("search") || "")
  }, [searchParams])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    const params = new URLSearchParams(searchParams)
    if (value) {
      params.set("search", value)
      params.set("page", "1") // Reset to first page on search
    } else {
      params.delete("search")
    }
    router.push(`?${params.toString()}`)
  }

  const handleClearSearch = () => {
    setSearchQuery("")
    const params = new URLSearchParams()
    params.set("page", "1")
    router.push(`?${params.toString()}`)
  }

  // Check if any filters are active
  const hasActiveFilters = React.useMemo(() => {
    return !!(
      searchParams.get("search") ||
      searchParams.get("tags") ||
      searchParams.get("folders") ||
      searchParams.get("filter")
    )
  }, [searchParams])

  const handleCopyPassword = async (passwordId: string) => {
    try {
      setCopyingPasswordId(passwordId)
      const result = await utils.passwords.getPassword.fetch({ id: passwordId })
      if (result?.password) {
        let passwordToCopy = result.password
        
        // Decrypt password if it's encrypted
        if (result.passwordEncrypted) {
          if (!user?.id) {
            toast.error(t("clipboard.userNotAuthenticated") || "User not authenticated")
            setCopyingPasswordId(null)
            return
          }
          
          const { decryptPasswordClient } = await import("@/lib/client-crypto")
          try {
            passwordToCopy = await decryptPasswordClient(result.password, user.id)
          } catch (decryptError: unknown) {
            console.error("Password decryption failed:", decryptError)
            // Check if it's an old encryption format (might not have been migrated yet)
            const errorMessage = decryptError instanceof Error ? decryptError.message : ""
            if (errorMessage.includes("Invalid encrypted password format") || 
                errorMessage.includes("encryption key may have changed")) {
              toast.error(
                t("clipboard.decryptionFailed") || 
                "Failed to decrypt password. This password may need to be migrated. Please try updating it in the web app."
              )
            } else {
              toast.error(t("clipboard.decryptionFailed") || "Failed to decrypt password")
            }
            setCopyingPasswordId(null)
            return
          }
        }
        
        await copyToClipboard(passwordToCopy, {
          resourceId: passwordId,
          resourceType: "password",
          actionType: "copy_password",
          successMessage: t("clipboard.passwordCopied"),
        })
      }
    } catch (error) { showErrorFromException(error, t("clipboard.copyFailed")) } finally {
      setCopyingPasswordId(null)
    }
  }

  const handleCopyTotp = async (passwordId: string) => {
    try {
      setCopyingTotpId(passwordId)
      const result = await utils.passwords.generateTotp.fetch({ id: passwordId })
      if (result?.totpCode) {
        // Decrypt TOTP code if it's encrypted
        let totpCode = result.totpCode
        if (result.totpEncrypted && user?.id) {
          try {
            totpCode = await decryptPasswordClient(result.totpCode, user.id)
          } catch (decryptError) {
            console.error("Failed to decrypt TOTP code:", decryptError)
            toast.error(t("clipboard.decryptFailed") || "Failed to decrypt TOTP code")
            return
          }
        }
        
        await copyToClipboard(totpCode, {
          resourceId: passwordId,
          resourceType: "password",
          actionType: "copy_totp",
          successMessage: t("clipboard.totpCopied"),
        })
      }
    } catch (error) { showErrorFromException(error, t("clipboard.copyFailed")) } finally {
      setCopyingTotpId(null)
    }
  }

  const handleToggleFavorite = async (passwordId: string, currentFavorite: boolean) => {
    try {
      setTogglingFavoriteId(passwordId)
      const result = await toggleFavoriteAction(passwordId)
      if (result.success) {
        toast.success(
          result.isFavorite
            ? t("passwords.favorites.added")
            : t("passwords.favorites.removed")
        )
        await utils.passwords.list.invalidate()
        await utils.passwords.getFavorites.invalidate()
        router.refresh()
      } else {
        toast.error(result.error || t("passwords.favorites.toggleError"))
      }
    } catch (error) { showErrorFromException(error, t("passwords.favorites.toggleError")) } finally {
      setTogglingFavoriteId(null)
    }
  }

  const getStrengthBadge = (strength: string) => {
    switch (strength) {
      case "strong":
        return <Badge className="bg-green-100 text-green-800 border-green-200">{t("passwords.strong")}</Badge>
      case "medium":
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">{t("passwords.medium")}</Badge>
      case "weak":
        return <Badge className="bg-red-100 text-red-800 border-red-200">{t("passwords.weak")}</Badge>
      default:
        return <Badge variant="outline">{strength}</Badge>
    }
  }

  const getExpiryBadge = (days: number) => {
    if (days < 0) {
      return <Badge className="bg-red-100 text-red-800 border-red-200">{t("passwords.expired")}</Badge>
    } else if (days < 7) {
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">{t("passwords.expiringSoon")}</Badge>
    } else if (days < 30) {
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200">{t("passwords.daysRemaining", { days })}</Badge>
    }
    return <Badge variant="outline">{t("passwords.daysRemaining", { days })}</Badge>
  }

  return (
    <Card>
      <CardHeader>
        <div className={cn("flex items-center gap-3", {
          "flex-col": isMobile,
        })}>
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-foreground" />
            <Input
              placeholder={t("passwords.searchPasswords")}
              id="tour-search"
              className="pl-10 pr-28"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  setIsAdvancedSearchOpen(true)
                }
              }}
            />
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-10 top-1/2 -translate-y-1/2 h-7 w-7 hover:bg-muted"
                onClick={handleClearSearch}
                title={t("passwords.search.clearAll")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <Popover open={isSearchHistoryOpen} onOpenChange={setIsSearchHistoryOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-10 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setIsSearchHistoryOpen(!isSearchHistoryOpen)}
                  title={t("passwords.search.recentSearches")}
                >
                  <Clock className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3" align="start">
                <SearchHistory
                  onSelect={() => setIsSearchHistoryOpen(false)}
                  limit={10}
                />
              </PopoverContent>
            </Popover>
            <Popover open={isSavedSearchesOpen} onOpenChange={setIsSavedSearchesOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setIsSavedSearchesOpen(!isSavedSearchesOpen)}
                  title={t("passwords.search.savedSearches")}
                >
                  <Bookmark className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3" align="start">
                <SavedSearches
                  onExecute={() => setIsSavedSearchesOpen(false)}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAdvancedSearchOpen(true)}
              className="gap-2 h-9"
            >
              <Search className="h-4 w-4" />
              {t("passwords.search.advanced")}
            </Button>
            <TagFilter />
          </div>
        </div>
        {/* Active Filters Display */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
            <span className="text-xs font-medium text-muted-foreground">{t("passwords.search.activeFilters")}:</span>
            {searchParams.get("search") && (
              <Badge variant="secondary" className="text-xs">
                {t("passwords.search.searchQuery")}: {searchParams.get("search")}
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams)
                    params.delete("search")
                    params.set("page", "1")
                    router.push(`?${params.toString()}`)
                  }}
                  className="ml-1.5 hover:bg-muted rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {searchParams.get("tags") && (
              <Badge variant="secondary" className="text-xs">
                {t("passwords.tags.tags")}: {searchParams.get("tags")?.split(",").length}
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams)
                    params.delete("tags")
                    params.set("page", "1")
                    router.push(`?${params.toString()}`)
                  }}
                  className="ml-1.5 hover:bg-muted rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {searchParams.get("folders") && (
              <Badge variant="secondary" className="text-xs">
                {t("passwords.folder")}: {searchParams.get("folders")?.split(",").length}
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams)
                    params.delete("folders")
                    params.set("page", "1")
                    router.push(`?${params.toString()}`)
                  }}
                  className="ml-1.5 hover:bg-muted rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {searchParams.get("filter") && (
              <Badge variant="secondary" className="text-xs">
                {t(`passwords.filter.${searchParams.get("filter")}`)}
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams)
                    params.delete("filter")
                    params.set("page", "1")
                    router.push(`?${params.toString()}`)
                  }}
                  className="ml-1.5 hover:bg-muted rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSearch}
              className="h-6 text-xs ml-auto"
            >
              <X className="h-3 w-3 mr-1" />
              {t("passwords.search.clearAll")}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="px-6">
        {isMobile ? (
              <div className="space-y-4 md:hidden">
                {passwords.map((pwd) => (
                  <Card key={pwd.id} className="p-4">
                    <div className="space-y-3">
                      {/* Header with name and actions */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          {onSelectionChange && (
                            <Checkbox
                              checked={selectedIds.includes(pwd.id)}
                              onCheckedChange={(checked) => handleSelectOne(pwd.id, checked as boolean)}
                              className="mt-1"
                            />
                          )}
                          <FolderKey className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {pwd.isFavorite && (
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 shrink-0" />
                              )}
                              <span className="font-medium text-sm">{pwd.name}</span>
                              {pwd.shared && (
                                <Badge variant="outline" className="text-xs flex items-center gap-1">
                                  <Share2 className="h-3 w-3 text-blue-600" />
                                  {Array.isArray(pwd.sharedWith) ? pwd.sharedWith.length : 0}
                                </Badge>
                              )}
                            </div>
                            {pwd.url && (
                              <a
                                href={pwd.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-700 hover:underline truncate mt-1 block dark:text-blue-400"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {pwd.url}
                              </a>
                            )}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>{t("common.actions")}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {pwd.isOwner && hasPermission("password.edit") && (
                              <DropdownMenuItem
                                onClick={() => handleToggleFavorite(pwd.id, pwd.isFavorite || false)}
                                disabled={togglingFavoriteId === pwd.id}
                              >
                                <Star
                                  className={`mr-2 h-4 w-4 ${
                                    pwd.isFavorite ? "fill-yellow-400 text-yellow-400" : ""
                                  }`}
                                />
                                {pwd.isFavorite ? t("passwords.favorites.remove") : t("passwords.favorites.add")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onViewDetails(pwd)}>
                              <Eye className="mr-2 h-4 w-4" />
                              {t("passwords.viewPassword")}
                            </DropdownMenuItem>
                            {hasPermission("password.view") && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleCopyPassword(pwd.id)}
                                  disabled={copyingPasswordId === pwd.id}
                                >
                                  <Copy className="mr-2 h-4 w-4" />
                                  {copyingPasswordId === pwd.id ? t("passwords.copying") : t("passwords.copyPassword")}
                                </DropdownMenuItem>
                                {pwd.hasTotp && (
                                  <DropdownMenuItem
                                    onClick={() => handleCopyTotp(pwd.id)}
                                    disabled={copyingTotpId === pwd.id}
                                  >
                                    <Clock className="mr-2 h-4 w-4" />
                                    {copyingTotpId === pwd.id ? t("passwords.generating") : t("passwords.copyTotpCode")}
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                            {hasPermission("password.edit") && (
                              <DropdownMenuItem onClick={() => onEdit?.(pwd)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                {t("common.edit")}
                              </DropdownMenuItem>
                            )}
                            {hasPermission("password.share") && (
                              <DropdownMenuItem onClick={() => onShare?.(pwd)}>
                                <Share2 className="mr-2 h-4 w-4" />
                                {t("passwords.sharePassword")}
                              </DropdownMenuItem>
                            )}
                            {hasPermission("password.delete") && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => onDelete?.(pwd)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {t("common.delete")}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Details */}
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{t("passwords.username")}:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs">{pwd.username}</span>
                            {hasPermission("password.view") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() =>
                                  copyToClipboard(pwd.username, {
                                    resourceId: pwd.id,
                                    resourceType: "password",
                                    actionType: "copy_username",
                                    successMessage: t("clipboard.usernameCopied"),
                                  })
                                }
                                disabled={isCopyingClipboard}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {hasPermission("password.view") && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">{t("common.password")}:</span>
                            <PasswordCell passwordId={pwd.id} />
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{t("passwords.strength")}:</span>
                          {getStrengthBadge(pwd.strength)}
                        </div>
                        {hasPermission("password.view") && pwd.hasTotp && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">TOTP:</span>
                            <TotpCell passwordId={pwd.id} />
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow className="border-b">
              {onSelectionChange && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label={t("passwords.bulk.selectAll")}
                  />
                </TableHead>
              )}
              <TableHead className="min-w-[280px] font-semibold">{t("common.name")}</TableHead>
              <TableHead className="min-w-[180px] font-semibold">{t("passwords.username")}</TableHead>
              <TableHead className="min-w-[140px] font-semibold">{t("common.password")}</TableHead>
              <TableHead className="min-w-[100px] font-semibold">{t("passwords.strength")}</TableHead>
              <TableHead className="min-w-[100px] font-semibold">TOTP</TableHead>
              <TableHead className="w-[100px] text-right font-semibold">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
            <TableBody>
              {passwords.map((pwd) => (
                <TableRow
                  key={pwd.id}
                  className={`group hover:bg-muted/50 transition-colors ${
                    selectedIds.includes(pwd.id) ? "bg-muted/50" : ""
                  }`}
                >
                {onSelectionChange && (
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(pwd.id)}
                      onCheckedChange={(checked) => handleSelectOne(pwd.id, checked as boolean)}
                      aria-label={t("passwords.bulk.selectPassword", { name: pwd.name })}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-start gap-3">
                    <FolderKey className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {pwd.isFavorite && (
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 shrink-0" />
                        )}
                        <span className="font-medium text-sm">{pwd.name}</span>
                        {pwd.shared && (
                          <Badge variant="outline" className="text-xs flex items-center gap-1">
                            <Share2 className="h-3 w-3 text-blue-600" />
                            {Array.isArray(pwd.sharedWith) ? pwd.sharedWith.length : 0}
                          </Badge>
                        )}
                        {(() => {
                          const reminder = getPasswordReminder(pwd.id)
                          if (reminder) {
                            if (reminder.daysUntilRotation <= 0) {
                              return (
                                <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 text-xs flex items-center gap-1">
                                  <RotateCw className="h-3 w-3" />
                                  {t("passwords.rotation.rotationDue")}
                                </Badge>
                              )
                            } else if (reminder.daysUntilRotation <= 30) {
                              return (
                                <Badge variant="outline" className="text-yellow-600 text-xs flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  {reminder.daysUntilRotation}d
                                </Badge>
                              )
                            }
                          }
                          if (pwd.expiresIn !== null && pwd.expiresIn <= 30) {
                            return getExpiryBadge(pwd.expiresIn)
                          }
                          return null
                        })()}
                      </div>
                      {pwd.url && (
                        <a
                          href={pwd.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-700 hover:underline truncate mt-1 max-w-full inline-block dark:text-blue-400"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {pwd.url}
                        </a>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-muted-foreground flex-1 min-w-0 truncate">
                      {pwd.username}
                    </span>
                    {hasPermission("password.view") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() =>
                          copyToClipboard(pwd.username, {
                            resourceId: pwd.id,
                            resourceType: "password",
                            actionType: "copy_username",
                            successMessage: t("clipboard.usernameCopied"),
                          })
                        }
                        disabled={isCopyingClipboard}
                        title={t("clipboard.copyUsername")}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {hasPermission("password.view") ? (
                    <PasswordCell passwordId={pwd.id} />
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {getStrengthBadge(pwd.strength)}
                </TableCell>
                <TableCell>
                  {hasPermission("password.view") ? (
                    pwd.hasTotp ? (
                      <TotpCell passwordId={pwd.id} />
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>{t("common.actions")}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {pwd.isOwner && hasPermission("password.edit") && (
                        <DropdownMenuItem
                          onClick={() => handleToggleFavorite(pwd.id, pwd.isFavorite || false)}
                          disabled={togglingFavoriteId === pwd.id}
                        >
                          <Star
                            className={`mr-2 h-4 w-4 ${
                              pwd.isFavorite ? "fill-yellow-400 text-yellow-400" : ""
                            }`}
                          />
                          {pwd.isFavorite ? t("passwords.favorites.remove") : t("passwords.favorites.add")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onViewDetails(pwd)}>
                        <Eye className="mr-2 h-4 w-4" />
                        {t("passwords.viewPassword")}
                      </DropdownMenuItem>
                      {hasPermission("password.view") && (
                        <>
                          <DropdownMenuItem
                            onClick={() => handleCopyPassword(pwd.id)}
                            disabled={copyingPasswordId === pwd.id}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            {copyingPasswordId === pwd.id ? t("passwords.copying") : t("passwords.copyPassword")}
                          </DropdownMenuItem>
                          {pwd.hasTotp && (
                            <DropdownMenuItem
                              onClick={() => handleCopyTotp(pwd.id)}
                              disabled={copyingTotpId === pwd.id}
                            >
                              <Clock className="mr-2 h-4 w-4" />
                              {copyingTotpId === pwd.id ? t("passwords.generating") : t("passwords.copyTotpCode")}
                            </DropdownMenuItem>
                          )}
                        </>
                      )}
                      {hasPermission("password.edit") && (
                        <DropdownMenuItem onClick={() => onEdit?.(pwd)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          {t("common.edit")}
                        </DropdownMenuItem>
                      )}
                      {hasPermission("password.share") && (
                        <DropdownMenuItem onClick={() => onShare?.(pwd)}>
                          <Share2 className="mr-2 h-4 w-4" />
                          {t("passwords.sharePassword")}
                        </DropdownMenuItem>
                      )}
                      {hasPermission("password.delete") && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => onDelete?.(pwd)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("common.delete")}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </CardContent>

      <AdvancedSearchDialog
        open={isAdvancedSearchOpen}
        onOpenChange={setIsAdvancedSearchOpen}
        onSearch={(params) => {
          // Search is handled by the dialog via router.push
        }}
      />
    </Card>
  )
}
