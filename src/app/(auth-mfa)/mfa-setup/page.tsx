import { Suspense } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { MfaSetupQr } from "@/modules/auth/client/mfa-setup/mfa-setup-qr"
import { MfaSetupForm } from "@/modules/auth/client/mfa-setup/mfa-setup-form"
import { serverTrpc } from "@/trpc/server-caller"
import { redirect } from "next/navigation"
import { MfaSetupPageHeader } from "./mfa-setup-page-header"

export default async function MfaSetupPage() {
  const trpc = await serverTrpc();
  const userData = await trpc.auth.getCurrentUser(); 
  
  // If MFA is already verified, redirect to admin
  if (userData?.session?.mfaVerified === true) {
    return redirect("/admin");
  }

  // Priority check: If session says MFA is required (not setup), redirect to verify
  if (userData?.session?.mfaRequired === true && userData?.session?.mfaSetupRequired !== true) {
    return redirect("/mfa-verify");
  }

  // If MFA setup is not required (check session flag first, then calculated value), redirect to admin
  if (userData?.session?.mfaSetupRequired !== true && !userData?.mfaSetupRequired) {
    return redirect("/admin");
  }

  // User needs MFA setup (either from session flag or user settings) - allow setup
  const { qr } = await trpc.auth.generateMfaQr();

  return (
    <div className="flex justify-center items-center">
      <Card className="w-full max-w-sm backdrop-blur-sm bg-card/95 border-border/50 shadow-xl">
        <MfaSetupPageHeader />
        <CardContent>
          <MfaSetupQr qr={qr} />
          <Suspense>
            <MfaSetupForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
