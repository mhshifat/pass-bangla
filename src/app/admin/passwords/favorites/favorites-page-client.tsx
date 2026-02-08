"use client"

import * as React from "react"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslation } from "react-i18next"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { trpc } from "@/trpc/client"
import { Skeleton } from "@/components/ui/skeleton"
import { PasswordsTable } from "@/modules/passwords/client/passwords-table"
import { PasswordDetailsDialog } from "@/modules/passwords/client"
import { usePermissions } from "@/hooks/use-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Star } from "lucide-react"
import type { RouterOutputs } from "@/trpc/client"

interface PasswordItem {
  id: string
  name: string
  username?: string | null
  url?: string | null
  folder?: string | null
  strength?: string
  shared?: boolean
  lastModified?: string
  [key: string]: unknown
}

// Types for SSR data
type FavoritesData = RouterOutputs["passwords"]["getFavorites"]

interface FavoritesPageClientProps {
  initialData: FavoritesData
  initialPage: number
  initialSearch?: string
}

export function FavoritesPageClient({
  initialData,
  initialPage,
  initialSearch,
}: FavoritesPageClientProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { hasPermission } = usePermissions()
  const searchQuery = searchParams.get("search") || ""
  const currentPage = Number(searchParams.get("page")) || 1

  // Check if params changed from initial (need to refetch)
  const paramsChanged = currentPage !== initialPage || searchQuery !== (initialSearch || "")

  // Use SSR data as initial, only fetch client-side when params change
  const { data: queryData, isLoading } = trpc.passwords.getFavorites.useQuery(
    { page: currentPage, pageSize: 20, search: searchQuery || undefined },
    {
      enabled: hasPermission("password.view") && paramsChanged,
      staleTime: 60_000, // 1 minute
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  )

  // Use initial data when not fetching, query data when fetching
  const data = paramsChanged ? queryData : initialData

  // Note: React Query automatically refetches when query input (page, search) changes
  // No need for manual useEffect refetch

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams)
    params.set("page", page.toString())
    router.push(`?${params.toString()}`)
  }

  const [selectedPassword, setSelectedPassword] = useState<PasswordItem | null>(null)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)

  const handleViewDetails = (password: PasswordItem) => {
    setSelectedPassword(password)
    setIsViewDialogOpen(true)
  }

  const handleEdit = (_password: PasswordItem) => {
    // This will be handled by the PasswordsTable component
  }

  const handleDelete = (_password: PasswordItem) => {
    // This will be handled by the PasswordsTable component
  }

  const handleShare = (_password: PasswordItem) => {
    // This will be handled by the PasswordsTable component
  }

  if (!hasPermission("password.view")) {
    return null
  }

  return (
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
              <Star className="h-8 w-8 fill-yellow-400 text-yellow-400" />
              {t("passwords.favorites.title")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("passwords.favorites.description")}
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>{t("passwords.favorites.favoritePasswords")}</CardTitle>
          <CardDescription>
            {data
              ? t("passwords.favorites.totalFavorites", { count: data.pagination.total })
              : t("passwords.favorites.searchFavorites")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !data?.passwords || data.passwords.length === 0 ? (
            <Alert>
              <Star className="h-4 w-4" />
              <AlertDescription>
                {searchQuery
                  ? t("passwords.favorites.noFavoritesFound")
                  : t("passwords.favorites.noFavorites")}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <PasswordsTable
                passwords={data.passwords}
                onViewDetails={handleViewDetails}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onShare={handleShare}
              />
              {/* Pagination */}
              {data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    {t("passwords.paginationInfo", {
                      start: (data.pagination.page - 1) * data.pagination.pageSize + 1,
                      end: Math.min(
                        data.pagination.page * data.pagination.pageSize,
                        data.pagination.total
                      ),
                      total: data.pagination.total,
                    })}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      {t("common.previous")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage >= data.pagination.totalPages}
                    >
                      {t("common.next")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <PasswordDetailsDialog
        open={isViewDialogOpen}
        onOpenChange={setIsViewDialogOpen}
        password={selectedPassword}
      />
    </div>
  )
}
