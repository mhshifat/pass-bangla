import { PasswordsTableSkeleton } from "@/modules/passwords/client/passwords-table-skeleton"
import { PageHeaderSkeleton, StatCardsSkeleton } from "@/components/shared/page-skeleton"

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <PasswordsTableSkeleton />
    </div>
  )
}
