"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Clock, X, Search as SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { showErrorFromException } from "@/lib/error-toast"

type SearchHistoryItem = {
  id: string
  query?: string | null
  tagIds?: string[]
  folderIds?: string[]
  filter?: string | null
  resultCount?: number | null
}

interface SearchHistoryProps {
  onSelect?: (searchParams: SearchHistoryItem) => void
  className?: string
  limit?: number
}

export function SearchHistory({ onSelect, className, limit = 10 }: SearchHistoryProps) {
  const { t } = useTranslation()
  const router = useRouter()

  const { data, isLoading, refetch } = trpc.passwords.listSearchHistory.useQuery({ limit })

  const history = data?.history || []

  // Mutation
  const clearSearchHistoryMutation = trpc.passwords.clearSearchHistory.useMutation({
    onSuccess: async () => {
      toast.success(t("passwords.search.historyCleared"))
      await refetch()
    },
    onError: (error) => {
      showErrorFromException(error, t("passwords.search.clearError"))
    },
  })

  const handleSelect = (item: SearchHistoryItem) => {
    const params = new URLSearchParams()

    if (item.query) {
      params.set("search", item.query)
    }
    if (item.tagIds?.length > 0) {
      params.set("tags", item.tagIds.join(","))
    }
    if (item.folderIds?.length > 0) {
      params.set("folders", item.folderIds.join(","))
    }
    if (item.filter) {
      params.set("filter", item.filter)
    }
    params.set("page", "1")

    router.push(`?${params.toString()}`)
    onSelect?.(item)
  }

  const handleClear = () => {
    clearSearchHistoryMutation.mutate()
  }

  if (isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="text-sm text-muted-foreground text-center py-4">
          {t("passwords.search.noHistory")}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{t("passwords.search.recentSearches")}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="h-7 text-xs"
        >
          <X className="h-3 w-3 mr-1" />
          {t("passwords.search.clear")}
        </Button>
      </div>
      <div className="space-y-1">
        {history.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleSelect(item)}
            className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors group"
          >
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {item.query ? (
                <span className="text-sm font-medium truncate">{item.query}</span>
              ) : (
                <span className="text-sm text-muted-foreground italic">
                  {t("passwords.search.filteredSearch")}
                </span>
              )}
              {item.resultCount !== null && (
                <Badge variant="outline" className="text-xs ml-auto">
                  {item.resultCount} {t("passwords.search.results")}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground ml-5">
              {item.filter && (
                <Badge variant="secondary" className="text-xs">
                  {t(`passwords.filter.${item.filter}`)}
                </Badge>
              )}
              {item.tagIds.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {item.tagIds.length} {t("passwords.tags.tags")}
                </Badge>
              )}
              {item.folderIds.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {item.folderIds.length} {t("passwords.folder")}
                </Badge>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
