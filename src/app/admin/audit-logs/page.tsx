import { Suspense } from "react"
import { HydrationBoundary } from "@tanstack/react-query"
import { AuditLogsContent, AuditLogsSkeleton } from "@/modules/audit-logs/client"
import { prefetchAuditLogsData } from "@/modules/audit-logs/server/prefetch"

export default async function AuditLogsPage() {
  const dehydratedState = await prefetchAuditLogsData()

  return (
    <HydrationBoundary state={dehydratedState}>
      <Suspense fallback={<AuditLogsSkeleton />}>
        <AuditLogsContent />
      </Suspense>
    </HydrationBoundary>
  )
}
