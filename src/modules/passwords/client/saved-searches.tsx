"use client"

import * as React from "react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Search, Trash2, Play, Edit2, Star, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
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
import { cn } from "@/lib/utils"
import { AdvancedSearchDialog } from "./advanced-search-dialog"
import { showErrorFromException } from "@/lib/error-toast"

type SavedSearchParams = {
  search?: string
  tagIds?: string[]
  folderIds?: string[]
  filter?: string
}

interface SavedSearch {
  id: string
  name: string
  description?: string | null
  searchParams: SavedSearchParams
  isShared?: boolean
}

interface SavedSearchesProps {
  onExecute?: (searchParams: SavedSearchParams) => void
  className?: string
}

export function SavedSearches({ onExecute, className }: SavedSearchesProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [searchToDelete, setSearchToDelete] = useState<string | null>(null)
  const [editingSearch, setEditingSearch] = useState<SavedSearch | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  const { data, isLoading, refetch } = trpc.passwords.listSavedSearches.useQuery()

  const savedSearches = data?.savedSearches || []

  // Mutations
  const executeSavedSearchMutation = trpc.passwords.executeSavedSearch.useMutation({
    onSuccess: (result) => {
      if (result?.searchParams) {
        const params = new URLSearchParams()
        
        if (result.searchParams.search) {
          params.set("search", result.searchParams.search)
        }
        if (result.searchParams.tagIds?.length > 0) {
          params.set("tags", result.searchParams.tagIds.join(","))
        }
        if (result.searchParams.folderIds?.length > 0) {
          params.set("folders", result.searchParams.folderIds.join(","))
        }
        if (result.searchParams.filter) {
          params.set("filter", result.searchParams.filter)
        }
        params.set("page", "1")

        router.push(`?${params.toString()}`)
        onExecute?.(result.searchParams)
        toast.success(t("passwords.search.executed"))
      }
    },
    onError: (error) => {
      showErrorFromException(error, t("passwords.search.executeError"))
    },
  })

  const deleteSavedSearchMutation = trpc.passwords.deleteSavedSearch.useMutation({
    onSuccess: async () => {
      toast.success(t("passwords.search.deleted"))
      await refetch()
      setDeleteDialogOpen(false)
      setSearchToDelete(null)
    },
    onError: (error) => {
      showErrorFromException(error, t("passwords.search.deleteError"))
    },
  })

  const updateSavedSearchMutation = trpc.passwords.updateSavedSearch.useMutation({
    onSuccess: async () => {
      toast.success(t("passwords.search.updated"))
      setIsEditDialogOpen(false)
      setEditingSearch(null)
      await refetch()
    },
    onError: (error) => {
      showErrorFromException(error, t("passwords.search.updateError"))
    },
  })

  const handleExecute = async (searchId: string) => {
    executeSavedSearchMutation.mutate({ id: searchId })
      
  }

  const handleDelete = async () => {
    if (!searchToDelete) return
    deleteSavedSearchMutation.mutate({ id: searchToDelete })
  }

  if (isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      </div>
    )
  }

  if (savedSearches.length === 0) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="text-sm text-muted-foreground text-center py-4">
          {t("passwords.search.noSavedSearches")}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={cn("space-y-2", className)}>
        {savedSearches.map((search) => (
          <div
            key={search.id}
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{search.name}</span>
                {search.lastUsedAt && (
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {new Date(search.lastUsedAt).toLocaleDateString()}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                {search.query && (
                  <Badge variant="secondary" className="text-xs">
                    {search.query}
                  </Badge>
                )}
                {search.filter && (
                  <Badge variant="secondary" className="text-xs">
                    {t(`passwords.filter.${search.filter}`)}
                  </Badge>
                )}
                {search.tagIds.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {search.tagIds.length} {t("passwords.tags.tags")}
                  </Badge>
                )}
                {search.folderIds.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {search.folderIds.length} {t("passwords.folder")}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 ml-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleExecute(search.id)}
                className="h-8"
              >
                <Play className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8">
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditingSearch(search)
                      setIsEditDialogOpen(true)
                    }}
                  >
                    <Edit2 className="mr-2 h-4 w-4" />
                    {t("common.edit")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => {
                      setSearchToDelete(search.id)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("common.delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("passwords.search.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("passwords.search.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editingSearch && (
        <AdvancedSearchDialog
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open)
            if (!open) {
              setEditingSearch(null)
            }
          }}
          initialValues={{
            query: editingSearch.query || "",
            searchFields: editingSearch.searchFields || ["name", "username", "url", "notes"],
            folderIds: editingSearch.folderIds || [],
            tagIds: editingSearch.tagIds || [],
            filter: editingSearch.filter || undefined,
            saveAsName: editingSearch.name || "",
          }}
          mode="edit"
          searchName={editingSearch.name}
          onSave={async (values) => {
            updateSavedSearchMutation.mutate({
              id: editingSearch.id,
              name: values.saveAsName || editingSearch.name, // Use form value or fallback to original
              query: values.query || null,
              folderIds: values.folderIds || [],
              tagIds: values.tagIds || [],
              filter: values.filter || null,
              searchFields: values.searchFields || [],
            })
          }}
        />
      )}
    </>
  )
}
