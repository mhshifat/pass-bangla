import { RolesTableSkeleton } from "@/modules/roles/client/roles-table-skeleton"
import { PageHeaderSkeleton } from "@/components/shared/page-skeleton"

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <PageHeaderSkeleton />
      <RolesTableSkeleton />
    </div>
  )
}
