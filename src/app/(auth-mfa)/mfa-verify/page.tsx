import { Suspense } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { MfaVerifyForm } from "@/modules/auth/client/mfa-verify/mfa-verify-form"
import { MfaVerifyPageHeader } from "./mfa-verify-page-header"
import { serverTrpc } from "@/trpc/server-caller"
import { redirect } from "next/navigation"

export default async function MfaVerifyPage() {
  const trpc = await serverTrpc();
  const userData = await trpc.auth.getCurrentUser();
  
  // Redirect to admin only if MFA is already verified (not required)
  if (userData?.session?.mfaVerified === true) {
    return redirect("/admin");
  }
  
  // Priority check: If session says setup is required, redirect to setup
  if (userData?.session?.mfaSetupRequired === true) {
    return redirect("/mfa-setup");
  }
  
  // If MFA is not required in the session, redirect to admin
  if (userData?.session?.mfaRequired !== true) {
    return redirect("/admin");
  }

  return (
    <div className="flex justify-center items-center">
      <Card className="w-full max-w-sm backdrop-blur-sm bg-card/95 border-border/50 shadow-xl">
        <MfaVerifyPageHeader />
        <CardContent>
          <Suspense>
            <MfaVerifyForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
