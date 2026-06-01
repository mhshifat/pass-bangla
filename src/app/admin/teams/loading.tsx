import { TeamsTableSkeleton } from "@/modules/teams/client/teams-table-skeleton"
import { TeamsStatsSkeleton } from "@/modules/teams/client/teams-stats-skeleton"
import { PageHeaderSkeleton } from "@/components/shared/page-skeleton"

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <PageHeaderSkeleton />
      <TeamsStatsSkeleton />
      <TeamsTableSkeleton />
    </div>
  )
}
