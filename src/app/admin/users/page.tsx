import { Suspense } from "react"
import { UsersTableSkeleton, UsersPagination, UserActionsClient } from "@/modules/users/client"
import { caller } from "@/trpc/server"
import { getCurrentUserData } from "@/trpc/server-caller"
import { User } from "@/app/generated"
import { UsersPageHeader } from "./users-page-header"
import { UserStatsClient } from "./user-stats-client"

async function getUserStats(currentUserId: string) {
  const { total, active, mfa, admins } = await caller.users.stats({ excludeUserId: currentUserId });
  return {
    total,
    active,
    mfa,
    admins,
  };
}

async function UsersContent({ page, currentUserId, currentUser }: { 
  page: number; currentUserId: string; currentUser: User 
}) {
  const { users, pagination, isSuperAdmin } = await caller.users.list({
    page,
    pageSize: 10,
    excludeUserId: currentUserId
  })

  return (
    <>
      <UserActionsClient
        users={users}
        currentUserId={currentUserId}
        isSuperAdmin={isSuperAdmin}
        currentUser={currentUser}
      />
      <UsersPagination
        currentPage={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
      />
    </>
  )
}

interface UsersPageProps {
  searchParams: Promise<{ page?: string }>
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const params = await searchParams
  const currentPage = Number(params.page) || 1
  const { session, user } = await getCurrentUserData()
  const userStats = await getUserStats(session.userId)

  return (
    <div className="p-6 space-y-6">
      <UsersPageHeader />
      <UserStatsClient stats={userStats} />

      <Suspense key={currentPage} fallback={<UsersTableSkeleton />}>
        <UsersContent page={currentPage} currentUserId={session.userId} currentUser={user as User} />
      </Suspense>
    </div>
  )
}
