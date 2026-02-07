"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { trpc } from "@/trpc/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Mail, Loader2, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { showErrorFromException } from "@/lib/error-toast"

export function VerifyEmailRequiredPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { data: userData, refetch, isFetching, isRefetching } = trpc.auth.getCurrentUser.useQuery(undefined, {
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })
  const [emailSent, setEmailSent] = React.useState(false)
  const [isChecking, setIsChecking] = React.useState(false)

  const resendMutation = trpc.auth.resendVerificationEmail.useMutation({
    onSuccess: () => {
      setEmailSent(true)
      toast.success(t("auth.emailVerification.emailSent") || "Verification email sent successfully!")
      // Refetch user data to check if email was verified
      setTimeout(() => {
        refetch()
      }, 2000)
    },
    onError: (error) => {
      showErrorFromException(error, t("auth.emailVerification.resendError") || "Failed to send verification email")
    },
  })

  // Check if email is verified and redirect
  React.useEffect(() => {
    if (userData?.user?.emailVerified) {
      router.replace("/admin")
    }
  }, [userData?.user?.emailVerified, router])

  // Periodically check if email was verified (in case user verified in another tab)
  React.useEffect(() => {
    const interval = setInterval(() => {
      refetch()
    }, 3000) // Check every 3 seconds

    return () => clearInterval(interval)
  }, [refetch])

  const handleResend = () => {
    resendMutation.mutate()
  }

  const handleCheckAgain = async () => {
    setIsChecking(true)
    try {
      await refetch()
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-background via-background to-muted p-4">
      <Card className="w-full max-w-md backdrop-blur-sm bg-card/95 border-border/50 shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">
            {t("auth.emailVerification.requiredTitle") || "Email Verification Required"}
          </CardTitle>
          <CardDescription>
            {t("auth.emailVerification.requiredDescription") || 
              "Please verify your email address to access the admin panel. Check your inbox for the verification email."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {userData?.user?.email && (
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">
                {t("auth.emailVerification.sentTo") || "Verification email sent to:"}
              </p>
              <p className="font-medium">{userData.user.email}</p>
            </div>
          )}

          {emailSent && (
            <div className="flex items-center gap-2 p-3 bg-green-100 dark:bg-green-900/20 rounded-lg text-green-700 dark:text-green-400 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{t("auth.emailVerification.emailSent") || "Verification email sent! Please check your inbox."}</span>
            </div>
          )}

          <div className="space-y-2">
            <Button
              onClick={handleResend}
              disabled={resendMutation.isPending || emailSent}
              className="w-full"
              variant="default"
            >
              {resendMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("auth.emailVerification.sending") || "Sending..."}
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  {t("auth.emailVerification.resend") || "Resend Verification Email"}
                </>
              )}
            </Button>

            <Button
              onClick={handleCheckAgain}
              disabled={resendMutation.isPending || isChecking || isFetching || isRefetching}
              className="w-full"
              variant="outline"
            >
              {isChecking || isFetching || isRefetching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("auth.emailVerification.checking") || "Checking..."}
                </>
              ) : (
                t("auth.emailVerification.checkAgain") || "Check Again"
              )}
            </Button>
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs text-center text-muted-foreground">
              {t("auth.emailVerification.helpText") || 
                "Didn't receive the email? Check your spam folder or try resending."}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

