"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { trpc } from "@/trpc/client"
import { AuthCard } from "./auth-card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, Loader2, Mail } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { showErrorFromException } from "@/lib/error-toast"

export function VerifyEmailPage() {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")
  const [verificationStatus, setVerificationStatus] = React.useState<"pending" | "success" | "error">("pending")

  const utils = trpc.useUtils()
  const { data: userData } = trpc.auth.getCurrentUser.useQuery(undefined, {
    retry: false,
  })

  const verifyMutation = trpc.auth.verifyEmail.useMutation({
    onSuccess: async (data) => {
      console.log("Email verification mutation response:", data)
      setVerificationStatus("success")
      
      // Check if the mutation response indicates success and email was verified
      if (data.user?.emailVerified) {
        console.log("Email verified in mutation response:", data.user.emailVerified)
        toast.success(t("auth.emailVerification.success"))
        
        // Invalidate all queries to ensure fresh data
        await utils.invalidate()
        
        // Redirect immediately - mutation confirmed email is verified
        if (userData?.user) {
          router.replace("/admin")
        } else {
          router.replace("/login")
        }
      } else {
        // Mutation succeeded but emailVerified is still null - wait and retry
        console.warn("Mutation succeeded but emailVerified is null, retrying...")
        toast.success(t("auth.emailVerification.success"))
        
        // Wait for database transaction
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Invalidate and refetch
        await utils.invalidate()
        
        let updatedUser = null
        let retries = 0
        const maxRetries = 5
        
        while (retries < maxRetries) {
          updatedUser = await utils.auth.getCurrentUser.refetch(undefined, {
            throwOnError: false,
          })
          
          console.log(`Refetch attempt ${retries + 1}:`, {
            emailVerified: updatedUser.data?.user?.emailVerified,
          })
          
          if (updatedUser.data?.user?.emailVerified) {
            console.log("Email verified confirmed via refetch!")
            break
          }
          
          await new Promise(resolve => setTimeout(resolve, 500 * (retries + 1)))
          retries++
        }
        
        // Redirect based on login status
        if (updatedUser?.data?.user || userData?.user) {
          router.replace("/admin")
        } else {
          router.replace("/login")
        }
      }
    },
    onError: (error) => {
      console.error("Email verification error:", error)
      setVerificationStatus("error")
      showErrorFromException(error, t("auth.emailVerification.error"))
    },
  })

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
                  onClick={() => {
                    if (userData?.user) {
                      router.replace("/admin")
                    } else {
                      router.replace("/login")
                    }
                  }}
                  className="w-full"
                >
                  {userData?.user ? t("common.continue") || "Continue" : t("auth.login")}
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
