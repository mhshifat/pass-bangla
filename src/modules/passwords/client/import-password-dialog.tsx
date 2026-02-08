"use client"

import * as React from "react"
import { useState, useTransition, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  Loader2, 
  FileCheck,
  FileX,
  ChevronRight,
  Sparkles
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FormErrorDisplay } from "@/components/shared/form-error-display"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { previewImportAction, commitImportAction, type ImportPreviewResult } from "@/app/admin/passwords/import-actions"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface ImportPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

type ImportFormat = "csv" | "json" | "1password" | "lastpass" | "bitwarden" | "keepass" | "auto"

type ImportStep = "upload" | "preview" | "importing" | "complete"

export function ImportPasswordDialog({
  open,
  onOpenChange,
  onSuccess,
}: ImportPasswordDialogProps) {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<ImportFormat>("auto")
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isDragging, setIsDragging] = useState(false)
  const [step, setStep] = useState<ImportStep>("upload")

  const handleFileChange = useCallback((selectedFile: File) => {
    setFile(selectedFile)
    setPreview(null)
    setError(null)
    setStep("upload")
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile && (droppedFile.name.endsWith('.csv') || 
        droppedFile.name.endsWith('.json') || 
        droppedFile.name.endsWith('.txt') || 
        droppedFile.name.endsWith('.1pif'))) {
      handleFileChange(droppedFile)
    } else {
      setError(t("passwords.import.invalidFileType"))
    }
  }, [handleFileChange, t])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      handleFileChange(selectedFile)
    }
  }

  const handlePreview = async () => {
    if (!file) {
      setError(t("passwords.import.selectFile"))
      return
    }

    setIsPreviewing(true)
    setError(null)
    setStep("preview")

    try {
      const content = await file.text()
      const importFormat = format === "auto" ? undefined : format

      startTransition(async () => {
        try {
          const result = await previewImportAction(content, importFormat)
          setPreview(result)
          setStep("preview")
        } catch (err) {
          setError(err instanceof Error ? err.message : t("passwords.import.previewError"))
          setStep("upload")
        } finally {
          setIsPreviewing(false)
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t("passwords.import.readError"))
      setIsPreviewing(false)
      setStep("upload")
    }
  }

  const handleCommit = async () => {
    if (!preview || preview.validRows === 0) {
      setError(t("passwords.import.noValidPasswords"))
      return
    }

    setIsCommitting(true)
    setError(null)
    setStep("importing")

    const validPasswords = preview.passwords.filter(
      (p) => !p.errors || p.errors.length === 0
    )

    startTransition(async () => {
      try {
        const result = await commitImportAction(validPasswords, true)

        if (result.success) {
          toast.success(
            t("passwords.import.success", { count: result.created })
          )
          setStep("complete")
          setTimeout(() => {
            onSuccess?.()
            handleClose()
          }, 1500)
        } else {
          setError(
            t("passwords.import.commitError", {
              created: result.created,
              errors: result.errors,
            })
          )
          setStep("preview")
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("passwords.import.commitError"))
        setStep("preview")
      } finally {
        setIsCommitting(false)
      }
    })
  }

  const handleClose = () => {
    setFile(null)
    setPreview(null)
    setError(null)
    setFormat("auto")
    setStep("upload")
    setIsDragging(false)
    onOpenChange(false)
  }

  const formatLabel = (fmt: ImportFormat) => {
    const labels: Record<ImportFormat, string> = {
      auto: t("passwords.import.autoDetect"),
      csv: "CSV",
      json: "JSON",
      "1password": "1Password",
      lastpass: "LastPass",
      bitwarden: "Bitwarden",
      keepass: "KeePass",
    }
    return labels[fmt]
  }

  const getFileIcon = () => {
    if (!file) return <Upload className="h-12 w-12 text-muted-foreground" />
    if (file.name.endsWith('.csv')) return <FileText className="h-12 w-12 text-blue-500" />
    if (file.name.endsWith('.json')) return <FileText className="h-12 w-12 text-green-500" />
    return <FileText className="h-12 w-12 text-purple-500" />
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-2xl">{t("passwords.import.title")}</DialogTitle>
              <DialogDescription className="mt-1">
                {t("passwords.import.description")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-2">
          {/* Step Indicator */}
          <div className="flex items-center gap-2 text-sm">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors",
              step === "upload" ? "bg-primary text-primary-foreground" : 
              step === "preview" || step === "importing" || step === "complete" 
                ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}>
              <div className={cn(
                "h-5 w-5 rounded-full flex items-center justify-center text-xs font-semibold",
                step === "upload" ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"
              )}>
                1
              </div>
              <span className="font-medium">{t("passwords.import.stepUpload")}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors",
              step === "preview" ? "bg-primary text-primary-foreground" : 
              step === "importing" || step === "complete" 
                ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}>
              <div className={cn(
                "h-5 w-5 rounded-full flex items-center justify-center text-xs font-semibold",
                step === "preview" ? "bg-primary-foreground text-primary" : 
                step === "importing" || step === "complete" 
                  ? "bg-primary text-primary-foreground" : "bg-muted-foreground text-muted"
              )}>
                2
              </div>
              <span className="font-medium">{t("passwords.import.stepPreview")}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors",
              step === "importing" ? "bg-primary text-primary-foreground" : 
              step === "complete" ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
            )}>
              <div className={cn(
                "h-5 w-5 rounded-full flex items-center justify-center text-xs font-semibold",
                step === "importing" ? "bg-primary-foreground text-primary" : 
                step === "complete" ? "bg-white text-green-500" : "bg-muted-foreground text-muted"
              )}>
                {step === "complete" ? <CheckCircle2 className="h-3 w-3" /> : "3"}
              </div>
              <span className="font-medium">{t("passwords.import.stepImport")}</span>
            </div>
          </div>

          {/* Upload Step */}
          {step === "upload" && (
            <div className="space-y-4">
              {/* Drag and Drop Area */}
              <Card className={cn(
                "border-2 border-dashed transition-all duration-200",
                isDragging ? "border-primary bg-primary/5 scale-[1.02]" : 
                file ? "border-primary/50 bg-primary/5" : "border-muted-foreground/25"
              )}>
                <CardContent className="p-8">
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className="flex flex-col items-center justify-center gap-4 text-center"
                  >
                    {getFileIcon()}
                    <div className="space-y-2">
                      {file ? (
                        <>
                          <div className="flex items-center gap-2 justify-center">
                            <FileCheck className="h-5 w-5 text-green-500" />
                            <p className="font-semibold text-lg">{file.name}</p>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {(file.size / 1024).toFixed(2)} KB
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-lg font-semibold">
                            {t("passwords.import.dragDropTitle")}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {t("passwords.import.dragDropDescription")}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        id="file-upload"
                        accept=".csv,.json,.txt,.1pif"
                        onChange={handleFileInputChange}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant={file ? "outline" : "default"}
                        onClick={() => document.getElementById("file-upload")?.click()}
                        className="relative"
                      >
                        {file ? (
                          <>
                            <FileX className="mr-2 h-4 w-4" />
                            {t("passwords.import.changeFile")}
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            {t("passwords.import.browseFiles")}
                          </>
                        )}
                      </Button>
                      {file && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setFile(null)
                            setPreview(null)
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Format Selection */}
              {file && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 space-y-2">
                        <label className="text-sm font-medium">
                          {t("passwords.import.formatLabel")}
                        </label>
                        <Select value={format} onValueChange={(value) => setFormat(value as ImportFormat)}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">{t("passwords.import.autoDetect")}</SelectItem>
                            <SelectItem value="csv">CSV</SelectItem>
                            <SelectItem value="json">JSON</SelectItem>
                            <SelectItem value="1password">1Password</SelectItem>
                            <SelectItem value="lastpass">LastPass</SelectItem>
                            <SelectItem value="bitwarden">Bitwarden</SelectItem>
                            <SelectItem value="keepass">KeePass</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="pt-8">
                        <Button
                          onClick={handlePreview}
                          disabled={isPreviewing || isPending}
                          size="lg"
                          className="min-w-[140px]"
                        >
                          {isPreviewing ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {t("passwords.import.previewing")}
                            </>
                          ) : (
                            <>
                              <FileText className="mr-2 h-4 w-4" />
                              {t("passwords.import.preview")}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Preview Step */}
          {step === "preview" && preview && (
            <div className="space-y-4">
              {/* Statistics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">
                          {t("passwords.import.totalRows")}
                        </p>
                        <p className="text-2xl font-bold">{preview.totalRows}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                        <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">
                          {t("passwords.import.validRows")}
                        </p>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {preview.validRows}
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/20">
                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                {preview.invalidRows > 0 && (
                  <Card>
                    <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">
                          {t("passwords.import.invalidRows")}
                        </p>
                        <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                          {preview.invalidRows}
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/20">
                        <FileX className="h-5 w-5 text-red-600 dark:text-red-400" />
                      </div>
                    </div>
                  </CardContent>
                  </Card>
                )}
              </div>

              {/* Errors and Warnings */}
              {preview.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-semibold">
                        {t("passwords.import.errors", { count: preview.errors.length })}
                      </p>
                      <ScrollArea className="h-32">
                        <ul className="text-xs space-y-1.5">
                          {preview.errors.slice(0, 10).map((err, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-destructive mt-0.5">•</span>
                              <span>{err}</span>
                            </li>
                          ))}
                          {preview.errors.length > 10 && (
                            <li className="text-muted-foreground">
                              ... {t("passwords.import.moreErrors", { count: preview.errors.length - 10 })}
                            </li>
                          )}
                        </ul>
                      </ScrollArea>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {preview.warnings.length > 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-semibold">
                        {t("passwords.import.warnings", { count: preview.warnings.length })}
                      </p>
                      <ScrollArea className="h-32">
                        <ul className="text-xs space-y-1.5">
                          {preview.warnings.slice(0, 10).map((warn, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-yellow-600 dark:text-yellow-400 mt-0.5">•</span>
                              <span>{warn}</span>
                            </li>
                          ))}
                          {preview.warnings.length > 10 && (
                            <li className="text-muted-foreground">
                              ... {t("passwords.import.moreWarnings", { count: preview.warnings.length - 10 })}
                            </li>
                          )}
                        </ul>
                      </ScrollArea>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Preview Table */}
              {preview.validRows > 0 && (
                <Card>
                  <CardContent className="p-0">
                    <div className="p-4 border-b bg-muted/50">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        {t("passwords.import.previewTable")}
                      </h3>
                    </div>
                    <ScrollArea className="h-64">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="p-3 text-left font-semibold">{t("common.name")}</th>
                            <th className="p-3 text-left font-semibold">{t("auth.username")}</th>
                            <th className="p-3 text-left font-semibold">{t("passwords.url")}</th>
                            <th className="p-3 text-center font-semibold">{t("common.status")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.passwords.slice(0, 50).map((pwd, i) => (
                            <tr key={i} className="border-t hover:bg-muted/30 transition-colors">
                              <td className="p-3 font-medium">{pwd.name}</td>
                              <td className="p-3">{pwd.username}</td>
                              <td className="p-3 text-xs text-muted-foreground truncate max-w-xs">
                                {pwd.url || "-"}
                              </td>
                              <td className="p-3 text-center">
                                {pwd.errors && pwd.errors.length > 0 ? (
                                  <Badge variant="destructive" className="text-xs">
                                    <FileX className="h-3 w-3 mr-1" />
                                    {t("common.error")}
                                  </Badge>
                                ) : (
                                  <Badge variant="default" className="bg-green-600 text-xs">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    {t("common.success")}
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                          {preview.passwords.length > 50 && (
                            <tr>
                              <td colSpan={4} className="p-3 text-center text-muted-foreground text-xs bg-muted/30">
                                {t("passwords.import.showingFirst", { count: 50, total: preview.passwords.length })}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Importing Step */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <div className="text-center space-y-2">
                <p className="text-lg font-semibold">{t("passwords.import.importing")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("passwords.import.importingDescription")}
                </p>
              </div>
              <Progress value={66} className="w-full max-w-md" />
            </div>
          )}

          {/* Complete Step */}
          {step === "complete" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="p-4 rounded-full bg-green-100 dark:bg-green-900/20">
                <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-lg font-semibold">{t("passwords.import.complete")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("passwords.import.completeDescription")}
                </p>
              </div>
            </div>
          )}

          {/* Error Display */}
          <FormErrorDisplay error={error} />
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isCommitting || isPending}>
            {step === "complete" ? t("common.close") : t("common.cancel")}
          </Button>
          {step === "preview" && preview && preview.validRows > 0 && (
            <Button
              onClick={handleCommit}
              disabled={isCommitting || isPending}
              size="lg"
            >
              {isCommitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("passwords.import.importing")}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {t("passwords.import.importButton", { count: preview.validRows })}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
