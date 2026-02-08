"use client"

import * as React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { 
  Copy, 
  AlertTriangle, 
  Search, 
  Trash2, 
  Merge,
  ArrowLeft,
  RefreshCw,
  CheckCircle2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { BulkResolveDuplicatesDialog, PasswordDetailsDialog } from "@/modules/passwords/client"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentUser } from "@/hooks/use-current-user"
import { showErrorFromException } from "@/lib/error-toast"

export function DuplicatesPageClient() {
  const { t } = useTranslation()
  const router = useRouter()
  const [selectedTab, setSelectedTab] = useState<"duplicates" | "reused" | "similar">("duplicates")
  const [selectedGroup, setSelectedGroup] = useState<{
    passwordIds: string[]
    keepPasswordId?: string
  } | null>(null)
  const [isResolveDialogOpen, setIsResolveDialogOpen] = useState(false)
  const [selectedPassword, setSelectedPassword] = useState<{
    id: string
    name: string
    username: string
    url?: string | null
    folder: string | null
    strength: "strong" | "medium" | "weak"
    shared: boolean
    sharedWith: Array<{ id: string; name: string }>
    lastModified: string
    expiresIn: number | null
    hasTotp: boolean
    isOwner?: boolean
  } | null>(null)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)

  const { data: duplicatesData, isLoading: duplicatesLoading, isFetching: duplicatesFetching, refetch: refetchDuplicates } = trpc.passwords.findDuplicates.useQuery(
    {},
    { enabled: true }
  )

  const { data: reusedData, isLoading: reusedLoading, isFetching: reusedFetching, refetch: refetchReused } = trpc.passwords.findReused.useQuery(
    {},
    { enabled: true }
  )

  const { data: similarData, isLoading: similarLoading, isFetching: similarFetching, refetch: refetchSimilar } = trpc.passwords.findSimilar.useQuery(
    { threshold: 0.8 },
    { enabled: true }
  )

  const isRefreshing = duplicatesFetching || reusedFetching || similarFetching

  const { user: currentUser } = useCurrentUser()

  const handleResolve = (passwordIds: string[], keepPasswordId?: string) => {
    setSelectedGroup({ passwordIds, keepPasswordId })
    setIsResolveDialogOpen(true)
  }

  const handleResolveSuccess = () => {
    setIsResolveDialogOpen(false)
    setSelectedGroup(null)
    refetchDuplicates()
    refetchReused()
    refetchSimilar()
    router.refresh()
  }

  const copyPassword = async (password: string) => {
    try {
      await navigator.clipboard.writeText(password)
      toast.success(t("passwords.duplicates.passwordCopied"))
    } catch (error) { showErrorFromException(error, t("passwords.passwordCopyFailed")) }
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="h-9 w-9"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                <Copy className="h-8 w-8" />
                {t("passwords.duplicates.title")}
              </h1>
              <p className="text-muted-foreground mt-1">
                {t("passwords.duplicates.description")}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              refetchDuplicates()
              refetchReused()
              refetchSimilar()
            }}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as typeof selectedTab)}>
          <TabsList className='flex items-center justify-start flex-wrap h-auto space-y-1'>
            <TabsTrigger value="duplicates">
              {t("passwords.duplicates.duplicates")}
              {duplicatesData && duplicatesData.uniqueDuplicatedPasswords > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {duplicatesData.uniqueDuplicatedPasswords}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="reused">
              {t("passwords.duplicates.reused")}
              {reusedData && reusedData.uniqueReusedPasswords > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {reusedData.uniqueReusedPasswords}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="similar">
              {t("passwords.duplicates.similar")}
              {similarData && similarData.uniqueSimilarGroups > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {similarData.uniqueSimilarGroups}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Duplicates Tab */}
          <TabsContent value="duplicates" className="space-y-4">
            {duplicatesLoading ? (
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-64 w-full" />
                </CardContent>
              </Card>
            ) : duplicatesData && duplicatesData.duplicates.length > 0 ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("passwords.duplicates.summary")}</CardTitle>
                    <CardDescription>
                      {t("passwords.duplicates.duplicatesFound", {
                        count: duplicatesData.uniqueDuplicatedPasswords,
                        total: duplicatesData.totalDuplicates,
                      })}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <div className="space-y-4">
                  {duplicatesData.duplicates.map((group, groupIndex) => (
                    <Card key={groupIndex}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base">
                              {t("passwords.duplicates.group")} {groupIndex + 1}
                            </CardTitle>
                            <CardDescription>
                              {t("passwords.duplicates.occurrences", { count: group.count })}
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyPassword(group.password)}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              {t("passwords.duplicates.copyPassword")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResolve(group.entries.map((e) => e.id))}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t("passwords.duplicates.deleteAll")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const firstId = group.entries[0].id
                                handleResolve(group.entries.map((e) => e.id), firstId)
                              }}
                            >
                              <Merge className="h-4 w-4 mr-2" />
                              {t("passwords.duplicates.merge")}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t("common.name")}</TableHead>
                                <TableHead>{t("passwords.username")}</TableHead>
                                <TableHead>{t("passwords.url")}</TableHead>
                                <TableHead>{t("passwords.duplicates.owner")}</TableHead>
                                <TableHead className="text-right">{t("common.actions")}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.entries.map((entry) => (
                                <TableRow key={entry.id}>
                                  <TableCell className="font-medium">{entry.name}</TableCell>
                                  <TableCell className="font-mono text-sm">{entry.username}</TableCell>
                                  <TableCell>
                                    {entry.url ? (
                                      <a
                                        href={entry.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline truncate max-w-xs block"
                                      >
                                        {entry.url}
                                      </a>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div>
                                      <div className="font-medium">{entry.owner.name}</div>
                                      <div className="text-xs text-muted-foreground">{entry.owner.email}</div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedPassword({
                                          id: entry.id,
                                          name: entry.name,
                                          username: entry.username,
                                          url: entry.url,
                                          folder: null,
                                          strength: "medium" as const,
                                          shared: false,
                                          sharedWith: [],
                                          lastModified: new Date().toISOString().split("T")[0],
                                          expiresIn: null,
                                          hasTotp: false,
                                          isOwner: entry.ownerId === currentUser?.id,
                                        })
                                        setIsViewDialogOpen(true)
                                      }}
                                    >
                                      {t("common.view")}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="p-12">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-600" />
                    <div className="font-semibold text-lg">{t("passwords.duplicates.noDuplicates")}</div>
                    <div className="text-sm text-muted-foreground">
                      {t("passwords.duplicates.noDuplicatesDescription")}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Reused Tab */}
          <TabsContent value="reused" className="space-y-4">
            {reusedLoading ? (
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-64 w-full" />
                </CardContent>
              </Card>
            ) : reusedData && reusedData.reused.length > 0 ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("passwords.duplicates.summary")}</CardTitle>
                    <CardDescription>
                      {t("passwords.duplicates.reusedFound", {
                        count: reusedData.uniqueReusedPasswords,
                        total: reusedData.totalReused,
                      })}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <div className="space-y-4">
                  {reusedData.reused.map((group, groupIndex) => (
                    <Card key={groupIndex}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base">
                              {t("passwords.duplicates.group")} {groupIndex + 1}
                            </CardTitle>
                            <CardDescription>
                              {t("passwords.duplicates.occurrences", { count: group.count })}
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyPassword(group.password)}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              {t("passwords.duplicates.copyPassword")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResolve(group.entries.map((e) => e.id))}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t("passwords.duplicates.deleteAll")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const firstId = group.entries[0].id
                                handleResolve(group.entries.map((e) => e.id), firstId)
                              }}
                            >
                              <Merge className="h-4 w-4 mr-2" />
                              {t("passwords.duplicates.merge")}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t("common.name")}</TableHead>
                                <TableHead>{t("passwords.username")}</TableHead>
                                <TableHead>{t("passwords.url")}</TableHead>
                                <TableHead>{t("passwords.duplicates.owner")}</TableHead>
                                <TableHead className="text-right">{t("common.actions")}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.entries.map((entry) => (
                                <TableRow key={entry.id}>
                                  <TableCell className="font-medium">{entry.name}</TableCell>
                                  <TableCell className="font-mono text-sm">{entry.username}</TableCell>
                                  <TableCell>
                                    {entry.url ? (
                                      <a
                                        href={entry.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline truncate max-w-xs block"
                                      >
                                        {entry.url}
                                      </a>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div>
                                      <div className="font-medium">{entry.owner.name}</div>
                                      <div className="text-xs text-muted-foreground">{entry.owner.email}</div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedPassword({
                                          id: entry.id,
                                          name: entry.name,
                                          username: entry.username,
                                          url: entry.url,
                                          folder: null,
                                          strength: "medium" as const,
                                          shared: false,
                                          sharedWith: [],
                                          lastModified: new Date().toISOString().split("T")[0],
                                          expiresIn: null,
                                          hasTotp: false,
                                          isOwner: entry.ownerId === currentUser?.id,
                                        })
                                        setIsViewDialogOpen(true)
                                      }}
                                    >
                                      {t("common.view")}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="p-12">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-600" />
                    <div className="font-semibold text-lg">{t("passwords.duplicates.noReused")}</div>
                    <div className="text-sm text-muted-foreground">
                      {t("passwords.duplicates.noReusedDescription")}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Similar Tab */}
          <TabsContent value="similar" className="space-y-4">
            {similarLoading ? (
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-64 w-full" />
                </CardContent>
              </Card>
            ) : similarData && similarData.similarGroups.length > 0 ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("passwords.duplicates.summary")}</CardTitle>
                    <CardDescription>
                      {t("passwords.duplicates.similarFound", {
                        count: similarData.uniqueSimilarGroups,
                        total: similarData.totalSimilar,
                      })}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <div className="space-y-4">
                  {similarData.similarGroups.map((group, groupIndex) => (
                    <Card key={groupIndex}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base">
                              {t("passwords.duplicates.group")} {groupIndex + 1}
                            </CardTitle>
                            <CardDescription>
                              {t("passwords.duplicates.similarity", {
                                similarity: Math.round(group.similarity * 100),
                              })}
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResolve(group.entries.map((e) => e.id))}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t("passwords.duplicates.deleteAll")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const firstId = group.entries[0].id
                                handleResolve(group.entries.map((e) => e.id), firstId)
                              }}
                            >
                              <Merge className="h-4 w-4 mr-2" />
                              {t("passwords.duplicates.merge")}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t("common.name")}</TableHead>
                                <TableHead>{t("passwords.username")}</TableHead>
                                <TableHead>{t("passwords.url")}</TableHead>
                                <TableHead>{t("passwords.duplicates.password")}</TableHead>
                                <TableHead>{t("passwords.duplicates.owner")}</TableHead>
                                <TableHead className="text-right">{t("common.actions")}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.entries.map((entry) => (
                                <TableRow key={entry.id}>
                                  <TableCell className="font-medium">{entry.name}</TableCell>
                                  <TableCell className="font-mono text-sm">{entry.username}</TableCell>
                                  <TableCell>
                                    {entry.url ? (
                                      <a
                                        href={entry.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline truncate max-w-xs block"
                                      >
                                        {entry.url}
                                      </a>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="font-mono text-sm">
                                    {entry.password}
                                  </TableCell>
                                  <TableCell>
                                    <div>
                                      <div className="font-medium">{entry.owner.name}</div>
                                      <div className="text-xs text-muted-foreground">{entry.owner.email}</div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedPassword({
                                          id: entry.id,
                                          name: entry.name,
                                          username: entry.username,
                                          url: entry.url,
                                          folder: null,
                                          strength: "medium" as const,
                                          shared: false,
                                          sharedWith: [],
                                          lastModified: new Date().toISOString().split("T")[0],
                                          expiresIn: null,
                                          hasTotp: false,
                                          isOwner: entry.ownerId === currentUser?.id,
                                        })
                                        setIsViewDialogOpen(true)
                                      }}
                                    >
                                      {t("common.view")}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="p-12">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-600" />
                    <div className="font-semibold text-lg">{t("passwords.duplicates.noSimilar")}</div>
                    <div className="text-sm text-muted-foreground">
                      {t("passwords.duplicates.noSimilarDescription")}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {selectedGroup && (
        <BulkResolveDuplicatesDialog
          open={isResolveDialogOpen}
          onOpenChange={setIsResolveDialogOpen}
          passwordIds={selectedGroup.passwordIds}
          keepPasswordId={selectedGroup.keepPasswordId}
          onSuccess={handleResolveSuccess}
        />
      )}

      <PasswordDetailsDialog
        open={isViewDialogOpen}
        onOpenChange={setIsViewDialogOpen}
        password={selectedPassword}
      />
    </>
  )
}
