"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { trpc } from "@/trpc/client"
import { toast } from "sonner"
import { Loader2, Copy, Check, AlertTriangle, RefreshCw, Download } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { showErrorFromException } from "@/lib/error-toast"

export function RecoveryCodesManager() {
  const { t } = useTranslation()
  const [generatedCodes, setGeneratedCodes] = useState<string[] | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const utils = trpc.useUtils()
  const { data: codesData, isLoading } = trpc.auth.listRecoveryCodes.useQuery()
  const { data: mfaSettings } = trpc.settings.getMfaSettings.useQuery()
  const generateCodes = trpc.auth.generateRecoveryCodes.useMutation({
    onSuccess: (data) => {
      setGeneratedCodes(data.codes)
      utils.auth.listRecoveryCodes.invalidate()
      toast.success(t("mfa.recoveryCodesGenerated"))
    },
    onError: (error) => {
      showErrorFromException(error, t("mfa.recoveryCodesGenerateFailed"))
    },
  })

  const handleCopy = async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
      toast.success(t("mfa.codeCopied"))
    } catch {
      toast.error(t("mfa.codeCopyFailed"))
    }
  }

  const handleCopyAll = async () => {
    if (!generatedCodes) return
    try {
      await navigator.clipboard.writeText(generatedCodes.join("\n"))
      toast.success(t("mfa.allCodesCopied"))
    } catch {
      toast.error(t("mfa.codesCopyFailed"))
    }
  }

  const handleDownload = () => {
    if (!generatedCodes) return
    
    const content = [
      t("mfa.recoveryCodes"),
      "==============",
      "",
      t("mfa.saveCodesSecure"),
      "",
      t("mfa.importantRecoveryCodes"),
      "",
      ...generatedCodes.map((code, index) => `${index + 1}. ${code}`),
      "",
      `${t("mfa.generated")}: ${new Date().toLocaleString()}`,
      "",
      t("mfa.securityNotice") + ":",
      t("mfa.securityNotice1"),
      t("mfa.securityNotice2"),
      t("mfa.securityNotice3"),
      t("mfa.securityNotice4"),
    ].join("\n")

    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `recovery-codes-${new Date().toISOString().split("T")[0]}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success(t("mfa.recoveryCodesDownloaded"))
  }

  const unusedCount = codesData?.unusedCount ?? 0
  const totalCount = codesData?.totalCount ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("mfa.recoveryCodes")}</CardTitle>
        <CardDescription>
          {t("mfa.recoveryCodesDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {!mfaSettings?.recoveryCodesEnabled ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t("mfa.recoveryCodesNotEnabled")}
                </AlertDescription>
              </Alert>
            ) : totalCount === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t("mfa.noRecoveryCodes")}
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {t("mfa.unusedCodes", { unused: unusedCount, total: totalCount })}
                  </p>
                  {unusedCount === 0 && (
                    <Badge variant="destructive">{t("mfa.allCodesUsed")}</Badge>
                  )}
                </div>
                {unusedCount === 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {t("mfa.allCodesUsedDescription")}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant={totalCount === 0 ? "default" : "outline"}
                  disabled={generateCodes.isPending || !mfaSettings?.recoveryCodesEnabled}
                  className="w-full"
                >
                  {generateCodes.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("mfa.generating")}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {totalCount === 0 ? t("mfa.generateRecoveryCodes") : t("mfa.generateNewCodes")}
                    </>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{t("mfa.recoveryCodes")}</DialogTitle>
                  <DialogDescription>
                    {t("mfa.saveCodesSafe")}
                  </DialogDescription>
                </DialogHeader>
                {generatedCodes ? (
                  <div className="space-y-4">
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>{t("mfa.important")}:</strong> {t("mfa.saveCodesNow")}
                      </AlertDescription>
                    </Alert>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {generatedCodes.map((code, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 border rounded-lg font-mono text-sm"
                        >
                          <span>{code}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopy(code, index)}
                            className="h-8 w-8"
                          >
                            {copiedIndex === index ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleCopyAll} variant="outline" className="flex-1">
                        <Copy className="mr-2 h-4 w-4" />
                        {t("mfa.copyAll")}
                      </Button>
                      <Button onClick={handleDownload} variant="outline" className="flex-1">
                        <Download className="mr-2 h-4 w-4" />
                        {t("common.download") || "Download"}
                      </Button>
                      <Button
                        onClick={() => setGeneratedCodes(null)}
                        variant="default"
                        className="flex-1"
                      >
                        {t("mfa.iveSavedThem")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">
                      {t("mfa.clickToGenerate")}
                    </p>
                    <Button
                      onClick={() => generateCodes.mutate()}
                      disabled={generateCodes.isPending}
                    >
                      {generateCodes.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t("mfa.generating")}
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          {t("mfa.generateCodes")}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </>
        )}
      </CardContent>
    </Card>
  )
}
