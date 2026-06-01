import { Skeleton } from "@/components/ui/skeleton"
import { PageHeaderSkeleton } from "@/components/shared/page-skeleton"

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <PageHeaderSkeleton withAction={false} />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-lg" />
        ))}
      </div>
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  )
}
