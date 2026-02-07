"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslation } from "react-i18next"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { startRegistration } from "@simplewebauthn/browser"
import { Fingerprint, Loader2, Plus, Trash2, Smartphone, Laptop, Key } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDistanceToNow } from "date-fns"
import { showErrorFromException } from "@/lib/error-toast"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export function PasskeyManagement() {
    const { t } = useTranslation()
    const [isSupported, setIsSupported] = useState(false)
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
    const [passkeyName, setPasskeyName] = useState("")
    const [isRegistering, setIsRegistering] = useState(false)
    const [deletePasskeyId, setDeletePasskeyId] = useState<string | null>(null)

    const utils = trpc.useUtils()
    const { data, isLoading } = trpc.auth.getUserPasskeys.useQuery()
    const generateOptions = trpc.auth.generatePasskeyRegistrationOptions.useMutation()
    const verifyRegistration = trpc.auth.verifyPasskeyRegistration.useMutation()
    const deletePasskey = trpc.auth.deletePasskey.useMutation()

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

    const handleAddPasskey = async () => {
        if (!passkeyName.trim()) {
            toast.error(t("passkey.nameRequired"))
            return
        }

        setIsRegistering(true)

        try {
            // Step 1: Get registration options from server
            const { options } = await generateOptions.mutateAsync()
            
            // Step 2: Prompt user to create a passkey
            // Note: @simplewebauthn/browser v10+ uses { optionsJSON } syntax
            const registrationResponse = await startRegistration({ optionsJSON: options })

            // Step 3: Verify registration response
            await verifyRegistration.mutateAsync({
                response: registrationResponse,
                name: passkeyName,
            })

            toast.success(t("passkey.addedSuccessfully"))
            setIsAddDialogOpen(false)
            setPasskeyName("")
            utils.auth.getUserPasskeys.invalidate()
        } catch (error: unknown) {
            console.error("Passkey registration error:", error)
            
            const errorName = error instanceof Error ? error.name : ""
            if (errorName === "NotAllowedError") {
                toast.error(t("passkey.registrationCancelled"))
            } else {
                showErrorFromException(error, t("passkey.registrationFailed"))
            }
        } finally {
            setIsRegistering(false)
        }
    }

    const handleDeletePasskey = async () => {
        if (!deletePasskeyId) return

        try {
            await deletePasskey.mutateAsync({ passkeyId: deletePasskeyId })
            toast.success(t("passkey.deletedSuccessfully"))
            setDeletePasskeyId(null)
            utils.auth.getUserPasskeys.invalidate()
        } catch (error: unknown) {
            console.error("Delete passkey error:", error)
            showErrorFromException(error, t("passkey.deleteFailed"))
        }
    }

    const getDeviceIcon = (deviceType?: string | null) => {
        if (deviceType === "multiDevice") {
            return <Key className="h-4 w-4" />
        }
        // Default to smartphone icon for platform authenticators
        return <Smartphone className="h-4 w-4" />
    }

    if (!isSupported) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Fingerprint className="h-5 w-5" />
                        {t("passkey.title")}
                    </CardTitle>
                    <CardDescription>{t("passkey.notSupported")}</CardDescription>
                </CardHeader>
            </Card>
        )
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Fingerprint className="h-5 w-5" />
                                {t("passkey.title")}
                            </CardTitle>
                            <CardDescription>{t("passkey.description")}</CardDescription>
                        </div>
                        <Button onClick={() => setIsAddDialogOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            {t("passkey.addPasskey")}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : data?.passkeys && data.passkeys.length > 0 ? (
                        <div className="space-y-4">
                            {data.passkeys.map((passkey) => (
                                <div
                                    key={passkey.id}
                                    className="flex items-center justify-between p-4 border rounded-lg"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-muted rounded-lg">
                                            {getDeviceIcon(passkey.deviceType)}
                                        </div>
                                        <div>
                                            <p className="font-medium">{passkey.name}</p>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <span>
                                                    {t("passkey.added")}{" "}
                                                    {formatDistanceToNow(new Date(passkey.createdAt), {
                                                        addSuffix: true,
                                                    })}
                                                </span>
                                                {passkey.lastUsedAt && (
                                                    <>
                                                        <span>•</span>
                                                        <span>
                                                            {t("passkey.lastUsed")}{" "}
                                                            {formatDistanceToNow(new Date(passkey.lastUsedAt), {
                                                                addSuffix: true,
                                                            })}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setDeletePasskeyId(passkey.id)}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            <Fingerprint className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>{t("passkey.noPasskeys")}</p>
                            <p className="text-sm mt-2">{t("passkey.noPasskeysDescription")}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Add Passkey Dialog */}
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("passkey.addPasskey")}</DialogTitle>
                        <DialogDescription>{t("passkey.addPasskeyDescription")}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="passkey-name">{t("passkey.name")}</Label>
                            <Input
                                id="passkey-name"
                                placeholder={t("passkey.namePlaceholder")}
                                value={passkeyName}
                                onChange={(e) => setPasskeyName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        handleAddPasskey()
                                    }
                                }}
                                disabled={isRegistering}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsAddDialogOpen(false)}
                            disabled={isRegistering}
                        >
                            {t("common.cancel")}
                        </Button>
                        <Button onClick={handleAddPasskey} disabled={isRegistering || !passkeyName.trim()}>
                            {isRegistering ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t("passkey.creating")}
                                </>
                            ) : (
                                <>
                                    <Plus className="mr-2 h-4 w-4" />
                                    {t("passkey.create")}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deletePasskeyId} onOpenChange={() => setDeletePasskeyId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("passkey.deleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("passkey.deleteDescription")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeletePasskey} className="bg-destructive hover:bg-destructive/90">
                            {t("common.delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

