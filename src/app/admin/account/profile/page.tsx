import { EnhancedProfilePage } from "@/modules/users/client/enhanced-profile-page"
import { prefetchUserProfile } from "@/trpc/server-prefetch"
import { HydrationBoundary } from "@tanstack/react-query"

export default async function ProfilePage() {
  const dehydratedState = await prefetchUserProfile()
  
  return (
    <HydrationBoundary state={dehydratedState}>
      <EnhancedProfilePage />
    </HydrationBoundary>
  )
}
