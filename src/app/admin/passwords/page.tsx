import { Suspense } from "react"
import { HydrationBoundary } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PasswordsTableSkeleton } from "@/modules/passwords/client/passwords-table-skeleton"
import { PasswordsEmptyState } from "@/modules/passwords/client/passwords-empty-state"
import { caller } from "@/trpc/server"
import { prefetchPasswordsData } from "@/modules/passwords/server/prefetch"
import { PasswordsContent } from "./passwords-content"
import { PasswordsListClient } from "./passwords-list-client"
import { PasswordsPageHeader } from "./passwords-page-header"
import { PasswordsStatsClient } from "./passwords-stats-client"

interface PasswordsPageProps {
  searchParams: Promise<{ 
    page?: string
    search?: string
    filter?: string
    tags?: string
    folders?: string
    searchFields?: string
  }>
}

export default async function PasswordsPage({ searchParams }: PasswordsPageProps) {
  const params = await searchParams
  const currentPage = Number(params.page) || 1
  const search = params.search || ""
  const filter = params.filter === "weak" || params.filter === "expiring" || params.filter === "favorites" ? params.filter : undefined
  const tagIds = params.tags ? params.tags.split(",").filter(Boolean) : undefined
  const folderIds = params.folders ? params.folders.split(",").filter(Boolean) : undefined
  const searchFields = params.searchFields ? params.searchFields.split(",").filter(Boolean) as ("name" | "username" | "url" | "notes")[] : undefined

  // The shell streams immediately; the list boundary prefetches the hydrated
  // queries (export filters, reminders) in parallel with the list itself. The
  // boundary has no per-search key so a search/page change inside a transition
  // keeps the current rows on screen instead of flashing the skeleton.
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PasswordsPageHeader />
        <PasswordsContent />
      </div>

      <Suspense fallback={<PasswordsStatsSkeleton />}>
        <PasswordsStats />
      </Suspense>

      <Suspense fallback={<PasswordsTableSkeleton />}>
        <PasswordsListContent
          page={currentPage}
          search={search}
          filter={filter}
          tagIds={tagIds}
          folderIds={folderIds}
          searchFields={searchFields}
        />
      </Suspense>
    </div>
  )
}

async function PasswordsStats() {
  const stats = await caller.passwords.stats()
  return <PasswordsStatsClient stats={stats} />
}

function PasswordsStatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-8 w-16 bg-muted animate-pulse rounded mb-2" />
            <div className="h-3 w-32 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

async function PasswordsListContent({
  page,
  search,
  filter,
  tagIds,
  folderIds,
  searchFields,
}: {
  page: number
  search: string
  filter?: "weak" | "expiring" | "favorites"
  tagIds?: string[]
  folderIds?: string[]
  searchFields?: ("name" | "username" | "url" | "notes")[]
}) {
  const [{ passwords, pagination }, dehydratedState] = await Promise.all([
    caller.passwords.list({
      page,
      pageSize: 10,
      search: search || undefined,
      filter: filter,
      tagIds: tagIds && tagIds.length > 0 ? tagIds : undefined,
      folderIds: folderIds && folderIds.length > 0 ? folderIds : undefined,
      searchFields: searchFields && searchFields.length > 0 ? searchFields : undefined,
    }),
    prefetchPasswordsData(),
  ])

  if (passwords.length === 0) {
    return <PasswordsEmptyState isSearching={!!search || !!filter || !!tagIds?.length || !!folderIds?.length} />
  }

  return (
    <HydrationBoundary state={dehydratedState}>
      <PasswordsListClient passwords={passwords} pagination={pagination} />
    </HydrationBoundary>
  )
}
