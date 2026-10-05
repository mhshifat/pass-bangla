import { I18nProvider } from "@/components/providers/i18n-provider"
import { getServerLanguage } from "@/lib/i18n-server"
import { Suspense } from "react"
import { VerifyEmailPage } from "@/modules/auth/client/verify-email-page"
import { prefetchCurrentUser } from "@/trpc/server-prefetch"
import { HydrationBoundary } from "@tanstack/react-query"

async function VerifyEmailPageContent() {
  // Prefetch user data for client-side hydration (user may or may not be logged in)
  const dehydratedState = await prefetchCurrentUser()
  
  const language = await getServerLanguage()

  return (
    <I18nProvider initialLanguage={language}>
    <HydrationBoundary state={dehydratedState}>
      <VerifyEmailPage />
    </HydrationBoundary>
    </I18nProvider>
  )
}

export default function VerifyEmailPageRoute() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <VerifyEmailPageContent />
    </Suspense>
  )
}

