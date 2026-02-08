"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "@/trpc/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FormErrorDisplay } from "@/components/shared/form-error-display"
import { Copy, Check, Eye, EyeOff, ExternalLink, AlertCircle, Lock } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { decryptWithShareToken } from "@/lib/client-crypto"
import { showErrorFromException } from "@/lib/error-toast"

interface TemporaryPasswordShareViewProps {
  token: string
}

export function TemporaryPasswordShareView({ token }: TemporaryPasswordShareViewProps) {
  const { t } = useTranslation()
  const [showPassword, setShowPassword] = React.useState(false)
  const [copied, setCopied] = React.useState<string | null>(null)
  const [decryptedPassword, setDecryptedPassword] = React.useState<string | null>(null)
  const [decryptedTotpSecret, setDecryptedTotpSecret] = React.useState<string | null>(null)
  const [currentTotpCode, setCurrentTotpCode] = React.useState<string | null>(null)
  const [isDecrypting, setIsDecrypting] = React.useState(false)
  const [decryptionError, setDecryptionError] = React.useState<string | null>(null)
  const [totpTimeRemaining, setTotpTimeRemaining] = React.useState<number>(30)
  const hasDecryptedRef = React.useRef(false)
  const totpIntervalRef = React.useRef<NodeJS.Timeout | null>(null)

  const { data, isLoading, error } = trpc.passwords.accessTemporaryShare.useQuery(
    { shareToken: token },
    {
      retry: false,
    }
  )

  // Decrypt password and TOTP code when data is available (only once)
  React.useEffect(() => {
    if (data?.password && !hasDecryptedRef.current && !isDecrypting) {
      setIsDecrypting(true)
      setDecryptionError(null)
      hasDecryptedRef.current = true
      
      const decryptData = async () => {
        try {
          // Decrypt password if encrypted
          if (data.password.passwordEncrypted) {
            console.log("Decrypting password with share token...")
            const decrypted = await decryptWithShareToken(data.password.password, token)
            console.log("Password decrypted successfully")
            setDecryptedPassword(decrypted)
          } else {
            setDecryptedPassword(data.password.password)
          }
          
          // Decrypt TOTP secret if encrypted (client will generate codes from secret)
          if (data.password.totpSecret && data.password.totpEncrypted) {
            console.log("Decrypting TOTP secret with share token...")
            const decrypted = await decryptWithShareToken(data.password.totpSecret, token)
            console.log("TOTP secret decrypted successfully")
            setDecryptedTotpSecret(decrypted)
          } else if (data.password.totpSecret) {
            setDecryptedTotpSecret(data.password.totpSecret)
          }
        } catch (err) {
          console.error("Failed to decrypt temporary share data:", err)
          const errorMessage = err instanceof Error ? err.message : "Failed to decrypt data"
          setDecryptionError(errorMessage)
          toast.error(`Decryption failed: ${errorMessage}`)
          // Fallback to encrypted values if decryption fails
          setDecryptedPassword(data.password.password)
          if (data.password.totpSecret) {
            setDecryptedTotpSecret(data.password.totpSecret)
          }
        } finally {
          setIsDecrypting(false)
        }
      }
      
      decryptData()
    }
  }, [data, token])
  
  // Reset decryption state when token changes
  React.useEffect(() => {
    hasDecryptedRef.current = false
    setDecryptedPassword(null)
    setDecryptedTotpSecret(null)
    setCurrentTotpCode(null)
    setDecryptionError(null)
    setIsDecrypting(false)
    setTotpTimeRemaining(30)
    if (totpIntervalRef.current) {
      clearInterval(totpIntervalRef.current)
      totpIntervalRef.current = null
    }
  }, [token])

  // Generate TOTP code from secret and update every 30 seconds
  React.useEffect(() => {
    if (decryptedTotpSecret && data?.shareInfo?.includeTotp) {
      let lastPeriod = -1
      
      const generateTotpCode = async () => {
        try {
          // Normalize TOTP secret: remove spaces and convert to uppercase (handles Google format)
          const normalizedSecret = decryptedTotpSecret.replace(/\s+/g, "").toUpperCase().trim()
          const { authenticator } = await import("otplib")
          const code = authenticator.generate(normalizedSecret)
          setCurrentTotpCode(code)
        } catch (error) {
          console.error("Failed to generate TOTP code:", error)
          setDecryptionError("Failed to generate TOTP code")
        }
      }
      
      // Calculate time remaining until next TOTP period (30 seconds)
      const updateCountdown = () => {
        const now = Date.now()
        const currentPeriod = Math.floor(now / 30000) // 30 seconds in milliseconds
        const nextPeriod = (currentPeriod + 1) * 30000
        const timeUntilNext = Math.ceil((nextPeriod - now) / 1000)
        
        setTotpTimeRemaining(timeUntilNext)
        
        // Regenerate TOTP code when period changes (new 30-second window starts)
        if (lastPeriod !== -1 && currentPeriod !== lastPeriod) {
          generateTotpCode()
        }
        lastPeriod = currentPeriod
      }
      
      // Generate initial code
      generateTotpCode()
      
      // Initial countdown calculation
      updateCountdown()
      
      // Update countdown and regenerate TOTP every second
      totpIntervalRef.current = setInterval(() => {
        updateCountdown()
      }, 1000)
      
      return () => {
        if (totpIntervalRef.current) {
          clearInterval(totpIntervalRef.current)
          totpIntervalRef.current = null
        }
      }
    }
  }, [decryptedTotpSecret, data?.shareInfo?.includeTotp])

  const handleCopy = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t("clipboard.copied"))
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch (error) { showErrorFromException(error, t("clipboard.copyFailed")) }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              {t("passwords.temporaryShare.accessError")}
            </CardTitle>
            <CardDescription>
              {error?.message || t("passwords.temporaryShare.notFound")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const { password, shareInfo, totpCode } = data

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                {t("passwords.temporaryShare.sharedPassword")}
              </CardTitle>
              <CardDescription className="mt-1">
                {t("passwords.temporaryShare.sharedBy", {
                  name: password.owner.name || password.owner.email,
                })}
              </CardDescription>
            </div>
            {shareInfo.isOneTime && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {t("passwords.temporaryShare.oneTime")}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("common.name")}</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-md border bg-background px-3 py-2 text-sm">
                {password.name}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("passwords.username")}</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-md border bg-background px-3 py-2 text-sm font-mono">
                {password.username}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleCopy(password.username, "username")}
              >
                {copied === "username" ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("common.password")}</label>
            <FormErrorDisplay error={decryptionError} />
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[2.5rem] flex items-center">
                {isDecrypting ? (
                  <span className="text-muted-foreground animate-pulse">Decrypting...</span>
                ) : decryptedPassword ? (
                  showPassword ? (
                    decryptedPassword
                  ) : (
                    "••••••••••••"
                  )
                ) : (
                  <span className="text-muted-foreground">Loading...</span>
                )}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isDecrypting || !decryptedPassword}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => decryptedPassword && handleCopy(decryptedPassword, "password")}
                disabled={isDecrypting || !decryptedPassword}
              >
                {copied === "password" ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {password.url && (
            <div className="space-y-2">
              <label className="text-sm font-medium">URL</label>
              <div className="flex items-center gap-2">
                <a
                  href={password.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm text-blue-600 hover:underline truncate dark:text-blue-400"
                >
                  {password.url}
                </a>
                <Button
                  variant="outline"
                  size="icon"
                  asChild
                >
                  <a
                    href={password.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          )}

          {password.notes && (
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("passwords.notes")}</label>
              <div className="rounded-md border bg-background px-3 py-2 text-sm whitespace-pre-wrap">
                {password.notes}
              </div>
            </div>
          )}

          {password.hasTotp && !data.totpCode && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t("passwords.temporaryShare.totpNote")}
              </AlertDescription>
            </Alert>
          )}

          {data.shareInfo.includeTotp && decryptedTotpSecret && (
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("passwords.totpCode")}</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border bg-background px-3 py-2 text-sm font-mono text-center min-h-[2.5rem] flex items-center justify-center">
                  {isDecrypting ? (
                    <span className="text-muted-foreground animate-pulse">Decrypting...</span>
                  ) : currentTotpCode ? (
                    currentTotpCode
                  ) : (
                    <span className="text-muted-foreground">Generating...</span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => currentTotpCode && handleCopy(currentTotpCode, "totp")}
                  disabled={isDecrypting || !currentTotpCode}
                >
                  {copied === "totp" ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {t("passwords.temporaryShare.totpExpiresIn", { seconds: totpTimeRemaining })}
                </p>
                {totpTimeRemaining > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-1000 ease-linear"
                        style={{ width: `${(totpTimeRemaining / 30) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground tabular-nums">
                      {totpTimeRemaining}s
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <Separator />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="space-y-1">
              {shareInfo.expiresAt && (
                <div>
                  {t("passwords.temporaryShare.expiresAt")}:{" "}
                  {new Date(shareInfo.expiresAt).toLocaleString()}
                </div>
              )}
              {shareInfo.maxAccesses && (
                <div>
                  {t("passwords.temporaryShare.accessCount")}: {shareInfo.accessCount} / {shareInfo.maxAccesses}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

