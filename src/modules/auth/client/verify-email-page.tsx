"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { trpc } from "@/trpc/client"
import { AuthCard } from "./auth-card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { showErrorFromException } from "@/lib/error-toast"

export function VerifyEmailPage() {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")
  const [verificationStatus, setVerificationStatus] = React.useState<"pending" | "success" | "error">("pending")
  const [companySubdomain, setCompanySubdomain] = React.useState<string | null>(null)

  // /admin only exists on the company subdomain. The verification link is often
  // opened on the main domain (that's where registration happens), so continue
  // on the company's own address instead of the 404 at passbangla.com/admin.
  const continueToApp = React.useCallback(() => {
    const { protocol, host } = window.location
    const hostname = host.split(":")[0]
    const parts = hostname.split(".")
    const isLocalhost = hostname.endsWith("localhost")
    const onSubdomain = isLocalhost
      ? parts.length >= 2
      : parts.length >= 3 && parts[0] !== "www"

    if (onSubdomain || !companySubdomain) {
      router.replace(onSubdomain ? "/admin" : "/login")
      return
    }

    const baseDomain = isLocalhost ? host : host.replace(/^www\./, "")
    window.location.href = `${protocol}//${companySubdomain}.${baseDomain}/admin`
  }, [companySubdomain, router])

  const utils = trpc.useUtils()
  // Only watches for the email being verified elsewhere: slow, visible tab only, and it gives up eventually
  trpc.auth.checkEmailVerification.useQuery(undefined, {
    refetchInterval: (query) =>
      query.state.data?.emailVerified || query.state.dataUpdateCount >= 20 ? false : 12000,
    refetchIntervalInBackground: false,
  })

  const verifyMutation = trpc.auth.verifyEmail.useMutation({
    onSuccess: async (data) => {
      console.log("Email verification mutation response:", data)
      setCompanySubdomain(data.companySubdomain)
      setVerificationStatus("success")
      toast.success(t("auth.emailVerification.success"))
      
      // Invalidate email verification query to trigger refetch
      await utils.auth.checkEmailVerification.invalidate()
    },
    onError: (error) => {
      console.error("Email verification error:", error)
      setVerificationStatus("error")
      showErrorFromException(error, t("auth.emailVerification.error"))
    },
  })

  // Once the token has been accepted, continue to the app (the visitor may not be logged in here)
  React.useEffect(() => {
    if (verificationStatus === "success") {
      continueToApp()
    }
  }, [verificationStatus, continueToApp])

  React.useEffect(() => {
    if (token) {
      console.log("Verifying email with token:", token.substring(0, 10) + "...")
      verifyMutation.mutate({ token }, {
        onSuccess: (data) => {
          console.log("Verification mutation success:", data)
        },
        onError: (error) => {
          console.error("Verification mutation error:", error)
        }
      })
    } else {
      setVerificationStatus("error")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-background via-background to-muted p-4">
      <AuthCard className="w-full">
        <div className="space-y-6 text-center px-5">
          {verificationStatus === "pending" && (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{t("auth.emailVerification.verifying")}</h1>
                <p className="mt-2 text-muted-foreground">
                  {t("auth.emailVerification.verifyingDescription")}
                </p>
              </div>
            </>
          )}

          {verificationStatus === "success" && (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{t("auth.emailVerification.successTitle")}</h1>
                <p className="mt-2 text-muted-foreground">
                  {t("auth.emailVerification.successDescription")}
                </p>
              </div>
              <div className="pt-4">
                <Button 
                  onClick={continueToApp}
                  className="w-full"
                >
                  {t("common.continue") || "Continue"}
                </Button>
              </div>
            </>
          )}

          {verificationStatus === "error" && (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{t("auth.emailVerification.errorTitle")}</h1>
                <p className="mt-2 text-muted-foreground">
                  {t("auth.emailVerification.errorDescription")}
                </p>
              </div>
              <div className="space-y-2 pt-4">
                <Button asChild variant="outline" className="w-full">
                  <Link href="/login">{t("auth.login")}</Link>
                </Button>
                <Button asChild variant="ghost" className="w-full">
                  <Link href="/register">{t("auth.register")}</Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </AuthCard>
    </div>
  )
}
