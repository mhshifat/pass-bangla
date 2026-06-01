import { Skeleton } from "@/components/ui/skeleton"

/**
 * Skeleton for the standard admin page header (title + description + optional
 * action button), matching the `p-6 space-y-6` page shell. Used by route-level
 * `loading.tsx` files so navigation shows instant structure instead of a blank
 * screen while the server component resolves.
 */
export function PageHeaderSkeleton({ withAction = true }: { withAction?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {withAction ? <Skeleton className="h-10 w-32 rounded-lg" /> : null}
    </div>
  )
}

/**
 * Skeleton for a row of stat cards (e.g. dashboard / list-page headers).
 */
export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4 rounded" />
          </div>
          <Skeleton className="mt-4 h-8 w-20" />
          <Skeleton className="mt-2 h-3 w-28" />
        </div>
      ))}
    </div>
  )
}

/**
 * Generic full-page loading shell: header + stat cards + a content block.
 * Pass a `children` skeleton (e.g. a table skeleton) for the content area.
 */
export function ListPageSkeleton({
  withStats = true,
  statCount = 4,
  children,
}: {
  withStats?: boolean
  statCount?: number
  children?: React.ReactNode
}) {
  return (
    <div className="p-6 space-y-6">
      <PageHeaderSkeleton />
      {withStats ? <StatCardsSkeleton count={statCount} /> : null}
      {children ?? <Skeleton className="h-96 w-full rounded-xl" />}
    </div>
  )
}
