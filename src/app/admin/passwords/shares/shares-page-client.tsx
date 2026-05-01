"use client"

import * as React from "react"
import { useEffect, useState, useTransition } from "react"
import { useTranslation } from "react-i18next"
import {
  Share2,
  Link2,
  Users,
  Copy,
  Check,
  Eye,
  Pencil,
  Trash2,
  ShieldX,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Globe,
  Monitor,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { showErrorFromException } from "@/lib/error-toast"
import {
  removeTeamShareAction,
  revokeTemporaryShareAction,
  updateTeamShareAction,
  updateTemporaryShareAction,
} from "./actions"

type TemporaryShare = {
  id: string
  shareToken: string
  passwordId: string
  passwordName: string
  passwordUsername: string | null
  expiresAt: Date | string | null
  maxAccesses: number | null
  accessCount: number
  isOneTime: boolean
  includeTotp: boolean
  revokedAt: Date | string | null
  createdAt: Date | string
  accessedAt: Date | string | null
  status: "active" | "revoked" | "expired" | "exhausted"
  shareUrl: string
}

type TeamShare = {
  id: string
  passwordId: string
  passwordName: string
  passwordUsername: string | null
  teamId: string | null
  teamName: string | null
  teamMemberCount: number
  permission: string
  expiresAt: Date | string | null
  createdAt: Date | string
  status: "active" | "expired"
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

function formatDate(value: Date | string | null | undefined): string {
  const d = toDate(value)
  return d ? d.toLocaleString() : "—"
}

function formatRelative(value: Date | string | null | undefined): string {
  const d = toDate(value)
  if (!d) return "—"
  const diffMs = d.getTime() - Date.now()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return "today"
  if (diffDays > 0) return `in ${diffDays}d`
  return `${Math.abs(diffDays)}d ago`
}

function StatusBadge({
  status,
}: {
  status: TemporaryShare["status"] | TeamShare["status"]
}) {
  switch (status) {
    case "active":
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Active
        </Badge>
      )
    case "revoked":
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-400">
          <ShieldX className="h-3 w-3 mr-1" /> Revoked
        </Badge>
      )
    case "expired":
      return (
        <Badge className="bg-gray-200 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-300">
          <Clock className="h-3 w-3 mr-1" /> Expired
        </Badge>
      )
    case "exhausted":
      return (
        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400">
          <XCircle className="h-3 w-3 mr-1" /> Exhausted
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success("Share URL copied to clipboard")
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Failed to copy URL")
    }
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      title="Copy share URL"
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  )
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string
  value: number | string
  description?: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

const PAGE_SIZE = 20

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(handle)
  }, [value, delayMs])
  return debounced
}

export function SharesPageClient() {
  const { t } = useTranslation()
  const utils = trpc.useUtils()

  const [tempStatus, setTempStatus] = useState<
    "all" | "active" | "revoked" | "expired" | "exhausted"
  >("all")
  const [tempSearchInput, setTempSearchInput] = useState("")
  const tempSearch = useDebouncedValue(tempSearchInput, 250)
  const [tempPage, setTempPage] = useState(1)

  const [teamSearchInput, setTeamSearchInput] = useState("")
  const teamSearch = useDebouncedValue(teamSearchInput, 250)
  const [teamStatus, setTeamStatus] = useState<"all" | "active" | "expired">("all")
  const [teamPage, setTeamPage] = useState(1)

  // Reset pagination when filters change
  useEffect(() => {
    setTempPage(1)
  }, [tempStatus, tempSearch])
  useEffect(() => {
    setTeamPage(1)
  }, [teamStatus, teamSearch])

  const { data: stats, isLoading: statsLoading } =
    trpc.passwords.getShareStats.useQuery()
  const {
    data: tempShareData,
    isLoading: tempLoading,
  } = trpc.passwords.listTemporaryShares.useQuery({
    status: tempStatus,
    search: tempSearch || undefined,
    page: tempPage,
    pageSize: PAGE_SIZE,
  })
  const {
    data: teamShareData,
    isLoading: teamLoading,
  } = trpc.passwords.listMyTeamPasswordShares.useQuery({
    status: teamStatus,
    search: teamSearch || undefined,
    page: teamPage,
    pageSize: PAGE_SIZE,
  })

  const temporaryShares = (tempShareData?.shares ?? []) as TemporaryShare[]
  const tempPagination = tempShareData?.pagination
  const teamShares = (teamShareData?.shares ?? []) as TeamShare[]
  const teamPagination = teamShareData?.pagination

  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [removingTeamShareId, setRemovingTeamShareId] = useState<string | null>(
    null,
  )
  const [editingTempShare, setEditingTempShare] = useState<TemporaryShare | null>(
    null,
  )
  const [editingTeamShare, setEditingTeamShare] = useState<TeamShare | null>(null)
  const [viewingDetails, setViewingDetails] = useState<TemporaryShare | null>(null)

  const [pending, startTransition] = useTransition()

  const refresh = async () => {
    await Promise.all([
      utils.passwords.listTemporaryShares.invalidate(),
      utils.passwords.listMyTeamPasswordShares.invalidate(),
      utils.passwords.getShareStats.invalidate(),
    ])
  }

  const handleConfirmRevoke = () => {
    if (!revokingId) return
    startTransition(async () => {
      const result = await revokeTemporaryShareAction(revokingId)
      if (result.success) {
        toast.success("Share link revoked")
        setRevokingId(null)
        await refresh()
      } else {
        showErrorFromException(result.error, "Failed to revoke share link")
      }
    })
  }

  const handleConfirmRemoveTeamShare = () => {
    if (!removingTeamShareId) return
    startTransition(async () => {
      const result = await removeTeamShareAction(removingTeamShareId)
      if (result.success) {
        toast.success("Team share removed")
        setRemovingTeamShareId(null)
        await refresh()
      } else {
        showErrorFromException(result.error, "Failed to remove team share")
      }
    })
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Share2 className="h-8 w-8" />
              Shared Passwords
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage all team shares and temporary share links you have created.
            </p>
          </div>
        </div>

        {/* Stats overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statsLoading || !stats ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))}
            </>
          ) : (
            <>
              <StatCard
                title="Active Temporary Links"
                value={stats.temporary.active}
                description={`${stats.temporary.total} total created`}
                icon={Link2}
              />
              <StatCard
                title="Total Link Accesses"
                value={stats.temporary.totalAccesses}
                description="Across all temporary links"
                icon={Eye}
              />
              <StatCard
                title="Revoked / Expired"
                value={
                  stats.temporary.revoked +
                  stats.temporary.expired +
                  stats.temporary.exhausted
                }
                description={`${stats.temporary.revoked} revoked · ${stats.temporary.expired} expired · ${stats.temporary.exhausted} exhausted`}
                icon={ShieldX}
              />
              <StatCard
                title="Active Team Shares"
                value={stats.team.active}
                description={`${stats.team.expired} expired`}
                icon={Users}
              />
            </>
          )}
        </div>

        <Tabs defaultValue="temporary" className="space-y-4">
          <TabsList>
            <TabsTrigger value="temporary" className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Temporary Links
            </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Shares
            </TabsTrigger>
          </TabsList>

          <TabsContent value="temporary" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Temporary Share Links</CardTitle>
                <CardDescription>
                  Public, token-based links to passwords you own. Revoke or
                  adjust limits at any time.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="relative md:w-80">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by password name..."
                      className="pl-8"
                      value={tempSearchInput}
                      onChange={(e) => setTempSearchInput(e.target.value)}
                    />
                  </div>
                  <Select
                    value={tempStatus}
                    onValueChange={(v) =>
                      setTempStatus(v as typeof tempStatus)
                    }
                  >
                    <SelectTrigger className="md:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="revoked">Revoked</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="exhausted">Exhausted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {tempLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : temporaryShares.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No temporary share links match the current filters.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Password</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Accesses</TableHead>
                          <TableHead>Expires</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">
                            {t("common.actions")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {temporaryShares.map((share) => {
                          const isLive = share.status === "active"
                          return (
                            <TableRow key={share.id}>
                              <TableCell>
                                <div className="font-medium">
                                  {share.passwordName}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-2">
                                  {share.isOneTime && (
                                    <Badge variant="outline" className="text-[10px]">
                                      One-time
                                    </Badge>
                                  )}
                                  {share.includeTotp && (
                                    <Badge variant="outline" className="text-[10px]">
                                      TOTP
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={share.status} />
                              </TableCell>
                              <TableCell>
                                <span className="font-mono text-sm">
                                  {share.accessCount}
                                  {share.maxAccesses
                                    ? ` / ${share.maxAccesses}`
                                    : ""}
                                </span>
                                {share.accessedAt && (
                                  <div className="text-xs text-muted-foreground">
                                    Last: {formatRelative(share.accessedAt)}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                {share.expiresAt ? (
                                  <div>
                                    <div className="text-sm">
                                      {formatDate(share.expiresAt)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {formatRelative(share.expiresAt)}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-sm">
                                    Never
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {formatDate(share.createdAt)}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <CopyButton url={share.shareUrl} />
                                    </TooltipTrigger>
                                    <TooltipContent>Copy share URL</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setViewingDetails(share)}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>View details</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={!isLive}
                                        onClick={() =>
                                          setEditingTempShare(share)
                                        }
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Edit limits</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={!isLive}
                                        onClick={() => setRevokingId(share.id)}
                                        className="text-red-600 hover:text-red-700"
                                      >
                                        <ShieldX className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Revoke link</TooltipContent>
                                  </Tooltip>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {tempPagination && tempPagination.total > 0 && (
                  <PaginationFooter
                    page={tempPagination.page}
                    totalPages={tempPagination.totalPages}
                    total={tempPagination.total}
                    pageSize={tempPagination.pageSize}
                    onPageChange={setTempPage}
                    label="links"
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Team Shares</CardTitle>
                <CardDescription>
                  Passwords you have shared with teams. Adjust expiration or
                  revoke a team&apos;s access.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="relative md:w-80">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by password name..."
                      className="pl-8"
                      value={teamSearchInput}
                      onChange={(e) => setTeamSearchInput(e.target.value)}
                    />
                  </div>
                  <Select
                    value={teamStatus}
                    onValueChange={(v) =>
                      setTeamStatus(v as typeof teamStatus)
                    }
                  >
                    <SelectTrigger className="md:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {teamLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : teamShares.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No team shares match the current filters.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Password</TableHead>
                          <TableHead>Team</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Permission</TableHead>
                          <TableHead>Expires</TableHead>
                          <TableHead>Shared</TableHead>
                          <TableHead className="text-right">
                            {t("common.actions")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teamShares.map((share) => (
                          <TableRow key={share.id}>
                            <TableCell>
                              <div className="font-medium">
                                {share.passwordName}
                              </div>
                              {share.passwordUsername && (
                                <div className="text-xs text-muted-foreground">
                                  {share.passwordUsername}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">
                                  {share.teamName ?? "—"}
                                </span>
                                <Badge variant="outline" className="text-[10px]">
                                  {share.teamMemberCount} members
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={share.status} />
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {share.permission}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {share.expiresAt ? (
                                <div>
                                  <div className="text-sm">
                                    {formatDate(share.expiresAt)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatRelative(share.expiresAt)}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">
                                  Never
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {formatDate(share.createdAt)}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        setEditingTeamShare(share)
                                      }
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Edit expiration
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        setRemovingTeamShareId(share.id)
                                      }
                                      className="text-red-600 hover:text-red-700"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Remove share</TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {teamPagination && teamPagination.total > 0 && (
                  <PaginationFooter
                    page={teamPagination.page}
                    totalPages={teamPagination.totalPages}
                    total={teamPagination.total}
                    pageSize={teamPagination.pageSize}
                    onPageChange={setTeamPage}
                    label="shares"
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Revoke confirmation */}
      <AlertDialog
        open={revokingId !== null}
        onOpenChange={(open) => !open && setRevokingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke share link?</AlertDialogTitle>
            <AlertDialogDescription>
              The link will stop working immediately. Anyone with the URL will
              no longer be able to view the password. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRevokingId(null)}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRevoke}
              disabled={pending}
              className="bg-red-600 hover:bg-red-700"
            >
              {pending ? t("common.loading") : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove team share confirmation */}
      <AlertDialog
        open={removingTeamShareId !== null}
        onOpenChange={(open) => !open && setRemovingTeamShareId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team access?</AlertDialogTitle>
            <AlertDialogDescription>
              Members of this team will no longer be able to access the
              password. You can re-share it later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRemovingTeamShareId(null)}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemoveTeamShare}
              disabled={pending}
              className="bg-red-600 hover:bg-red-700"
            >
              {pending ? t("common.loading") : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Temporary share details */}
      <TemporaryShareDetailsDialog
        share={viewingDetails}
        onClose={() => setViewingDetails(null)}
      />

      {/* Edit temporary share */}
      <EditTemporaryShareDialog
        share={editingTempShare}
        onClose={() => setEditingTempShare(null)}
        onSaved={async () => {
          setEditingTempShare(null)
          await refresh()
        }}
      />

      {/* Edit team share */}
      <EditTeamShareDialog
        share={editingTeamShare}
        onClose={() => setEditingTeamShare(null)}
        onSaved={async () => {
          setEditingTeamShare(null)
          await refresh()
        }}
      />
    </TooltipProvider>
  )
}

function TemporaryShareDetailsDialog({
  share,
  onClose,
}: {
  share: TemporaryShare | null
  onClose: () => void
}) {
  if (!share) return null
  const usagePercent =
    share.maxAccesses && share.maxAccesses > 0
      ? Math.min(100, Math.round((share.accessCount / share.maxAccesses) * 100))
      : null

  return (
    <Dialog open={!!share} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {share.passwordName}
          </DialogTitle>
          <DialogDescription>
            Analytics and access history for this temporary share link.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="accessLog">
              Access Log
              <Badge variant="outline" className="ml-2 text-[10px]">
                {share.accessCount}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium">Share URL</label>
              <div className="flex items-center gap-2 mt-1">
                <Input value={share.shareUrl} readOnly className="font-mono text-xs" />
                <CopyButton url={share.shareUrl} />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  asChild
                >
                  <a href={share.shareUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <DetailField label="Status" value={<StatusBadge status={share.status} />} />
              <DetailField
                label="Accesses"
                value={
                  <span className="font-mono">
                    {share.accessCount}
                    {share.maxAccesses ? ` / ${share.maxAccesses}` : " (unlimited)"}
                  </span>
                }
              />
              <DetailField label="Created" value={formatDate(share.createdAt)} />
              <DetailField
                label="Last accessed"
                value={share.accessedAt ? formatDate(share.accessedAt) : "Never"}
              />
              <DetailField
                label="Expires"
                value={share.expiresAt ? formatDate(share.expiresAt) : "Never"}
              />
              <DetailField
                label="Revoked"
                value={share.revokedAt ? formatDate(share.revokedAt) : "—"}
              />
              <DetailField
                label="One-time"
                value={share.isOneTime ? "Yes" : "No"}
              />
              <DetailField
                label="Includes TOTP"
                value={share.includeTotp ? "Yes" : "No"}
              />
            </div>

            {usagePercent !== null && (
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Usage</span>
                  <span>{usagePercent}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="accessLog" className="mt-4">
            <ShareAccessLog shareId={share.id} />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ShareAccessLog({ shareId }: { shareId: string }) {
  const [page, setPage] = useState(1)
  const { data, isLoading } = trpc.passwords.getTemporaryShareAccessLog.useQuery(
    { shareId, page, pageSize: 10 },
  )

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />
  }

  if (!data || data.accesses.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No accesses recorded yet. Once someone opens the share URL, the event
          will appear here.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>IP address</TableHead>
              <TableHead>User agent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.accesses.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <div className="text-sm">{formatDate(entry.accessedAt)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatRelative(entry.accessedAt)}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-sm font-mono">
                    <Globe className="h-3 w-3 text-muted-foreground" />
                    {entry.ipAddress ?? "—"}
                  </div>
                </TableCell>
                <TableCell>
                  <div
                    className="flex items-start gap-1 text-xs text-muted-foreground max-w-[260px] truncate"
                    title={entry.userAgent ?? undefined}
                  >
                    <Monitor className="h-3 w-3 mt-0.5 shrink-0" />
                    <span className="truncate">{entry.userAgent ?? "—"}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data.pagination.total > 0 && (
        <PaginationFooter
          page={data.pagination.page}
          totalPages={data.pagination.totalPages}
          total={data.pagination.total}
          pageSize={data.pagination.pageSize}
          onPageChange={setPage}
          label="accesses"
        />
      )}
    </div>
  )
}

function PaginationFooter({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  label,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  label: string
}) {
  if (totalPages <= 1 && total <= pageSize) {
    return (
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
        <span>
          {total} {label}
        </span>
      </div>
    )
  }

  const start = Math.min((page - 1) * pageSize + 1, total)
  const end = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between pt-2">
      <span className="text-xs text-muted-foreground">
        Showing {start}–{end} of {total} {label}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground px-2 min-w-20 text-center">
          Page {page} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function DetailField({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm mt-1">{value}</div>
    </div>
  )
}

function toLocalDateTimeInput(value: Date | string | null | undefined): string {
  const d = toDate(value)
  if (!d) return ""
  const offsetMs = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16)
}

function toLocalDateInput(value: Date | string | null | undefined): string {
  const d = toDate(value)
  if (!d) return ""
  const offsetMs = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10)
}

function EditTemporaryShareDialog({
  share,
  onClose,
  onSaved,
}: {
  share: TemporaryShare | null
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const [expiresAt, setExpiresAt] = useState("")
  const [maxAccesses, setMaxAccesses] = useState<string>("")
  const [pending, startTransition] = useTransition()

  React.useEffect(() => {
    if (share) {
      setExpiresAt(toLocalDateTimeInput(share.expiresAt))
      setMaxAccesses(share.maxAccesses ? String(share.maxAccesses) : "")
    }
  }, [share])

  if (!share) return null

  const handleSave = () => {
    const parsedMax = maxAccesses ? parseInt(maxAccesses, 10) : null
    if (maxAccesses && (Number.isNaN(parsedMax) || parsedMax === null || parsedMax < 1 || parsedMax > 100)) {
      toast.error("Max accesses must be between 1 and 100")
      return
    }
    if (parsedMax !== null && parsedMax < share.accessCount) {
      toast.error(
        `Max accesses cannot be lower than current access count (${share.accessCount})`,
      )
      return
    }

    startTransition(async () => {
      const result = await updateTemporaryShareAction({
        shareId: share.id,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        maxAccesses: parsedMax,
      })
      if (result.success) {
        toast.success("Share link updated")
        await onSaved()
      } else {
        showErrorFromException(result.error, "Failed to update share link")
      }
    })
  }

  return (
    <Dialog open={!!share} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit share link</DialogTitle>
          <DialogDescription>
            Adjust expiration and access limits for &quot;{share.passwordName}&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Expiration date</label>
            <Input
              type="datetime-local"
              value={expiresAt}
              min={new Date().toISOString().slice(0, 16)}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty for no expiration.
            </p>
          </div>

          {!share.isOneTime && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Maximum accesses</label>
              <Input
                type="number"
                min={1}
                max={100}
                value={maxAccesses}
                onChange={(e) => setMaxAccesses(e.target.value)}
                placeholder="Unlimited"
              />
              <p className="text-xs text-muted-foreground">
                Already accessed {share.accessCount}{" "}
                {share.accessCount === 1 ? "time" : "times"}. Leave empty for
                unlimited.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
          >
            {"Cancel"}
          </Button>
          <Button type="button" onClick={handleSave} disabled={pending}>
            {pending ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditTeamShareDialog({
  share,
  onClose,
  onSaved,
}: {
  share: TeamShare | null
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const [expiresAt, setExpiresAt] = useState("")
  const [pending, startTransition] = useTransition()

  React.useEffect(() => {
    if (share) {
      setExpiresAt(toLocalDateInput(share.expiresAt))
    }
  }, [share])

  if (!share) return null

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateTeamShareAction({
        shareId: share.id,
        expiresAt: expiresAt || null,
      })
      if (result.success) {
        toast.success("Team share updated")
        await onSaved()
      } else {
        showErrorFromException(result.error, "Failed to update team share")
      }
    })
  }

  return (
    <Dialog open={!!share} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit team share</DialogTitle>
          <DialogDescription>
            Adjust expiration for &quot;{share.passwordName}&quot; shared with{" "}
            <span className="font-medium">{share.teamName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Expiration date</label>
            <Input
              type="date"
              value={expiresAt}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty for no expiration.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={pending}>
            {pending ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
