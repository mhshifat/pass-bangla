import { I18nProvider } from "@/components/providers/i18n-provider"
import { getServerLanguage } from "@/lib/i18n-server"
import { AdminRouteGuard } from "./admin-route-guard"
import { AdminLayoutClient } from "./admin-layout-client"
import { prefetchCurrentUser } from "@/trpc/server-prefetch"
import { HydrationBoundary } from "@tanstack/react-query"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Prefetch user data on the server to avoid client-side API calls
  const [dehydratedState, language] = await Promise.all([prefetchCurrentUser(), getServerLanguage()])

  return (
    <I18nProvider initialLanguage={language}>
      <AdminRouteGuard>
        <HydrationBoundary state={dehydratedState}>
          <AdminLayoutClient>{children}</AdminLayoutClient>
        </HydrationBoundary>
      </AdminRouteGuard>
    </I18nProvider>
  )
}
