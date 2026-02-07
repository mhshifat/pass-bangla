"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useTranslation } from "react-i18next"
import { trpc } from "@/trpc/client"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { startAuthentication } from "@simplewebauthn/browser"
import { Fingerprint, Loader2 } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { showErrorFromException } from "@/lib/error-toast"

export function PasskeyLoginButton() {
    const { t } = useTranslation()
    const router = useRouter()
    const [isSupported, setIsSupported] = useState(false)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [email, setEmail] = useState("")
    const [isAuthenticating, setIsAuthenticating] = useState(false)

    const generateOptions = trpc.auth.generatePasskeyAuthenticationOptions.useMutation()
    const verifyAuthentication = trpc.auth.verifyPasskeyAuthentication.useMutation()

    useEffect(() => {
        // Check if WebAuthn is supported
        const checkSupport = async () => {
            if (typeof window === "undefined") return

            const supported =
                window.PublicKeyCredential !== undefined &&
                typeof window.PublicKeyCredential === "function"

            setIsSupported(supported)
        }

        checkSupport()
    }, [])

    const handlePasskeyLogin = async () => {
        if (!email) {
            toast.error(t("auth.emailRequired"))
            return
        }

        setIsAuthenticating(true)

        try {
            // Step 1: Get authentication options from server
            const { options } = await generateOptions.mutateAsync({ email })
            
            // Step 2: Prompt user to authenticate with their passkey
            // Note: @simplewebauthn/browser v10+ uses { optionsJSON } syntax
            const authResponse = await startAuthentication({ optionsJSON: options })

            // Step 3: Verify authentication response
            const result = await verifyAuthentication.mutateAsync({
                email,
                response: authResponse,
            })

            if (result.success) {
                toast.success(t("auth.loginSuccess"))
                setIsDialogOpen(false)
                router.push("/admin")
                router.refresh()
            }
        } catch (error: unknown) {
            console.error("Passkey authentication error:", error)
            
            const errorMessage = error instanceof Error ? error.message : ""
            const errorName = error instanceof Error ? error.name : ""

            if (errorMessage.includes("No passkeys found")) {
                toast.error(t("passkey.noPasskeysFound"))
            } else if (errorName === "NotAllowedError") {
                toast.error(t("passkey.authenticationCancelled"))
            } else {
                showErrorFromException(error, t("passkey.authenticationFailed"))
            }
        } finally {
            setIsAuthenticating(false)
        }
    }

    if (!isSupported) {
        return null
    }

    return (
        <>
            <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setIsDialogOpen(true)}
            >
                <Fingerprint className="mr-2 h-4 w-4" />
                {t("passkey.signInWithPasskey")}
            </Button>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("passkey.signInWithPasskey")}</DialogTitle>
                        <DialogDescription>
                            {t("passkey.enterEmailForPasskey")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="passkey-email">{t("auth.email")}</Label>
                            <Input
                                id="passkey-email"
                                type="email"
                                placeholder={t("auth.emailPlaceholder")}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        handlePasskeyLogin()
                                    }
                                }}
                                disabled={isAuthenticating}
                            />
                        </div>

                        <Button
                            onClick={handlePasskeyLogin}
                            disabled={isAuthenticating || !email}
                            className="w-full"
                        >
                            {isAuthenticating ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t("passkey.authenticating")}
                                </>
                            ) : (
                                <>
                                    <Fingerprint className="mr-2 h-4 w-4" />
                                    {t("passkey.continue")}
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}

