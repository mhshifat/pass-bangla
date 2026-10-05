import { I18nProvider } from "@/components/providers/i18n-provider"
import { getServerLanguage } from "@/lib/i18n-server"
import { TemporaryPasswordShareView } from "@/modules/passwords/client/temporary-share-view"

export default async function SharePasswordPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const resolvedParams = await params
  const language = await getServerLanguage()
  return (
    <I18nProvider initialLanguage={language}>
      <TemporaryPasswordShareView token={resolvedParams.token} />
    </I18nProvider>
  )
}

