import { Suspense } from "react"
import { VerifyEmailRequiredPage } from "@/modules/auth/client/verify-email-required-page"
import { getCurrentUser } from "@/lib/current-user"
import { redirect } from "next/navigation"
import { prefetchCurrentUser } from "@/trpc/server-prefetch"
import { HydrationBoundary } from "@tanstack/react-query"

// Mark this route as dynamic since it uses cookies()
export const dynamic = 'force-dynamic'
export const revalidate = 0 // Always fetch fresh data

async function VerifyEmailRequiredPageContent() {
  const { user, isAuthenticated } = await getCurrentUser()

  // If not authenticated, redirect to login
  if (!isAuthenticated || !user) {
    redirect("/login")
  }

  // If email is already verified, redirect to admin
  if (user.emailVerified) {
    redirect("/admin")
  }

  // Prefetch user data for client-side hydration
  const dehydratedState = await prefetchCurrentUser()

  return (
    <HydrationBoundary state={dehydratedState}>
      <VerifyEmailRequiredPage />
    </HydrationBoundary>
  )
}

export default function VerifyEmailRequiredPageRoute() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <VerifyEmailRequiredPageContent />
    </Suspense>
  )
}

