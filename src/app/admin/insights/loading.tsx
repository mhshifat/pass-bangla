import { InsightsSkeleton } from "@/modules/insights/client/insights-skeleton"
import { PageHeaderSkeleton } from "@/components/shared/page-skeleton"

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <PageHeaderSkeleton withAction={false} />
      <InsightsSkeleton />
    </div>
  )
}
